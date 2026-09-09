const { errorResponse } = require('../utils/response');

/**
 * Role-Based Access Control (RBAC) Middleware
 * Requirement: SEC-9, FR-SV-8
 * @param {string[]} allowedRoles Array of roles permitted to access the endpoint
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'AUTH_REQUIRED', 'Authentication is required for this action', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return errorResponse(
        res,
        'FORBIDDEN_ROLE',
        `Access denied. Role ${req.user.role} is not permitted to perform this action.`,
        403
      );
    }

    next();
  };
}

module.exports = {
  requireRole,
};
