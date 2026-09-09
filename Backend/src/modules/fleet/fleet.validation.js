const { z } = require('zod');
const { VEHICLE_TYPES } = require('../../config/constants');

const vehicleTypeEnum = z.enum(Object.keys(VEHICLE_TYPES));

const addVehicleSchema = z.object({
  registrationNumber: z.string().min(3, 'Vehicle registration number is required'),
  vehicleType: vehicleTypeEnum,
  ratedCapacity: z.number().positive('Rated capacity must be greater than 0 tonnes'),
  model: z.string().min(2, 'Vehicle model is required'),
  year: z.number().int().min(1980).max(new Date().getFullYear() + 1),
  defaultDriverId: z.string().uuid().optional(),
});

const updateVehicleSchema = z.object({
  model: z.string().optional(),
  year: z.number().int().optional(),
  availabilityStatus: z.enum(['AVAILABLE', 'ASSIGNED', 'INACTIVE', 'UNDER_MAINTENANCE']).optional(),
  defaultDriverId: z.string().uuid().nullable().optional(),
});

const addDriverSchema = z.object({
  driverId: z.string().uuid('Valid Driver user UUID required').optional(),
  phone: z.string().optional(),
}).refine(data => data.driverId || data.phone, {
  message: 'Either driverId or phone must be provided',
});

const assignResourceSchema = z.object({
  shipmentId: z.string().uuid('Valid Shipment UUID required'),
  vehicleId: z.string().uuid('Valid Vehicle UUID required'),
  driverId: z.string().uuid('Valid Driver UUID required'),
});

module.exports = {
  addVehicleSchema,
  updateVehicleSchema,
  addDriverSchema,
  assignResourceSchema,
};
