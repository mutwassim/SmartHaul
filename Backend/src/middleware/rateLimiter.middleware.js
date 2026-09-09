const rateLimit = require('express-rate-limit');
const { SECURITY } = require('../config/constants');
const { errorResponse } = require('../utils/response');

/**
 * General API Rate Limiter
 * Requirement: SI-1.6
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return errorResponse(
      res,
      'RATE_LIMIT_EXCEEDED',
      'Too many requests from this IP, please try again after 15 minutes',
      429
    );
  },
});

/**
 * Authentication Attempt Limiter
 * Requirement: SEC-5 (Max 5 failed attempts / 15 minutes)
 */
const authLimiter = rateLimit({
  windowMs: SECURITY.FAILED_ATTEMPTS_WINDOW_MS,
  max: 10, // 10 attempts total per IP to mitigate distributed attacks
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return errorResponse(
      res,
      'AUTH_RATE_LIMIT_EXCEEDED',
      'Too many login attempts. Please try again after 15 minutes.',
      429
    );
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
};
