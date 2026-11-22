const prisma = require('../config/db');
const { dispatchNotification } = require('../services/fcm.service');
const { BID_STATUS } = require('../config/constants');
const { bidCutoff } = require('../utils/bids');
const logger = require('../utils/logger');

let running = false;

/**
 * Bid expiry: an active bid not accepted within 24 hours of being placed expires
 * (the accept and revise endpoints also refuse an expired bid, so the hour of lag between runs does no harm)
 */
async function runBidExpiry() {
  if (running) return;
  running = true;
  try {
    const stale = await prisma.bid.findMany({
      where: { status: BID_STATUS.ACTIVE, createdAt: { lte: bidCutoff() } },
      select: { id: true, bidderId: true, shipmentId: true, shipment: { select: { shipmentNumber: true } } },
      take: 500,
    });
    if (stale.length === 0) return;

    for (const bid of stale) {
      try {
        // Compare-and-set: a bid accepted or withdrawn a moment ago is left alone
        const expired = await prisma.bid.updateMany({
          where: { id: bid.id, status: BID_STATUS.ACTIVE },
          data: { status: BID_STATUS.EXPIRED },
        });
        if (expired.count !== 1) continue;
        await dispatchNotification({
          recipientId: bid.bidderId,
          type: 'BID_EXPIRED',
          title: 'Bid Expired',
          message: `Your bid on shipment ${bid.shipment.shipmentNumber} expired after 24 hours. You can place a new bid if it is still open.`,
          relatedShipmentId: bid.shipmentId,
        });
      } catch (error) {
        logger.error(`[JOB] Could not expire bid ${bid.id}:`, error);
      }
    }
    logger.info(`[JOB] Expired ${stale.length} bid(s) older than 24 hours`);
  } catch (error) {
    logger.error('[JOB] Error in runBidExpiry:', error);
  } finally {
    running = false;
  }
}

module.exports = { runBidExpiry };
