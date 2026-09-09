const prisma = require('../config/db');
const { dispatchNotification } = require('../services/fcm.service');
const { SHIPMENT_STATUS, TIMING } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * 72-Hour Automatic Delivery Confirmation Job
 * Requirement: BR-20, FR-CO-21, UC-9 alternative flow 9.3
 */
async function runAutoCompleteShipments() {
  try {
    const thresholdDate = new Date(Date.now() - TIMING.AUTO_COMPLETION_HOURS * 60 * 60 * 1000);

    const eligibleShipments = await prisma.shipment.findMany({
      where: {
        status: SHIPMENT_STATUS.DELIVERED,
        updatedAt: { lte: thresholdDate },
      },
      include: {
        trip: true,
      },
    });

    if (eligibleShipments.length === 0) {
      return;
    }

    logger.info(`[JOB] Running 72-hour auto-completion on ${eligibleShipments.length} shipment(s)`);

    const now = new Date();

    for (const shipment of eligibleShipments) {
      await prisma.$transaction([
        prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            status: SHIPMENT_STATUS.COMPLETED,
            completedAt: now,
            autoCompletedAt: now,
          },
        }),
        prisma.trip.updateMany({
          where: { shipmentId: shipment.id },
          data: { completedAt: now, isTrackingActive: false },
        }),
        prisma.user.update({
          where: { id: shipment.trip.driverId },
          data: { completedTripsCount: { increment: 1 } },
        }),
        prisma.vehicle.update({
          where: { id: shipment.trip.vehicleId },
          data: { availabilityStatus: 'AVAILABLE' },
        }),
      ]);

      // Notify Cargo Owner and Driver (FR-NC-9)
      await dispatchNotification({
        recipientId: shipment.cargoOwnerId,
        type: 'DELIVERY_CONFIRMED',
        title: 'Shipment Automatically Completed',
        message: `Shipment ${shipment.shipmentNumber} has been automatically marked completed after 72 hours of delivery (BR-20).`,
        relatedShipmentId: shipment.id,
      });

      await dispatchNotification({
        recipientId: shipment.trip.driverId,
        type: 'DELIVERY_CONFIRMED',
        title: 'Shipment Completed',
        message: `Shipment ${shipment.shipmentNumber} has been completed. You are now eligible to receive ratings.`,
        relatedShipmentId: shipment.id,
      });
    }
  } catch (error) {
    logger.error('[JOB] Error in runAutoCompleteShipments:', error);
  }
}

module.exports = {
  runAutoCompleteShipments,
};
