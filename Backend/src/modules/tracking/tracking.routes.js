const express = require('express');
const router = express.Router();
const trackingController = require('./tracking.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { blockSuspended } = require('../../middleware/verification.middleware');

router.use(authenticate);
router.use(blockSuspended);

router.get('/shipment/:shipmentId', trackingController.getLiveShipmentTracking);
router.get('/trip/:tripId/history', trackingController.getTripRouteHistory);

module.exports = router;
