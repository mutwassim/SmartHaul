const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { ROLES, SECURITY } = require('../config/constants');

// In-memory / cache blacklist for revoked tokens (SEC-4)
const revokedTokens = new Set();

/**
 * Generates signed JWT session token with explicit expiry
 * Requirement: SEC-3, SEC-4, FR-SV-17
 */
function generateToken(user) {
  const isAdmin = user.role === ROLES.ADMIN;
  
  // Expiry in seconds: admin is 30m of inactivity, other users is 12h
  const expiresInSeconds = isAdmin
    ? SECURITY.ADMIN_INACTIVITY_TIMEOUT_MS / 1000
    : SECURITY.USER_INACTIVITY_TIMEOUT_MS / 1000;

  const payload = {
    userId: user.id,
    role: user.role,
    accountStatus: user.accountStatus,
    createdAt: Math.floor(Date.now() / 1000),
    maxAgeDays: SECURITY.ABSOLUTE_SESSION_LIFETIME_DAYS,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: expiresInSeconds,
  });
}

/**
 * Verifies JWT session token
 * Requirement: SI-1.2, SEC-4
 */
function verifyToken(token) {
  if (revokedTokens.has(token)) {
    throw new Error('TOKEN_REVOKED');
  }

  const decoded = jwt.verify(token, env.JWT_SECRET);

  // Check 30-day absolute lifetime limit (SEC-3)
  const issuedAt = decoded.createdAt;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const thirtyDaysSeconds = SECURITY.ABSOLUTE_SESSION_LIFETIME_DAYS * 24 * 60 * 60;

  if (nowSeconds - issuedAt > thirtyDaysSeconds) {
    throw new Error('SESSION_MAX_LIFETIME_EXCEEDED');
  }

  return decoded;
}

/**
 * Revokes token on logout or suspension
 * Requirement: SEC-4
 */
function revokeToken(token) {
  if (token) {
    revokedTokens.add(token);
  }
}

module.exports = {
  generateToken,
  verifyToken,
  revokeToken,
};
