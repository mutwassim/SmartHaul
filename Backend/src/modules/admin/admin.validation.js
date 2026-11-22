const { z } = require('zod');
const { passwordRegex, phoneSchema, emailSchema } = require('../auth/auth.validation');

const provisionAdminSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: emailSchema,
  phone: phoneSchema,
  password: z.string().regex(
    passwordRegex,
    'Password must be at least 8 characters and contain an uppercase letter, a lowercase letter, a number and a special character'
  ),
});

const verificationDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().optional(),
});

const updateUserStatusSchema = z.object({
  status: z.enum(['VERIFIED', 'ACTIVE', 'SUSPENDED']),
  reason: z.string().min(3, 'Reason is required for status change (BR-28)'),
});

const issueResetTokenSchema = z.object({
  reason: z.string().min(3, 'Reason is required (identity check performed)'),
});

const resolveComplaintSchema = z.object({
  decision: z.enum(['RESOLVED', 'REJECTED']),
  adminRemarks: z.string().min(3, 'Admin written remarks are required (FR-AD-10)'),
  adjustedFare: z.number().positive().optional(),
  adjustedPaymentStatus: z.enum(['PENDING', 'PARTIAL', 'PAID']).optional(),
  waivePenalty: z.boolean().optional(), // Cancellation disputes only: lifts the no-show penalty
});

const broadcastAnnouncementSchema = z.object({
  title: z.string().min(3, 'Title is required'),
  message: z.string().min(5, 'Message content is required'),
  targetRole: z.enum(['ALL', 'CARGO_OWNER', 'DRIVER', 'FLEET_OWNER']).default('ALL'),
});

module.exports = {
  provisionAdminSchema,
  verificationDecisionSchema,
  updateUserStatusSchema,
  issueResetTokenSchema,
  resolveComplaintSchema,
  broadcastAnnouncementSchema,
};
