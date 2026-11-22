const prisma = require('../config/db');
const { dispatchNotification } = require('../services/fcm.service');
const { TIMING, SHIPMENT_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * 120-Second Tracking Interruption Watchdog Job
 * Requirement: FR-RT-8, FR-RT-8, FR-NC-7, Table 3.20
 */
let running = false;

async function runTrackingInterruptionCheck() {
  if (running) return; // a slow run must not overlap the next 30-second tick (C-36)
  running = true;
  try {
    const thresholdDate = new Date(Date.now() - TIMING.TRACKING_INTERRUPTION_THRESHOLD_SEC * 1000);

    // Find trips in the tracking period that have had no position updates for > 120s
    const interruptedTrips = await prisma.trip.findMany({
      where: {
        isTrackingActive: true,
        isInterrupted: false,
        // A trip that never reported a position counts as interrupted once the threshold has passed
        // since it last changed state (C-36)
        OR: [
          { lastPositionAt: { lte: thresholdDate } },
          { lastPositionAt: null, updatedAt: { lte: thresholdDate } },
        ],
        // The whole tracking period is watched, not only In Transit (FR-RT-8)
        shipment: { status: { in: [SHIPMENT_STATUS.REACHED_PICKUP, SHIPMENT_STATUS.CARGO_LOADED, SHIPMENT_STATUS.IN_TRANSIT] } },
      },
      include: {
        shipment: true,
      },
    });

    if (interruptedTrips.length === 0) return;

    logger.info(`[JOB] Detected ${interruptedTrips.length} active trip(s) with tracking interruption (>120s)`);

    for (const trip of interruptedTrips) {
      // Flip the flag only if still unflagged, so a position that just arrived is not overwritten
      const flagged = await prisma.trip.updateMany({
        where: { id: trip.id, isInterrupted: false },
        data: { isInterrupted: true },
      });
      if (flagged.count !== 1) continue;

      // Notify Cargo Owner (FR-NC-7, Table 3.20)
      await dispatchNotification({
        recipientId: trip.shipment.cargoOwnerId,
        type: 'TRACKING_UNAVAILABLE_OR_RESUMED',
        title: 'Live Tracking Interrupted',
        message: `Live GPS tracking for shipment ${trip.shipment.shipmentNumber} is temporarily unavailable. Showing last known position.`,
        relatedShipmentId: trip.shipmentId,
      });
    }
  } catch (error) {
    logger.error('[JOB] Error in runTrackingInterruptionCheck:', error);
  } finally {
    running = false;
  }
}

module.exports = {
  runTrackingInterruptionCheck,
};
