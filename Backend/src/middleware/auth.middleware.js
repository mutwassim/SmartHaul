const prisma = require('../config/db');
const { verifyToken, isTokenRevoked } = require('../utils/token');
const { errorResponse } = require('../utils/response');
const { ACCOUNT_STATUS } = require('../config/constants');

/**
 * Authentication Middleware
 * Requirement: SI-1.2, SEC-3, SEC-4, SEC-9
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 'AUTH_TOKEN_MISSING', 'Authentication token is required', 401);
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err.message === 'SESSION_MAX_LIFETIME_EXCEEDED') {
        return errorResponse(res, 'AUTH_SESSION_EXPIRED', 'Maximum session duration (30 days) exceeded. Please log in again.', 401);
      }
      return errorResponse(res, 'AUTH_TOKEN_INVALID', 'Invalid or expired authentication token', 401);
    }

    if (await isTokenRevoked(token)) {
      return errorResponse(res, 'AUTH_TOKEN_REVOKED', 'Session has been invalidated. Please log in again.', 401);
    }

    // Retrieve active user from database to ensure up-to-date account status (FR-SV-11)
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        email: true,
        accountStatus: true,
        tokenVersion: true,
        preferredLanguage: true,
        driverFleetLink: {
          select: {
            fleetOwnerId: true,
          },
        },
      },
    });

    if (!user) {
      return errorResponse(res, 'AUTH_USER_NOT_FOUND', 'User account does not exist', 401);
    }

    // A password reset or suspension ends every earlier session (SEC-4)
    if ((decoded.tv || 0) !== user.tokenVersion) {
      return errorResponse(res, 'AUTH_TOKEN_REVOKED', 'Session has been invalidated. Please log in again.', 401);
    }

    // Attach user and raw token to request
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    return errorResponse(res, 'AUTH_INTERNAL_ERROR', 'Authentication failed', 500);
  }
}

module.exports = {
  authenticate,
};
