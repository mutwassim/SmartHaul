const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');
const { LIMITS, SECURITY } = require('../config/constants');
const logger = require('../utils/logger');

// Ensure upload directory exists
const uploadBasePath = path.resolve(env.UPLOAD_DIR);
if (!fs.existsSync(uploadBasePath)) {
  fs.mkdirSync(uploadBasePath, { recursive: true });
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

function clientError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = 'INVALID_FILE';
  return err;
}

/**
 * Validates file buffer / size / MIME
 * Requirement: SI-4.3, OE-12
 */
function validateFile(file) {
  if (!file) {
    throw clientError('No file provided');
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw clientError(`Invalid file type: ${file.mimetype}. Only JPEG and PNG are supported.`);
  }

  // The declared type must match the file content (SI-4.3)
  const head = file.buffer ? file.buffer.subarray(0, 8) : null;
  if (head) {
    const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const isPng = head.length >= 8 && head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const matches = file.mimetype === 'image/png' ? isPng : isJpeg;
    if (!matches) {
      throw clientError('File content does not match its declared image type.');
    }
  }

  if (file.size > LIMITS.MAX_FILE_SIZE_BYTES) {
    throw clientError(`File exceeds maximum size limit of 5MB.`);
  }
}

/**
 * Saves a verification document to storage
 */
async function uploadVerificationDocument(file, userId, docType) {
  validateFile(file);

  const subDir = path.join(uploadBasePath, 'verifications', userId);
  if (!fs.existsSync(subDir)) {
    fs.mkdirSync(subDir, { recursive: true });
  }

  const ext = file.mimetype === 'image/png' ? '.png' : '.jpg';
  const safeType = String(docType || 'doc').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'doc';
  const fileName = `${safeType}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  const filePath = path.join(subDir, fileName);

  await fs.promises.writeFile(filePath, file.buffer);

  // Return relative storage key
  const storageKey = `verifications/${userId}/${fileName}`;
  return {
    storageKey,
    mimeType: file.mimetype,
    fileSizeBytes: file.size,
    originalFilename: file.originalname,
  };
}

/**
 * Saves a Proof of Delivery (POD) photo to storage
 */
async function uploadProofOfDelivery(file, shipmentId) {
  validateFile(file);

  const subDir = path.join(uploadBasePath, 'pod', shipmentId);
  if (!fs.existsSync(subDir)) {
    fs.mkdirSync(subDir, { recursive: true });
  }

  const ext = file.mimetype === 'image/png' ? '.png' : '.jpg';
  const fileName = `pod_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  const filePath = path.join(subDir, fileName);

  await fs.promises.writeFile(filePath, file.buffer);

  const storageKey = `pod/${shipmentId}/${fileName}`;
  return {
    storageKey,
    mimeType: file.mimetype,
    fileSizeBytes: file.size,
  };
}

/**
 * Saves a Complaint attachment photo to storage
 */
async function uploadComplaintAttachment(file, complaintRef) {
  validateFile(file);

  const subDir = path.join(uploadBasePath, 'complaints', complaintRef);
  if (!fs.existsSync(subDir)) {
    fs.mkdirSync(subDir, { recursive: true });
  }

  const ext = file.mimetype === 'image/png' ? '.png' : '.jpg';
  const fileName = `cmp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  const filePath = path.join(subDir, fileName);

  await fs.promises.writeFile(filePath, file.buffer);

  return `complaints/${complaintRef}/${fileName}`;
}

/**
 * Generates a short-lived HMAC signed URL for secure image viewing
 * Requirement: SEC-8, SI-4.2 (Valid for max 15 minutes)
 */
function generateSignedReadUrl(storageKey, expiresInSeconds = SECURITY.SIGNED_URL_EXPIRY_SECONDS) {
  if (!storageKey) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${storageKey}:${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(payload)
    .digest('hex');

  return `/api/v1/storage/file?key=${encodeURIComponent(storageKey)}&expires=${expiresAt}&sig=${signature}`;
}

/**
 * Verifies signed URL validity
 */
function verifySignedUrl(storageKey, expires, signature) {
  const expiresAt = parseInt(expires, 10);
  if (isNaN(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) {
    return false; // Expired
  }

  const payload = `${storageKey}:${expiresAt}`;
  const expectedSig = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(payload)
    .digest('hex');

  const given = Buffer.from(String(signature));
  const expected = Buffer.from(expectedSig);
  if (given.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(given, expected);
}

/**
 * Gets local absolute file path for a storage key
 */
function getAbsolutePath(storageKey) {
  // Prevent path traversal
  const resolved = path.resolve(uploadBasePath, String(storageKey));
  if (resolved !== uploadBasePath && !resolved.startsWith(uploadBasePath + path.sep)) {
    const err = new Error('Invalid storage key');
    err.statusCode = 400;
    err.code = 'INVALID_STORAGE_KEY';
    throw err;
  }
  return resolved;
}

module.exports = {
  validateFile,
  uploadVerificationDocument,
  uploadProofOfDelivery,
  uploadComplaintAttachment,
  generateSignedReadUrl,
  verifySignedUrl,
  getAbsolutePath,
};
