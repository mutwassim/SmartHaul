const fs = require('fs');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const prisma = require('../config/db');
const env = require('../config/env');
const logger = require('../utils/logger');

// Firebase error codes that mean the device token will never work again
const DEAD_TOKEN_ERRORS = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
];

// undefined = not tried yet, null = push unavailable (not configured or failed to start)
let messagingClient;

/**
 * Lazily starts Firebase Cloud Messaging from the service-account file.
 * Returns null when push is not configured, so notifications stay in the in-app inbox (FR-NC-13).
 */
function getFirebaseMessaging() {
  if (messagingClient !== undefined) return messagingClient;

  messagingClient = null;

  if (!env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    logger.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_PATH is not set. Push delivery is disabled; notifications stay in the in-app inbox.');
    return messagingClient;
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
    const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
    messagingClient = getMessaging(app);
    logger.info('[FCM] Firebase Cloud Messaging initialised.');
  } catch (error) {
    logger.error(`[FCM] Could not start Firebase (${error.code || error.name}). Push delivery is disabled.`);
  }

  return messagingClient;
}

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
 * Persists in database and attempts push delivery; falls back to in-app inbox (FR-NC-14)
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

    // 3. Push delivery through Firebase Cloud Messaging
    // Notification payloads contain only non-sensitive summary info (SI-3.3)
    const messaging = getFirebaseMessaging();

    if (!messaging) {
      logger.info(`[FCM] Push not configured. Notification for user ${recipientId} stored for in-app delivery.`);
      return notification;
    }

    const response = await messaging.sendEachForMulticast({
      tokens: deviceTokens.map((device) => device.token),
      notification: { title, body: message },
      data: {
        type,
        notificationId: notification.id,
        ...(relatedShipmentId ? { shipmentId: relatedShipmentId } : {}),
      },
      android: { priority: 'high' },
    });

    // Remove tokens that Firebase reports as unregistered or malformed
    await Promise.all(
      response.responses.map((result, index) =>
        !result.success && result.error && DEAD_TOKEN_ERRORS.includes(result.error.code)
          ? removeDeviceToken(deviceTokens[index].token)
          : null
      )
    );

    // Mark as pushed only when at least one device actually received it
    if (response.successCount > 0) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { isPushDelivered: true },
      });
    }

    logger.info(`[FCM] Push [${type}] to user ${recipientId}: ${response.successCount} sent, ${response.failureCount} failed`);

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
