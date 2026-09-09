const express = require('express');
const multer = require('multer');
const router = express.Router();
const complaintController = require('./complaint.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { LIMITS } = require('../../config/constants');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.MAX_FILE_SIZE_BYTES },
});

router.use(authenticate);

router.post('/', upload.array('attachments', LIMITS.MAX_COMPLAINT_IMAGES), complaintController.createComplaint);
router.get('/', complaintController.listMyComplaints);
router.put('/:id/withdraw', complaintController.withdrawComplaint);

module.exports = router;
