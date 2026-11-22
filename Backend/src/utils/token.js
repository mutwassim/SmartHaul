const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const env = require('../config/env');
const { ROLES, SECURITY } = require('../config/constants');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Generates signed JWT session token with explicit expiry
 * Requirement: SEC-3, SEC-4, FR-SV-2
 * `issuedAt` keeps the original sign-in time when a session is refreshed, so the
 * 30-day absolute limit still counts from the first login.
 */
function generateToken(user, { issuedAt } = {}) {
  const isAdmin = user.role === ROLES.ADMIN;

  // Expiry is measured from the last activity: admin 30 minutes, other users 12 hours.
  // Refreshing (POST /auth/refresh) issues a new token and so extends an active session.
  const expiresInSeconds = isAdmin
    ? SECURITY.ADMIN_INACTIVITY_TIMEOUT_MS / 1000
    : SECURITY.USER_INACTIVITY_TIMEOUT_MS / 1000;

  const payload = {
    userId: user.id,
    role: user.role,
    accountStatus: user.accountStatus,
    tv: user.tokenVersion || 0,
    createdAt: issuedAt || Math.floor(Date.now() / 1000),
    maxAgeDays: SECURITY.ABSOLUTE_SESSION_LIFETIME_DAYS,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: expiresInSeconds,
  });
}

/**
 * Verifies JWT signature, expiry and the 30-day absolute limit.
 * Revocation is checked separately (isTokenRevoked, token version) because it needs the database.
 * Requirement: SI-1.2, SEC-3, SEC-4
 */
function verifyToken(token) {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const limitSeconds = SECURITY.ABSOLUTE_SESSION_LIFETIME_DAYS * 24 * 60 * 60;

  if (nowSeconds - decoded.createdAt > limitSeconds) {
    throw new Error('SESSION_MAX_LIFETIME_EXCEEDED');
  }

  return decoded;
}

/**
 * Revokes one session token (logout). Stored in the database so a restart does not undo it.
 * Requirement: SEC-4
 */
async function revokeToken(token) {
  if (!token) return;
  const decoded = jwt.decode(token);
  const expiresAt = decoded && decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.revokedToken.upsert({
    where: { tokenHash: hashToken(token) },
    update: {},
    create: { tokenHash: hashToken(token), expiresAt },
  });

  // Expired tokens can no longer be used, so their records are not needed
  await prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

async function isTokenRevoked(token) {
  const found = await prisma.revokedToken.findUnique({ where: { tokenHash: hashToken(token) } });
  return Boolean(found);
}

module.exports = {
  generateToken,
  verifyToken,
  revokeToken,
  isTokenRevoked,
  hashToken,
};
