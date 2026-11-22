const express = require('express');
const router = express.Router();
const ratingController = require('./rating.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { blockSuspended } = require('../../middleware/verification.middleware');

router.use(authenticate);
router.use(blockSuspended);

router.post('/', ratingController.submitRating);
router.get('/user/:userId', ratingController.getUserRatings);

module.exports = router;
