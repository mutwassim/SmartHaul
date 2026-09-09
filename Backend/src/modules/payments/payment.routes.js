const express = require('express');
const router = express.Router();
const paymentController = require('./payment.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { validateRequest } = require('../../middleware/validate.middleware');
const {
  updatePaymentStatusSchema,
  raisePaymentDisputeSchema,
} = require('./payment.validation');

router.use(authenticate);

router.get('/', paymentController.listPaymentRecords);
router.get('/:id', paymentController.getPaymentRecordById);

router.post(
  '/:id/status',
  validateRequest({ body: updatePaymentStatusSchema }),
  paymentController.updatePaymentStatus
);

router.post(
  '/:id/dispute',
  validateRequest({ body: raisePaymentDisputeSchema }),
  paymentController.raisePaymentDispute
);

module.exports = router;
