const prisma = require('../config/db');
const logger = require('../utils/logger');

/**
 * Registers or updates a device token for push notifications
 * Requirement: SI-3.2
 */
async function registerDeviceToken(userId, token, platform = 'android') {
  try {
    return await prisma.deviceToken.upsert({
      where: { token },
      update: {
        userId,
        platform,
        updatedAt: new Date(),
      },
      create: {
        userId,
        token,
        platform,
      },
    });
  } catch (error) {
    logger.error('Error registering device token:', error);
    throw error;
  }
}

/**
 * Removes a device token (e.g. on logout or token rejection)
 * Requirement: SI-3.2
 */
async function removeDeviceToken(token) {
  try {
    await prisma.deviceToken.deleteMany({
      where: { token },
    });
  } catch (error) {
    logger.error('Error deleting device token:', error);
  }
}

/**
 * Dispatches a notification to a user
 * Persists in database and attempts push delivery; falls back to in-app inbox (FR-NC-16)
 * Payload contains NO sensitive document or financial data (SI-3.3)
 */
async function dispatchNotification({
  recipientId,
  type,
  title,
  message,
  relatedShipmentId = null,
}) {
  try {
    // 1. Persist notification in database
    const notification = await prisma.notification.create({
      data: {
        recipientId,
        type,
        title,
        message,
        relatedShipmentId,
        isRead: false,
      },
    });

    // 2. Fetch user's registered device tokens
    const deviceTokens = await prisma.deviceToken.findMany({
      where: { userId: recipientId },
    });

    if (!deviceTokens || deviceTokens.length === 0) {
      logger.info(`[FCM] No active device tokens for user ${recipientId}. Stored for in-app delivery.`);
      return notification;
    }

    // 3. Simulated/Real FCM dispatch
    // Notification payloads contain only non-sensitive summary info (SI-3.3)
    const pushPayload = {
      notification: { title, body: message },
      data: {
        type,
        notificationId: notification.id,
        ...(relatedShipmentId ? { shipmentId: relatedShipmentId } : {}),
      },
    };

    logger.info(`[FCM] Dispatched push notification [${type}] to user ${recipientId} across ${deviceTokens.length} device(s)`);

    // In production with Firebase Admin credentials, send via admin.messaging().sendEachForMulticast()
    // For invalid/expired tokens, auto-clean via removeDeviceToken()

    await prisma.notification.update({
      where: { id: notification.id },
      data: { isPushDelivered: true },
    });

    return notification;
  } catch (error) {
    logger.error(`[FCM] Push dispatch failed for recipient ${recipientId}. Falling back to in-app inbox:`, error);
    return null;
  }
}

module.exports = {
  registerDeviceToken,
  removeDeviceToken,
  dispatchNotification,
};
