const express = require('express');
const router = express.Router();
const chatController = require('./chat.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { blockSuspended } = require('../../middleware/verification.middleware');

router.use(authenticate);
router.use(blockSuspended);

router.get('/shipment/:shipmentId', chatController.getShipmentMessages);
router.post('/shipment/:shipmentId', chatController.sendShipmentMessage);

module.exports = router;
