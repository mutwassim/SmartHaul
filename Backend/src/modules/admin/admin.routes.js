const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const { validateRequest } = require('../../middleware/validate.middleware');
const { ROLES } = require('../../config/constants');
const {
  provisionAdminSchema,
  verificationDecisionSchema,
  updateUserStatusSchema,
  resolveComplaintSchema,
  broadcastAnnouncementSchema,
} = require('./admin.validation');

router.use(authenticate);
router.use(requireRole(ROLES.ADMIN));

// Admin provisioning (FR-AD-4)
router.post(
  '/provision-account',
  validateRequest({ body: provisionAdminSchema }),
  adminController.provisionAdmin
);

// Verification queue (FR-AD-5, FR-AD-6, FR-AD-7)
router.get('/verification-queue', adminController.getVerificationQueue);
router.get('/verification/:id/documents', adminController.getUserVerificationDocuments);
router.post(
  '/verification/:id/decision',
  validateRequest({ body: verificationDecisionSchema }),
  adminController.processVerificationDecision
);

// Account suspension/reinstatement (FR-AD-9)
router.post(
  '/users/:id/status',
  validateRequest({ body: updateUserStatusSchema }),
  adminController.updateUserAccountStatus
);

// Shipments directory & Exceptions monitoring (FR-AD-10, FR-AD-12)
router.get('/shipments', adminController.listAllShipments);
router.get('/shipments/exceptional', adminController.getExceptionalShipments);

// Complaint & Dispute resolution (FR-AD-13, FR-AD-14, FR-AD-16)
router.get('/complaints', adminController.listComplaints);
router.post(
  '/complaints/:id/resolve',
  validateRequest({ body: resolveComplaintSchema }),
  adminController.resolveComplaint
);

// Immutable audit logs (FR-AD-19, BR-28)
router.get('/audit-logs', adminController.getAuditLogs);

// Announcements (FR-AD-20)
router.post(
  '/announcements',
  validateRequest({ body: broadcastAnnouncementSchema }),
  adminController.broadcastAnnouncement
);

module.exports = router;
