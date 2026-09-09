const url = require('url');
const prisma = require('../config/db');
const { verifyToken } = require('../utils/token');
const logger = require('../utils/logger');

/**
 * Authenticates WebSocket connection via JWT query param or header
 * Requirement: SI-1.2, CI-2
 */
async function authenticateWsConnection(req) {
  try {
    const parsedUrl = url.parse(req.url, true);
    const token = parsedUrl.query.token;

    if (!token) {
      logger.warn('[WS] Connection rejected: No authentication token provided');
      return null;
    }

    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        role: true,
        name: true,
        accountStatus: true,
      },
    });

    if (!user || user.accountStatus === 'SUSPENDED') {
      logger.warn(`[WS] Connection rejected: User not found or suspended (${decoded.userId})`);
      return null;
    }

    return user;
  } catch (error) {
    logger.warn('[WS] Authentication error:', error.message);
    return null;
  }
}

module.exports = {
  authenticateWsConnection,
};
