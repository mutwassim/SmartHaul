const { z } = require('zod');
const { PAYMENT_STATUS, LIMITS } = require('../../config/constants');

const updatePaymentStatusSchema = z.object({
  status: z.enum([PAYMENT_STATUS.PARTIAL, PAYMENT_STATUS.PAID]),
  amountReceived: z.number().finite().min(0).optional(),
  note: z.string().max(500).optional(),
});

const raisePaymentDisputeSchema = z.object({
  description: z
    .string()
    .trim()
    .min(5, 'Description of dispute is required')
    .max(LIMITS.MAX_COMPLAINT_DESCRIPTION),
});

module.exports = {
  updatePaymentStatusSchema,
  raisePaymentDisputeSchema,
};
