const express = require('express');
const multer = require('multer');
const router = express.Router();
const driverController = require('./driver.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const { requireVerifiedAccount } = require('../../middleware/verification.middleware');
const { validateRequest } = require('../../middleware/validate.middleware');
const { ROLES, LIMITS } = require('../../config/constants');
const {
  submitBidSchema,
  updateBidSchema,
  updateTripStatusSchema,
  batchStatusSyncSchema,
  batchPositionsSyncSchema,
} = require('./driver.validation');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.MAX_FILE_SIZE_BYTES },
});

router.use(authenticate);
router.use(requireRole(ROLES.DRIVER));

// Matched load discovery (requires verified account, BR-3)
router.get('/matched-shipments', requireVerifiedAccount, driverController.getMatchedShipments);

// Bidding (requires verified account, BR-3)
router.post(
  '/bids',
  requireVerifiedAccount,
  validateRequest({ body: submitBidSchema }),
  driverController.submitBid
);

router.put(
  '/bids/:id',
  requireVerifiedAccount,
  validateRequest({ body: updateBidSchema }),
  driverController.updateBid
);

router.delete('/bids/:id', driverController.withdrawBid);

// Active trip & status lifecycle
router.get('/active-trip', driverController.getActiveTrip);

router.post(
  '/trips/:id/status',
  requireVerifiedAccount,
  validateRequest({ body: updateTripStatusSchema }),
  driverController.updateTripStatus
);

router.post(
  '/trips/:id/proof-of-delivery',
  requireVerifiedAccount,
  upload.array('podImages', LIMITS.MAX_POD_IMAGES),
  driverController.uploadPOD
);

router.post(
  '/trips/:id/status/batch-sync',
  validateRequest({ body: batchStatusSyncSchema }),
  driverController.syncOfflineStatusUpdates
);

router.post(
  '/trips/:id/positions/batch-sync',
  validateRequest({ body: batchPositionsSyncSchema }),
  driverController.syncOfflinePositions
);

router.get('/earnings', driverController.getEarningsSummary);

module.exports = router;
