const { z } = require('zod');
const { ROLES, PREFERRED_LANGUAGE } = require('../../config/constants');

// CNIC Format: XXXXX-XXXXXXX-X (13 digits with hyphens)
const cnicRegex = /^[0-9]{5}-[0-9]{7}-[0-9]{1}$/;

// Password Policy: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char (SEC-1)
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

/**
 * Canonical forms so the same person is never stored twice (BR-1):
 * emails are lower-case, Pakistani numbers use the +92 format.
 */
function normalizePhone(raw) {
  let p = String(raw).replace(/[\s\-().]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  if (/^03\d{9}$/.test(p)) return `+92${p.slice(1)}`;
  if (/^92\d{10}$/.test(p)) return `+${p}`;
  return p;
}

function normalizeIdentifier(raw) {
  const t = String(raw).trim();
  return t.includes('@') ? t.toLowerCase() : normalizePhone(t);
}

const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .refine((p) => /^\+\d{10,15}$/.test(p), 'Valid phone number required (e.g. +923001234567)');

const emailSchema = z
  .string()
  .trim()
  .email('Invalid email address format')
  .transform((e) => e.toLowerCase());

const registerSchema = z.object({
  role: z.enum([ROLES.CARGO_OWNER, ROLES.DRIVER, ROLES.FLEET_OWNER], {
    errorMap: () => ({ message: 'Role must be CARGO_OWNER, DRIVER, or FLEET_OWNER. Admin registration is prohibited.' }),
  }),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: phoneSchema,
  email: emailSchema,
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
  identifier: z.string().min(1, 'Email or phone number is required').transform(normalizeIdentifier),
  password: z.string().min(1, 'Password is required'),
  role: z.enum([ROLES.CARGO_OWNER, ROLES.DRIVER, ROLES.FLEET_OWNER, ROLES.ADMIN]),
  deviceToken: z.string().optional(),
  platform: z.enum(['android', 'ios', 'web']).default('android'),
});

const passwordRecoveryRequestSchema = z.object({
  identifier: z.string().min(1, 'Email or phone number is required').transform(normalizeIdentifier),
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
  passwordRegex,
  normalizePhone,
  normalizeIdentifier,
  phoneSchema,
  emailSchema,
};
