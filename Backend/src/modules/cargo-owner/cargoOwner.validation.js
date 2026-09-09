const { z } = require('zod');
const { VEHICLE_TYPES } = require('../../config/constants');

const vehicleTypeEnum = z.enum(Object.keys(VEHICLE_TYPES));

const previewRouteSchema = z.object({
  pickupLat: z.number().min(-90).max(90),
  pickupLng: z.number().min(-180).max(180),
  dropoffLat: z.number().min(-90).max(90),
  dropoffLng: z.number().min(-180).max(180),
});

const createShipmentSchema = z.object({
  pickupAddress: z.string().min(3, 'Pickup address is required'),
  pickupLat: z.number().min(-90).max(90),
  pickupLng: z.number().min(-180).max(180),
  pickupContactName: z.string().optional(),
  pickupContactPhone: z.string().optional(),
  
  dropoffAddress: z.string().min(3, 'Dropoff address is required'),
  dropoffLat: z.number().min(-90).max(90),
  dropoffLng: z.number().min(-180).max(180),
  dropoffContactName: z.string().optional(),
  dropoffContactPhone: z.string().optional(),

  cargoType: z.string().min(2, 'Cargo type is required'),
  cargoWeight: z.number().positive('Cargo weight must be greater than 0 tonnes'),
  cargoDimensions: z.string().optional(),
  requiredVehicleType: vehicleTypeEnum,
  expectedDeliveryDate: z.string().refine(
    (dateStr) => new Date(dateStr) >= new Date(new Date().setHours(0, 0, 0, 0)),
    'Expected delivery date cannot be in the past (BR-6)'
  ),
  isDraft: z.boolean().default(false),
});

const acceptBidSchema = z.object({
  bidId: z.string().uuid('Valid Bid UUID required'),
});

const cancelShipmentSchema = z.object({
  reason: z.string().min(3, 'Cancellation reason is required'),
});

module.exports = {
  previewRouteSchema,
  createShipmentSchema,
  acceptBidSchema,
  cancelShipmentSchema,
};
