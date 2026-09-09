const express = require('express');
const multer = require('multer');
const router = express.Router();
const userController = require('./user.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { LIMITS } = require('../../config/constants');

// Multer in-memory storage for validation and cloud/local dispatch
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.MAX_FILE_SIZE_BYTES },
});

router.use(authenticate);

router.get('/me', userController.getProfile);
router.put('/me', userController.updateProfile);

router.post('/me/documents', upload.single('document'), userController.uploadDocument);
router.get('/me/documents', userController.listDocuments);

router.get('/me/saved-locations', userController.getSavedLocations);
router.post('/me/saved-locations', userController.addSavedLocation);
router.delete('/me/saved-locations/:id', userController.deleteSavedLocation);

module.exports = router;
