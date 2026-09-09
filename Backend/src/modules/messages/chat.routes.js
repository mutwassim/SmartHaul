const express = require('express');
const router = express.Router();
const chatController = require('./chat.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.use(authenticate);

router.get('/shipment/:shipmentId', chatController.getShipmentMessages);
router.post('/shipment/:shipmentId', chatController.sendShipmentMessage);

module.exports = router;
