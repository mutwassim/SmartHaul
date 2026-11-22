const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(env.AES_SECRET_KEY, 'hex');
const IV_LENGTH = env.AES_IV_LENGTH || 16;

/**
 * Encrypts sensitive string using AES-256-GCM
 * Requirement: SEC-7, CON-12
 */
function encrypt(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

/**
 * Decrypts AES-256-GCM ciphertext
 */
function decrypt(encryptedData, ivHex, authTagHex) {
  if (!encryptedData || !ivHex || !authTagHex) return null;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Separate key for lookup hashes, derived from the AES key so no extra secret is needed
const HASH_KEY = crypto.createHmac('sha256', KEY).update('smarthaul:identifier-hash:v1').digest();

/**
 * Creates a deterministic keyed hash (HMAC-SHA256) for exact-match lookups and uniqueness checks.
 * A plain SHA-256 of a CNIC could be reversed by trying all numbers; the key prevents that (SEC-7).
 * Requirement: BR-2, BR-30
 */
function hashDeterministic(value) {
  if (!value) return null;
  const normalized = value.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHmac('sha256', HASH_KEY).update(normalized).digest('hex');
}

module.exports = {
  encrypt,
  decrypt,
  hashDeterministic,
};
