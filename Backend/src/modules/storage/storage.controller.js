const fs = require('fs');
const { verifySignedUrl, getAbsolutePath } = require('../../services/storage.service');
const { errorResponse } = require('../../utils/response');

/**
 * Securely serves files via time-limited signed URL
 * Requirement: SEC-8, SI-4.2 (Valid for max 15 minutes)
 */
async function serveSignedFile(req, res, next) {
  try {
    const { key, expires, sig } = req.query;

    if (!key || !expires || !sig) {
      return errorResponse(res, 'INVALID_SIGNATURE', 'File access requires a valid signed URL', 403);
    }

    const isValid = verifySignedUrl(key, expires, sig);
    if (!isValid) {
      return errorResponse(
        res,
        'SIGNED_URL_EXPIRED_OR_INVALID',
        'This access link has expired or has an invalid signature (SEC-8). Please request a fresh link.',
        403
      );
    }

    const filePath = getAbsolutePath(key);

    if (!fs.existsSync(filePath)) {
      return errorResponse(res, 'FILE_NOT_FOUND', 'Requested file does not exist', 404);
    }

    // Set cache headers
    res.setHeader('Cache-Control', 'private, max-age=900');
    return res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  serveSignedFile,
};
