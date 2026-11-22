const { z } = require('zod');
const { phoneSchema } = require('../auth/auth.validation');

const DOCUMENT_TYPES = ['CNIC_FRONT', 'CNIC_BACK', 'DRIVING_LICENCE', 'VEHICLE_REGISTRATION', 'BUSINESS_REGISTRATION'];

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: phoneSchema.optional(),
  businessName: z.string().trim().max(150).optional(),
  businessAddress: z.string().trim().max(300).optional(),
  serviceArea: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  preferredLanguage: z.enum(['EN', 'UR']).optional(),
});

const uploadDocumentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES, {
    errorMap: () => ({ message: `documentType must be one of ${DOCUMENT_TYPES.join(', ')}` }),
  }),
  expiryDate: z
    .string()
    .optional()
    .refine((v) => v === undefined || v === '' || !Number.isNaN(Date.parse(v)), 'expiryDate must be a valid date')
    .refine((v) => !v || Date.parse(v) > Date.now(), 'expiryDate must be in the future'),
});

const savedLocationSchema = z.object({
  label: z.string().trim().min(1).max(50),
  address: z.string().trim().min(1).max(300),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  isDefault: z.boolean().optional(),
});

module.exports = { updateProfileSchema, uploadDocumentSchema, savedLocationSchema, DOCUMENT_TYPES };
