const express = require('express');
const router = express.Router();
const cargoOwnerController = require('./cargoOwner.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { blockSuspended } = require('../../middleware/verification.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const { validateRequest } = require('../../middleware/validate.middleware');
const { ROLES } = require('../../config/constants');
const {
  previewRouteSchema,
  createShipmentSchema,
  acceptBidSchema,
  cancelShipmentSchema,
  noShowSchema,
} = require('./cargoOwner.validation');

router.use(authenticate);
router.use(blockSuspended);

router.post(
  '/preview-route',
  validateRequest({ body: previewRouteSchema }),
  cargoOwnerController.previewRoute
);

router.post(
  '/',
  requireRole(ROLES.CARGO_OWNER),
  validateRequest({ body: createShipmentSchema }),
  cargoOwnerController.createShipment
);

router.get(
  '/',
  requireRole(ROLES.CARGO_OWNER),
  cargoOwnerController.listMyShipments
);

router.get(
  '/:id',
  cargoOwnerController.getShipmentById
);

router.post(
  '/:id/publish',
  requireRole(ROLES.CARGO_OWNER),
  cargoOwnerController.publishShipment
);

router.post(
  '/:id/accept-bid',
  requireRole(ROLES.CARGO_OWNER),
  validateRequest({ body: acceptBidSchema }),
  cargoOwnerController.acceptBid
);

router.post(
  '/:id/confirm-delivery',
  requireRole(ROLES.CARGO_OWNER),
  cargoOwnerController.confirmDelivery
);

router.post(
  '/:id/no-show',
  requireRole(ROLES.CARGO_OWNER),
  validateRequest({ body: noShowSchema }),
  cargoOwnerController.flagNoShow
);

router.put(
  '/:id/cancel',
  requireRole(ROLES.CARGO_OWNER),
  validateRequest({ body: cancelShipmentSchema }),
  cargoOwnerController.cancelShipment
);

router.post(
  '/:id/repeat',
  requireRole(ROLES.CARGO_OWNER),
  cargoOwnerController.repeatShipment
);

module.exports = router;
