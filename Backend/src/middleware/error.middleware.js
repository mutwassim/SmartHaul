const prisma = require('../config/db');
const logger = require('../utils/logger');
const { errorResponse } = require('../utils/response');

/**
 * Centralized Application Error Handling Middleware
 * Requirement: SI-1.3, REL-10, REL-12, SEC-16
 */
async function errorHandler(err, req, res, next) {
  const isPrismaError = typeof err.code === 'string' && /^P\d{4}$/.test(err.code);
  const statusCode = !isPrismaError && Number.isInteger(err.statusCode) ? err.statusCode : 500;

  // Client errors (4xx) are expected: no stack trace, no error-log row (REL-12 covers faults)
  if (statusCode < 500 && err.code !== 'LIMIT_FILE_SIZE' && !(err instanceof SyntaxError)) {
    return errorResponse(res, err.code || 'REQUEST_ERROR', err.message, statusCode);
  }

  // Log diagnostic error trace internally for analysis (REL-12)
  logger.error('Unhandled Server Error:', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    user: req.user ? { id: req.user.id, role: req.user.role } : 'unauthenticated',
    ip: req.ip,
  });

  // Keep a durable record: timestamp, requesting role, operation and trace (REL-12)
  try {
    await prisma.errorLog.create({
      data: {
        userRole: req.user ? req.user.role : null,
        operation: `${req.method} ${req.originalUrl}`.slice(0, 300),
        message: String(err.message || err).slice(0, 2000),
        trace: err.stack ? String(err.stack).slice(0, 8000) : null,
      },
    });
  } catch (logError) {
    logger.warn(`Could not persist error log entry: ${logError.message}`);
  }

  // Handle Multer upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return errorResponse(res, 'FILE_TOO_LARGE', 'Uploaded file exceeds the maximum 5MB size limit', 400);
  }

  // Handle JSON parse errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return errorResponse(res, 'INVALID_JSON_PAYLOAD', 'Malformed JSON payload in request body', 400);
  }

  // Handle generic / unexpected internal errors without exposing stack trace (SEC-16)
  const errorCode = isPrismaError ? 'INTERNAL_SERVER_ERROR' : err.code || 'INTERNAL_SERVER_ERROR';
  const clientMessage =
    statusCode === 500
      ? 'An unexpected error occurred. Please try again or contact support if the issue persists.'
      : err.message;

  return errorResponse(res, errorCode, clientMessage, statusCode);
}

module.exports = {
  errorHandler,
};
