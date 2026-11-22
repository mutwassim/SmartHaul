const express = require('express');
const multer = require('multer');
const router = express.Router();
const userController = require('./user.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { validateRequest } = require('../../middleware/validate.middleware');
const { LIMITS } = require('../../config/constants');
const { updateProfileSchema, uploadDocumentSchema, savedLocationSchema } = require('./user.validation');

// Multer in-memory storage for validation and cloud/local dispatch
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.MAX_FILE_SIZE_BYTES },
});

router.use(authenticate);

router.get('/me', userController.getProfile);
router.put('/me', validateRequest({ body: updateProfileSchema }), userController.updateProfile);

router.post(
  '/me/documents',
  upload.single('document'),
  validateRequest({ body: uploadDocumentSchema }),
  userController.uploadDocument
);
router.get('/me/documents', userController.listDocuments);

router.get('/me/saved-locations', userController.getSavedLocations);
router.post('/me/saved-locations', validateRequest({ body: savedLocationSchema }), userController.addSavedLocation);
router.delete('/me/saved-locations/:id', userController.deleteSavedLocation);

module.exports = router;
