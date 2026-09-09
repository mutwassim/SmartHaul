const express = require('express');
const router = express.Router();
const analyticsController = require('./analytics.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const { ROLES } = require('../../config/constants');

router.use(authenticate);

// Platform summary for admins
router.get('/platform-summary', requireRole(ROLES.ADMIN), analyticsController.getPlatformSummary);
router.get('/verifications', requireRole(ROLES.ADMIN), analyticsController.getVerificationThroughput);
router.get('/route-demand', requireRole(ROLES.ADMIN, ROLES.FLEET_OWNER), analyticsController.getRouteDemand);
router.get('/empty-running', requireRole(ROLES.ADMIN, ROLES.FLEET_OWNER), analyticsController.getEmptyRunningReport);
router.get('/export', requireRole(ROLES.ADMIN, ROLES.FLEET_OWNER), analyticsController.exportReport);

module.exports = router;
