const url = require('url');
const prisma = require('../config/db');
const { verifyToken, isTokenRevoked } = require('../utils/token');
const logger = require('../utils/logger');

/**
 * Reads the JWT from the Authorization header (preferred, stays out of server logs)
 * or, for clients that cannot set headers, from the ?token= query parameter.
 */
function extractToken(req) {
  const header = req.headers && req.headers.authorization;
  if (header && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
  return url.parse(req.url, true).query.token || null;
}

/**
 * Loads the user a token stands for, or null if the token is expired, revoked (logout),
 * out of date, or the account is missing or suspended. Used at connect time and again
 * periodically on open sockets (C-29).
 */
async function loadActiveUser(token) {
  try {
    if (!token) return null;
    const decoded = verifyToken(token);
    if (await isTokenRevoked(token)) return null;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, name: true, accountStatus: true, tokenVersion: true },
    });
    if (!user || user.accountStatus === 'SUSPENDED' || (decoded.tv || 0) !== user.tokenVersion) return null;
    return user;
  } catch (error) {
    logger.warn('[WS] Authentication error:', error.message);
    return null;
  }
}

/**
 * Authenticates a WebSocket connection (SI-1.2, CI-2)
 */
async function authenticateWsConnection(req) {
  const token = extractToken(req);
  if (!token) {
    logger.warn('[WS] Connection rejected: No authentication token provided');
    return null;
  }
  return loadActiveUser(token);
}

module.exports = { authenticateWsConnection, extractToken, loadActiveUser };
