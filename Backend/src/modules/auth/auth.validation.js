const { z } = require('zod');
const { ROLES, PREFERRED_LANGUAGE } = require('../../config/constants');

// CNIC Format: XXXXX-XXXXXXX-X (13 digits with hyphens)
const cnicRegex = /^[0-9]{5}-[0-9]{7}-[0-9]{1}$/;

// Password Policy: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char (SEC-1)
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

const registerSchema = z.object({
  role: z.enum([ROLES.CARGO_OWNER, ROLES.DRIVER, ROLES.FLEET_OWNER], {
    errorMap: () => ({ message: 'Role must be CARGO_OWNER, DRIVER, or FLEET_OWNER. Admin registration is prohibited.' }),
  }),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Valid Pakistani phone number required (e.g. +923001234567)'),
  email: z.string().email('Invalid email address format'),
  password: z.string().regex(
    passwordRegex,
    'Password must be at least 8 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character (SEC-1)'
  ),
  cnicNumber: z.string().regex(cnicRegex, 'CNIC must follow format XXXXX-XXXXXXX-X (e.g. 37405-1234567-1)').optional(),
  businessName: z.string().optional(),
  businessAddress: z.string().optional(),
  preferredLanguage: z.enum(['EN', 'UR']).default('EN'),
});

const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or phone number is required'),
  password: z.string().min(1, 'Password is required'),
  role: z.enum([ROLES.CARGO_OWNER, ROLES.DRIVER, ROLES.FLEET_OWNER, ROLES.ADMIN]),
  deviceToken: z.string().optional(),
  platform: z.enum(['android', 'ios', 'web']).default('android'),
});

const passwordRecoveryRequestSchema = z.object({
  identifier: z.string().min(1, 'Email or phone number is required'),
  role: z.enum([ROLES.CARGO_OWNER, ROLES.DRIVER, ROLES.FLEET_OWNER, ROLES.ADMIN]),
});

const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().regex(
    passwordRegex,
    'Password must be at least 8 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  ),
});

module.exports = {
  registerSchema,
  loginSchema,
  passwordRecoveryRequestSchema,
  passwordResetSchema,
};
