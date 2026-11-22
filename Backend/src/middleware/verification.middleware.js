const { errorResponse } = require('../utils/response');
const { ACCOUNT_STATUS, ROLES } = require('../config/constants');

/**
 * Verification & Status Gate Middleware
 * Requirement: BR-3, BR-13, FR-DR-1, FR-FO-1, FR-SV-7, FR-SV-7
 */
function requireVerifiedAccount(req, res, next) {
  if (!req.user) {
    return errorResponse(res, 'AUTH_REQUIRED', 'Authentication is required', 401);
  }

  // Check if account is suspended
  if (req.user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
    return errorResponse(
      res,
      'ACCOUNT_SUSPENDED',
      'Your account has been suspended by an administrator. Active operational actions are blocked.',
      403
    );
  }

  // Cargo owners operate with ACTIVE status
  if (req.user.role === ROLES.CARGO_OWNER) {
    if (req.user.accountStatus !== ACCOUNT_STATUS.ACTIVE) {
      return errorResponse(
        res,
        'ACCOUNT_NOT_ACTIVE',
        'Cargo owner account is not in active state',
        403
      );
    }
    return next();
  }

  // Admins always pass
  if (req.user.role === ROLES.ADMIN) {
    return next();
  }

  // Drivers and Fleet Owners must be VERIFIED
  if (req.user.accountStatus !== ACCOUNT_STATUS.VERIFIED) {
    return errorResponse(
      res,
      'ACCOUNT_NOT_VERIFIED',
      'Your account verification is pending or rejected. You cannot place bids, perform trips, or register resources until approved by an administrator (BR-3).',
      403
    );
  }

  next();
}

/**
 * Blocks suspended accounts from operational routes (FR-SV-7)
 */
function blockSuspended(req, res, next) {
  if (req.user && req.user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
    return errorResponse(
      res,
      'ACCOUNT_SUSPENDED',
      'Your account has been suspended by an administrator. Active operational actions are blocked.',
      403
    );
  }
  next();
}

module.exports = {
  requireVerifiedAccount,
  blockSuspended,
};
