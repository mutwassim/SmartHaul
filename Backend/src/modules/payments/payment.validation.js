const { z } = require('zod');
const { PAYMENT_STATUS } = require('../../config/constants');

const updatePaymentStatusSchema = z.object({
  status: z.enum([PAYMENT_STATUS.PARTIAL, PAYMENT_STATUS.PAID]),
  amountReceived: z.number().min(0).optional(),
  note: z.string().optional(),
});

const raisePaymentDisputeSchema = z.object({
  description: z.string().min(5, 'Description of dispute is required'),
});

module.exports = {
  updatePaymentStatusSchema,
  raisePaymentDisputeSchema,
};
