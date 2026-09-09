const express = require('express');
const router = express.Router();
const ratingController = require('./rating.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.use(authenticate);

router.post('/', ratingController.submitRating);
router.get('/user/:userId', ratingController.getUserRatings);

module.exports = router;
