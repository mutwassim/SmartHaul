const { z } = require('zod');
require('dotenv').config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  AES_SECRET_KEY: z.string().length(64, 'AES_SECRET_KEY must be a 64-character hex string (32 bytes)'),
  AES_IV_LENGTH: z.coerce.number().default(16),
  OSRM_BASE_URL: z.string().url().default('https://router.project-osrm.org'),
  UPLOAD_DIR: z.string().default('./uploads'),
  SIGNED_URL_EXPIRY_SECONDS: z.coerce.number().default(900),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0), // Number of reverse-proxy hops in front of the API (0 = none)
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean)), // Comma-separated allowed origins; required in production
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(), // Path to the Firebase service-account JSON; push is disabled when unset
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment validation failed:', JSON.stringify(parsed.error.format(), null, 2));
  throw new Error('Invalid environment configuration');
}

module.exports = parsed.data;
