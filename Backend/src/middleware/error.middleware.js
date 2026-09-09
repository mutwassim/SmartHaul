const logger = require('../utils/logger');
const { errorResponse } = require('../utils/response');

/**
 * Centralized Application Error Handling Middleware
 * Requirement: SI-1.3, REL-10, REL-12, SEC-16
 */
function errorHandler(err, req, res, next) {
  // Log diagnostic error trace internally for analysis (REL-12)
  logger.error('Unhandled Server Error:', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    user: req.user ? { id: req.user.id, role: req.user.role } : 'unauthenticated',
    ip: req.ip,
  });

  // Handle Multer upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return errorResponse(res, 'FILE_TOO_LARGE', 'Uploaded file exceeds the maximum 5MB size limit', 400);
  }

  // Handle JSON parse errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return errorResponse(res, 'INVALID_JSON_PAYLOAD', 'Malformed JSON payload in request body', 400);
  }

  // Handle generic / unexpected internal errors without exposing stack trace (SEC-16)
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const clientMessage =
    statusCode === 500
      ? 'An unexpected error occurred. Please try again or contact support if the issue persists.'
      : err.message;

  return errorResponse(res, errorCode, clientMessage, statusCode);
}

module.exports = {
  errorHandler,
};
