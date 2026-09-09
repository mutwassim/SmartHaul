const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { validateRequest } = require('../../middleware/validate.middleware');
const { authLimiter } = require('../../middleware/rateLimiter.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const {
  registerSchema,
  loginSchema,
  passwordRecoveryRequestSchema,
  passwordResetSchema,
} = require('./auth.validation');

router.post(
  '/register',
  authLimiter,
  validateRequest({ body: registerSchema }),
  authController.register
);

router.post(
  '/login',
  authLimiter,
  validateRequest({ body: loginSchema }),
  authController.login
);

router.post(
  '/logout',
  authenticate,
  authController.logout
);

router.post(
  '/password-recovery/request',
  authLimiter,
  validateRequest({ body: passwordRecoveryRequestSchema }),
  authController.requestPasswordRecovery
);

router.post(
  '/password-recovery/reset',
  authLimiter,
  validateRequest({ body: passwordResetSchema }),
  authController.resetPassword
);

module.exports = router;
