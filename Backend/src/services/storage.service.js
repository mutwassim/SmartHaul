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

/**
 * Validates file buffer / size / MIME
 * Requirement: SI-4.3, OE-12
 */
function validateFile(file) {
  if (!file) {
    throw new Error('No file provided');
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new Error(`Invalid file type: ${file.mimetype}. Only JPEG and PNG are supported.`);
  }

  if (file.size > LIMITS.MAX_FILE_SIZE_BYTES) {
    throw new Error(`File exceeds maximum size limit of 5MB.`);
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
  const fileName = `${docType.toLowerCase()}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  const filePath = path.join(subDir, fileName);

  fs.writeFileSync(filePath, file.buffer);

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

  fs.writeFileSync(filePath, file.buffer);

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

  fs.writeFileSync(filePath, file.buffer);

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

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
}

/**
 * Gets local absolute file path for a storage key
 */
function getAbsolutePath(storageKey) {
  // Prevent path traversal
  const safePath = path.normalize(storageKey).replace(/^(\.\.[\/\\])+/, '');
  return path.join(uploadBasePath, safePath);
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
