/**
 * Standard API Response Envelope
 * Requirement: SI-1.3 (Machine-readable error code + human readable message)
 */

function successResponse(res, data = {}, message = 'Operation successful', statusCode = 200, pagination = null) {
  const payload = {
    success: true,
    message,
    data,
  };
  if (pagination) {
    payload.pagination = pagination;
  }
  return res.status(statusCode).json(payload);
}

function errorResponse(res, errorCode, message, statusCode = 400, details = null) {
  const payload = {
    success: false,
    error: {
      code: errorCode,
      message,
      ...(details ? { details } : {}),
    },
  };
  return res.status(statusCode).json(payload);
}

module.exports = {
  successResponse,
  errorResponse,
};
