const express = require('express');
const router = express.Router();
const trackingController = require('./tracking.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.use(authenticate);

router.get('/shipment/:shipmentId', trackingController.getLiveShipmentTracking);
router.get('/trip/:tripId/history', trackingController.getTripRouteHistory);

module.exports = router;
