const { errorResponse } = require('../utils/response');

/**
 * Zod Schema Validation Middleware
 * Requirement: SEC-11
 */
function validateRequest({ body = null, query = null, params = null }) {
  return (req, res, next) => {
    try {
      if (body) {
        req.body = body.parse(req.body);
      }
      if (query) {
        req.query = query.parse(req.query);
      }
      if (params) {
        req.params = params.parse(req.params);
      }
      next();
    } catch (error) {
      if (error.errors) {
        const details = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return errorResponse(res, 'VALIDATION_ERROR', 'Invalid request payload or parameters', 422, details);
      }
      return errorResponse(res, 'VALIDATION_ERROR', error.message, 422);
    }
  };
}

module.exports = {
  validateRequest,
};
