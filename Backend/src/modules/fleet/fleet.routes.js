const express = require('express');
const router = express.Router();
const fleetController = require('./fleet.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const { requireVerifiedAccount } = require('../../middleware/verification.middleware');
const { validateRequest } = require('../../middleware/validate.middleware');
const { ROLES } = require('../../config/constants');
const {
  addVehicleSchema,
  updateVehicleSchema,
  addDriverSchema,
  assignResourceSchema,
} = require('./fleet.validation');

router.use(authenticate);
router.use(requireRole(ROLES.FLEET_OWNER));

// Vehicle register (requires verified account, BR-3)
router.get('/vehicles', fleetController.listVehicles);

router.post(
  '/vehicles',
  requireVerifiedAccount,
  validateRequest({ body: addVehicleSchema }),
  fleetController.addVehicle
);

router.put(
  '/vehicles/:id',
  requireVerifiedAccount,
  validateRequest({ body: updateVehicleSchema }),
  fleetController.updateVehicle
);

router.delete('/vehicles/:id', requireVerifiedAccount, fleetController.deleteVehicle);

// Driver register
router.get('/drivers', fleetController.listDrivers);
router.get('/drivers/available', fleetController.listAvailableDrivers);

router.post(
  '/drivers',
  requireVerifiedAccount,
  validateRequest({ body: addDriverSchema }),
  fleetController.linkDriver
);

router.delete('/drivers/:id', requireVerifiedAccount, fleetController.unlinkDriver);

// Post-award resource assignment
router.post(
  '/assign',
  requireVerifiedAccount,
  validateRequest({ body: assignResourceSchema }),
  fleetController.assignTripResources
);

// Live map & performance analytics
router.get('/live-map', fleetController.getFleetLiveMap);
router.get('/reports/driver-performance', fleetController.getDriverPerformance);
router.get('/reports/vehicle-utilization', fleetController.getVehicleUtilization);

module.exports = router;
