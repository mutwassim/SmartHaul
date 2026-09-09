const prisma = require('../config/db');
const logger = require('../utils/logger');

/**
 * Failed Notification In-App Delivery Fallback Job
 * Requirement: FR-NC-16, SI-3.4
 */
async function runNotificationRetryJob() {
  try {
    const unreadUnpushed = await prisma.notification.findMany({
      where: {
        isPushDelivered: false,
        isRead: false,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Within last 24h
        },
      },
      take: 100,
    });

    if (unreadUnpushed.length > 0) {
      logger.info(`[JOB] ${unreadUnpushed.length} notification(s) queued for in-app delivery on next user session (FR-NC-16)`);
    }
  } catch (error) {
    logger.error('[JOB] Error in runNotificationRetryJob:', error);
  }
}

module.exports = {
  runNotificationRetryJob,
};
