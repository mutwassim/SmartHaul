const prisma = require('../config/db');
const { dispatchNotification } = require('../services/fcm.service');
const { TIMING, SHIPMENT_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * 120-Second Tracking Interruption Watchdog Job
 * Requirement: FR-RT-11, FR-CO-18, FR-NC-8, Table 3.20
 */
async function runTrackingInterruptionCheck() {
  try {
    const thresholdDate = new Date(Date.now() - TIMING.TRACKING_INTERRUPTION_THRESHOLD_SEC * 1000);

    // Find active in-transit trips that have had no position updates for > 120s
    const interruptedTrips = await prisma.trip.findMany({
      where: {
        isTrackingActive: true,
        isInterrupted: false,
        lastPositionAt: { lte: thresholdDate },
        shipment: { status: SHIPMENT_STATUS.IN_TRANSIT },
      },
      include: {
        shipment: true,
      },
    });

    if (interruptedTrips.length === 0) return;

    logger.info(`[JOB] Detected ${interruptedTrips.length} active trip(s) with tracking interruption (>120s)`);

    for (const trip of interruptedTrips) {
      await prisma.trip.update({
        where: { id: trip.id },
        data: { isInterrupted: true },
      });

      // Notify Cargo Owner (FR-NC-8, Table 3.20)
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
  }
}

module.exports = {
  runTrackingInterruptionCheck,
};
