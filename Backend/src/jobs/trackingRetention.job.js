const prisma = require('../config/db');
const { TIMING, SHIPMENT_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * 90-Day GPS Position Retention Cleanup Job
 * Requirement: BR-17, SEC-14, FR-RT-5, Table 3.20
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
        },
      },
      select: { id: true },
    });

    if (expiredTrips.length === 0) return;

    const tripIds = expiredTrips.map((t) => t.id);

    const deleteResult = await prisma.tripPosition.deleteMany({
      where: {
        tripId: { in: tripIds },
      },
    });

    logger.info(
      `[JOB] Pruned ${deleteResult.count} detailed GPS position records older than 90 days across ${tripIds.length} trip(s) (BR-17, SEC-14)`
    );
  } catch (error) {
    logger.error('[JOB] Error in runTrackingRetentionCleanup:', error);
  }
}

module.exports = {
  runTrackingRetentionCleanup,
};
