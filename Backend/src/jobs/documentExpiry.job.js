const prisma = require('../config/db');
const { dispatchNotification } = require('../services/fcm.service');
const { ACCOUNT_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Daily Document Expiry Validation Job
 * Requirement: BR-29, FR-SV-15, UC-13 alternative flow 13.2
 */
async function runDocumentExpiryCheck() {
  try {
    const now = new Date();

    // Find verified documents that have expired
    const expiredDocs = await prisma.verificationDocument.findMany({
      where: {
        verificationStatus: 'APPROVED',
        expiryDate: { lt: now },
      },
      include: {
        user: true,
      },
    });

    if (expiredDocs.length === 0) return;

    logger.info(`[JOB] Found ${expiredDocs.length} expired document(s). Reverting account verifications.`);

    for (const doc of expiredDocs) {
      // Revert doc status to PENDING
      await prisma.verificationDocument.update({
        where: { id: doc.id },
        data: { verificationStatus: 'PENDING' },
      });

      // If user was VERIFIED, revert to PENDING to suspend bidding permissions (BR-29, FR-SV-15)
      if (doc.user.accountStatus === ACCOUNT_STATUS.VERIFIED) {
        await prisma.user.update({
          where: { id: doc.userId },
          data: { accountStatus: ACCOUNT_STATUS.PENDING },
        });

        // Dispatch expiry notification
        await dispatchNotification({
          recipientId: doc.userId,
          type: 'ACCOUNT_SUSPENDED_OR_REINSTATED',
          title: 'Document Expired - Verification Required',
          message: `Your ${doc.documentType.replace(/_/g, ' ')} has passed its expiration date. Please upload fresh documents to resume bidding (BR-29).`,
        });
      }
    }
  } catch (error) {
    logger.error('[JOB] Error in runDocumentExpiryCheck:', error);
  }
}

module.exports = {
  runDocumentExpiryCheck,
};
