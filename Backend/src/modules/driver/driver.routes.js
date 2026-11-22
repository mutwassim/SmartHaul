const express = require('express');
const multer = require('multer');
const router = express.Router();
const driverController = require('./driver.controller');
const fleetController = require('../fleet/fleet.controller');
const { addVehicleSchema, updateVehicleSchema } = require('../fleet/fleet.validation');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const { requireVerifiedAccount } = require('../../middleware/verification.middleware');
const { validateRequest } = require('../../middleware/validate.middleware');
const { ROLES, LIMITS } = require('../../config/constants');
const {
  availabilitySchema,
  livePositionSchema,
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

// Load discovery and bidding are open to fleet owners as well as drivers (FR-FO-7, FR-FO-8)
const canBid = requireRole(ROLES.DRIVER, ROLES.FLEET_OWNER);

// Accepting bids switch and the position shared while it is on (FR-DR-19)
router.put(
  '/availability',
  requireRole(ROLES.DRIVER),
  requireVerifiedAccount,
  validateRequest({ body: availabilitySchema }),
  driverController.setAvailability
);
router.post(
  '/location',
  requireRole(ROLES.DRIVER),
  requireVerifiedAccount,
  validateRequest({ body: livePositionSchema }),
  driverController.reportLivePosition
);

// Matched load discovery (requires verified account, BR-3)
router.get('/matched-shipments', canBid, requireVerifiedAccount, driverController.getMatchedShipments);

// Bidding (requires verified account, BR-3)
router.post(
  '/bids',
  canBid,
  requireVerifiedAccount,
  validateRequest({ body: submitBidSchema }),
  driverController.submitBid
);

router.put(
  '/bids/:id',
  canBid,
  requireVerifiedAccount,
  validateRequest({ body: updateBidSchema }),
  driverController.updateBid
);

router.delete('/bids/:id', canBid, driverController.withdrawBid);

// No-show penalties apply to whoever won the booking, driver or fleet owner
router.get('/penalties', canBid, driverController.listMyPenalties);

// Everything below is driver-only
router.use(requireRole(ROLES.DRIVER));

// Owner-driver vehicle register (FR-DR-2): the fleet vehicle handlers already work on the caller's own vehicles
router.get('/vehicles', fleetController.listVehicles);
router.post('/vehicles', requireVerifiedAccount, validateRequest({ body: addVehicleSchema }), fleetController.addVehicle);
router.put('/vehicles/:id', requireVerifiedAccount, validateRequest({ body: updateVehicleSchema }), fleetController.updateVehicle);
router.delete('/vehicles/:id', requireVerifiedAccount, fleetController.deleteVehicle);

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
  requireVerifiedAccount,
  validateRequest({ body: batchStatusSyncSchema }),
  driverController.syncOfflineStatusUpdates
);

router.post(
  '/trips/:id/positions/batch-sync',
  requireVerifiedAccount,
  validateRequest({ body: batchPositionsSyncSchema }),
  driverController.syncOfflinePositions
);

router.get('/earnings', driverController.getEarningsSummary);

// Fleet invitations: a driver joins a fleet only by accepting (C-10)
router.get('/fleet-invitations', driverController.listFleetInvitations);
router.post('/fleet-invitations/:id/accept', requireVerifiedAccount, driverController.acceptFleetInvitation);
router.post('/fleet-invitations/:id/decline', driverController.declineFleetInvitation);

module.exports = router;
