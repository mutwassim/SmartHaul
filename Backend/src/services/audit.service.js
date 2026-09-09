const prisma = require('../config/db');
const logger = require('../utils/logger');

/**
 * Appends an immutable record to the administrative audit log
 * Requirement: BR-28, SEC-15, FR-AD-19
 */
async function logAdminAction({
  adminId,
  action,
  targetType,
  targetId,
  previousState = null,
  newState = null,
  reason = null,
  ipAddress = null,
}) {
  try {
    const logEntry = await prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId: targetId.toString(),
        previousState: previousState ? JSON.parse(JSON.stringify(previousState)) : undefined,
        newState: newState ? JSON.parse(JSON.stringify(newState)) : undefined,
        reason,
        ipAddress,
      },
    });

    logger.info(`[ADMIN_AUDIT] Admin ${adminId} performed ${action} on ${targetType}:${targetId}`);
    return logEntry;
  } catch (error) {
    logger.error('Failed to create admin audit log entry:', error);
    // Audit logging failure should not silently pass in production
    throw error;
  }
}

/**
 * Records an authentication event
 * Requirement: FR-AD-3, FR-SV-19
 */
async function logAuthEvent({
  userId = null,
  identifier,
  action,
  ipAddress,
  userAgent = null,
}) {
  try {
    return await prisma.authLog.create({
      data: {
        userId,
        identifier,
        action,
        ipAddress: ipAddress || 'unknown',
        userAgent,
      },
    });
  } catch (error) {
    logger.error('Failed to log auth event:', error);
  }
}

module.exports = {
  logAdminAction,
  logAuthEvent,
};
