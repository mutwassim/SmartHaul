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
  issueResetTokenSchema,
  resolveComplaintSchema,
  broadcastAnnouncementSchema,
} = require('./admin.validation');

router.use(authenticate);
router.use(requireRole(ROLES.ADMIN));

// Admin provisioning (FR-AD-1)
router.post(
  '/provision-account',
  validateRequest({ body: provisionAdminSchema }),
  adminController.provisionAdmin
);

// Verification queue (FR-AD-2, FR-AD-3, FR-AD-4)
router.get('/verification-queue', adminController.getVerificationQueue);
router.get('/verification/:id/documents', adminController.getUserVerificationDocuments);
router.post(
  '/verification/:id/decision',
  validateRequest({ body: verificationDecisionSchema }),
  adminController.processVerificationDecision
);

// User directory (FR-SV-11)
router.get('/users', adminController.listUsers);

// Password recovery: admin issues the reset token after confirming identity (FR-SV-4)
router.post(
  '/users/:id/reset-token',
  validateRequest({ body: issueResetTokenSchema }),
  adminController.issuePasswordResetToken
);

// Account suspension/reinstatement (FR-AD-5)
router.post(
  '/users/:id/status',
  validateRequest({ body: updateUserStatusSchema }),
  adminController.updateUserAccountStatus
);

// Shipments directory & Exceptions monitoring (FR-AD-6, FR-AD-8)
router.get('/shipments', adminController.listAllShipments);
router.get('/shipments/exceptional', adminController.getExceptionalShipments);

// Complaint & Dispute resolution (FR-AD-9, FR-AD-10, FR-AD-11)
router.get('/complaints', adminController.listComplaints);
router.post(
  '/complaints/:id/resolve',
  validateRequest({ body: resolveComplaintSchema }),
  adminController.resolveComplaint
);

// Immutable audit logs (FR-AD-13, BR-28)
router.get('/audit-logs', adminController.getAuditLogs);

// Announcements (FR-AD-14)
router.post(
  '/announcements',
  validateRequest({ body: broadcastAnnouncementSchema }),
  adminController.broadcastAnnouncement
);

module.exports = router;
