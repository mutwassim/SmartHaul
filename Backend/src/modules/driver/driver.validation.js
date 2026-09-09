const { z } = require('zod');
const { SHIPMENT_STATUS } = require('../../config/constants');

const submitBidSchema = z.object({
  shipmentId: z.string().uuid('Valid Shipment UUID required'),
  proposedFare: z.number().positive('Proposed fare must be greater than 0 PKR'),
  estimatedDeliveryTime: z.string().refine(
    (val) => new Date(val) > new Date(),
    'Estimated delivery time must be in the future'
  ),
  offeredVehicleType: z.string().optional(),
});

const updateBidSchema = z.object({
  proposedFare: z.number().positive('Proposed fare must be greater than 0 PKR').optional(),
  estimatedDeliveryTime: z.string().optional(),
});

const updateTripStatusSchema = z.object({
  status: z.enum([
    SHIPMENT_STATUS.REACHED_PICKUP,
    SHIPMENT_STATUS.CARGO_LOADED,
    SHIPMENT_STATUS.IN_TRANSIT,
    SHIPMENT_STATUS.REACHED_DESTINATION,
    SHIPMENT_STATUS.DELIVERED,
    SHIPMENT_STATUS.CANCELLED,
  ]),
  note: z.string().optional(),
  timestamp: z.string().optional(), // For preserved client timestamp
});

const batchStatusSyncSchema = z.object({
  statusUpdates: z.array(
    z.object({
      status: z.string(),
      timestamp: z.string(),
      note: z.string().optional(),
    })
  ).min(1),
});

const batchPositionsSyncSchema = z.object({
  positions: z.array(
    z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().min(0),
      timestamp: z.string(),
    })
  ).min(1),
});

module.exports = {
  submitBidSchema,
  updateBidSchema,
  updateTripStatusSchema,
  batchStatusSyncSchema,
  batchPositionsSyncSchema,
};
