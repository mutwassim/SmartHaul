const { z } = require('zod');

const provisionAdminSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email address required'),
  phone: z.string().min(10, 'Valid phone number required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const verificationDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().optional(),
});

const updateUserStatusSchema = z.object({
  status: z.enum(['VERIFIED', 'ACTIVE', 'SUSPENDED']),
  reason: z.string().min(3, 'Reason is required for status change (BR-28)'),
});

const resolveComplaintSchema = z.object({
  decision: z.enum(['RESOLVED', 'REJECTED']),
  adminRemarks: z.string().min(3, 'Admin written remarks are required (FR-AD-15)'),
  adjustedFare: z.number().positive().optional(),
  adjustedPaymentStatus: z.enum(['PENDING', 'PARTIAL', 'PAID']).optional(),
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
  resolveComplaintSchema,
  broadcastAnnouncementSchema,
};
