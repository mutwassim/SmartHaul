const prisma = require('../config/db');
const { dispatchNotification } = require('../services/fcm.service');
const { SHIPMENT_STATUS, TIMING } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * 72-Hour Automatic Delivery Confirmation Job
 * Requirement: BR-20, FR-CO-13, UC-9 alternative flow 9.3
 */
let running = false;

const OPEN_COMPLAINT_STATUSES = ['PENDING', 'UNDER_REVIEW'];

async function runAutoCompleteShipments() {
  if (running) return;
  running = true;
  try {
    const thresholdDate = new Date(Date.now() - TIMING.AUTO_COMPLETION_HOURS * 60 * 60 * 1000);

    const eligibleShipments = await prisma.shipment.findMany({
      where: {
        status: SHIPMENT_STATUS.DELIVERED,
        OR: [
          { deliveredAt: { lte: thresholdDate } },
          { deliveredAt: null, updatedAt: { lte: thresholdDate } },
        ],
        // A disputed shipment waits for the admin decision (C-35)
        complaints: { none: { status: { in: OPEN_COMPLAINT_STATUSES } } },
      },
      include: {
        trip: true,
      },
      take: 200,
    });

    if (eligibleShipments.length === 0) {
      return;
    }

    logger.info(`[JOB] Running 72-hour auto-completion on ${eligibleShipments.length} shipment(s)`);

    // Each shipment is handled on its own: one bad record must not stop the rest (C-35)
    for (const shipment of eligibleShipments) {
      try {
        const now = new Date();
        const completed = await prisma.$transaction(async (tx) => {
          // Compare-and-set: if the owner confirmed in the meantime, this does nothing and nothing is counted twice
          const moved = await tx.shipment.updateMany({
            where: { id: shipment.id, status: SHIPMENT_STATUS.DELIVERED },
            data: { status: SHIPMENT_STATUS.COMPLETED, completedAt: now, autoCompletedAt: now },
          });
          if (moved.count !== 1) return false;

          if (shipment.trip) {
            await tx.trip.updateMany({
              where: { shipmentId: shipment.id },
              data: { completedAt: now, isTrackingActive: false },
            });
            await tx.user.update({
              where: { id: shipment.trip.driverId },
              data: { completedTripsCount: { increment: 1 } },
            });
            await tx.vehicle.update({
              where: { id: shipment.trip.vehicleId },
              data: { availabilityStatus: 'AVAILABLE' },
            });
          } else {
            logger.warn(`[JOB] Shipment ${shipment.shipmentNumber} had no trip; completed without driver updates`);
          }
          return true;
        });

        if (!completed) continue;

        // Notify Cargo Owner and Driver (FR-NC-8)
        await dispatchNotification({
          recipientId: shipment.cargoOwnerId,
          type: 'DELIVERY_CONFIRMED',
          title: 'Shipment Automatically Completed',
          message: `Shipment ${shipment.shipmentNumber} has been automatically marked completed after 72 hours of delivery (BR-20).`,
          relatedShipmentId: shipment.id,
        });

        if (shipment.trip) {
          await dispatchNotification({
            recipientId: shipment.trip.driverId,
            type: 'DELIVERY_CONFIRMED',
            title: 'Shipment Completed',
            message: `Shipment ${shipment.shipmentNumber} has been completed. You are now eligible to receive ratings.`,
            relatedShipmentId: shipment.id,
          });
        }
      } catch (error) {
        logger.error(`[JOB] Auto-completion failed for shipment ${shipment.id}:`, error);
      }
    }
  } catch (error) {
    logger.error('[JOB] Error in runAutoCompleteShipments:', error);
  } finally {
    running = false;
  }
}

module.exports = {
  runAutoCompleteShipments,
};
