const prisma = require('../config/db');
const { calculateHaversineDistance } = require('../services/osrm.service');
const { TIMING, SHIPMENT_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

const MAX_PATH_POINTS = 50;

const legKm = (a, b) => calculateHaversineDistance(a.latitude, a.longitude, b.latitude, b.longitude).distanceKm;

/**
 * Reduces detailed GPS positions to the summary kept after retention: route, distance and duration
 * Requirement: BR-17, FR-RT-11
 * @param positions  Positions sorted by recordedAt ascending
 * @param loadedFrom Time cargo was loaded; distance after it counts as loaded distance (optional)
 */
function buildRouteSummary(positions, loadedFrom = null) {
  let totalKm = 0;
  let loadedKm = 0;

  for (let i = 1; i < positions.length; i++) {
    const km = legKm(positions[i - 1], positions[i]);
    totalKm += km;
    if (loadedFrom && positions[i - 1].recordedAt >= loadedFrom) loadedKm += km;
  }

  const step = Math.max(1, Math.ceil(positions.length / MAX_PATH_POINTS));
  const path = positions
    .filter((_, index) => index % step === 0 || index === positions.length - 1)
    .map((p) => [p.latitude, p.longitude]);

  const durationMin =
    positions.length > 1
      ? Math.round((positions[positions.length - 1].recordedAt - positions[0].recordedAt) / 60000)
      : 0;

  return {
    totalKm: Math.round(totalKm * 10) / 10,
    loadedKm: Math.round(loadedKm * 10) / 10,
    durationMin,
    positionCount: positions.length,
    path,
  };
}

/**
 * 90-Day GPS Position Retention Cleanup Job
 * Requirement: BR-17, SEC-14, FR-RT-11, Table 3.20
 */
async function runTrackingRetentionCleanup() {
  try {
    const thresholdDate = new Date(Date.now() - TIMING.POSITION_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // Find trips belonging to completed or cancelled shipments older than 90 days
    const expiredTrips = await prisma.trip.findMany({
      where: {
        shipment: {
          status: { in: [SHIPMENT_STATUS.COMPLETED, SHIPMENT_STATUS.CANCELLED] },
          updatedAt: { lte: thresholdDate },
          // Detail is kept for longer while a complaint is open (BR-17)
          complaints: { none: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } },
        },
      },
      select: { id: true, shipmentId: true },
    });

    if (expiredTrips.length === 0) return;

    let deletedCount = 0;

    // Summarise first, then delete, in one transaction per trip so no history is lost on failure
    for (const trip of expiredTrips) {
      const positions = await prisma.tripPosition.findMany({
        where: { tripId: trip.id },
        orderBy: { recordedAt: 'asc' },
        select: { latitude: true, longitude: true, recordedAt: true },
      });

      if (positions.length === 0) continue;

      const loadedLog = await prisma.tripStatusLog.findFirst({
        where: { tripId: trip.id, status: SHIPMENT_STATUS.CARGO_LOADED },
        orderBy: { timestamp: 'asc' },
      });
      const summary = buildRouteSummary(positions, loadedLog ? loadedLog.timestamp : null);

      const [, , deleted] = await prisma.$transaction([
        prisma.routeSummary.upsert({
          where: { tripId: trip.id },
          create: { tripId: trip.id, shipmentId: trip.shipmentId, ...summary },
          update: summary,
        }),
        prisma.trip.update({
          where: { id: trip.id },
          data: { totalDistanceKm: summary.totalKm, loadedDistanceKm: summary.loadedKm },
        }),
        prisma.tripPosition.deleteMany({ where: { tripId: trip.id } }),
      ]);
      deletedCount += deleted.count;
    }

    logger.info(
      `[JOB] Summarised and pruned ${deletedCount} detailed GPS position records older than 90 days across ${expiredTrips.length} trip(s) (BR-17, SEC-14)`
    );
  } catch (error) {
    logger.error('[JOB] Error in runTrackingRetentionCleanup:', error);
  }
}

module.exports = {
  runTrackingRetentionCleanup,
  buildRouteSummary,
};
