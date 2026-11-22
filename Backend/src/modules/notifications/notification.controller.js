const prisma = require('../../config/db');
const { registerDeviceToken, removeDeviceToken } = require('../../services/fcm.service');
const { getPaginationParams, buildPaginationMeta } = require('../../utils/pagination');
const { successResponse, errorResponse } = require('../../utils/response');

/**
 * List notifications for current user
 * Requirement: FR-NC-13
 */
async function listNotifications(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);

    const [total, unreadCount, notifications] = await Promise.all([
      prisma.notification.count({ where: { recipientId: req.user.id } }),
      prisma.notification.count({ where: { recipientId: req.user.id, isRead: false } }),
      prisma.notification.findMany({
        where: { recipientId: req.user.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return successResponse(
      res,
      {
        unreadCount,
        notifications,
      },
      'Notifications retrieved',
      200,
      buildPaginationMeta(total, page, limit)
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Mark a single notification as read
 */
async function markNotificationAsRead(req, res, next) {
  try {
    const { id } = req.params;

    const notif = await prisma.notification.updateMany({
      where: { id, recipientId: req.user.id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return successResponse(res, null, 'Notification marked as read');
  } catch (error) {
    next(error);
  }
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead(req, res, next) {
  try {
    await prisma.notification.updateMany({
      where: { recipientId: req.user.id, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return successResponse(res, null, 'All notifications marked as read');
  } catch (error) {
    next(error);
  }
}

/**
 * Register device token for push notifications (SI-3.2)
 */
async function setDeviceToken(req, res, next) {
  try {
    const { token, platform } = req.body;
    if (!token) {
      return errorResponse(res, 'TOKEN_REQUIRED', 'Device token is required', 400);
    }
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
      return errorResponse(res, 'INVALID_DEVICE_TOKEN', 'Device token format is invalid', 422);
    }
    if (platform !== undefined && !['android', 'ios', 'web'].includes(platform)) {
      return errorResponse(res, 'INVALID_PLATFORM', 'Platform must be android, ios or web', 422);
    }

    const device = await registerDeviceToken(req.user.id, token, platform || 'android');
    return successResponse(res, device, 'Device token registered successfully', 201);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listNotifications,
  markNotificationAsRead,
  markAllAsRead,
  setDeviceToken,
};
