const prisma = require('../../config/db');
const { uploadVerificationDocument, generateSignedReadUrl } = require('../../services/storage.service');
const { successResponse, errorResponse } = require('../../utils/response');
const { ROLES, ACCOUNT_STATUS } = require('../../config/constants');

/**
 * Get current user profile
 */
async function getProfile(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        email: true,
        accountStatus: true,
        businessName: true,
        businessAddress: true,
        serviceArea: true,
        preferredLanguage: true,
        avgRating: true,
        totalRatings: true,
        completedTripsCount: true,
        createdAt: true,
        driverVehicle: {
          select: {
            id: true,
            vehicleType: true,
            ratedCapacity: true,
            model: true,
            year: true,
            availabilityStatus: true,
          },
        },
        fleetDrivers: {
          select: {
            driver: {
              select: { id: true, name: true, phone: true, accountStatus: true },
            },
          },
        },
      },
    });

    return successResponse(res, user, 'Profile retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Update user profile
 * Requirement: FR-CO-1, FR-DR-1, FR-FO-2
 */
async function updateProfile(req, res, next) {
  try {
    const { name, phone, businessName, businessAddress, serviceArea, preferredLanguage } = req.body;

    // If phone is updated, check uniqueness within role (BR-1)
    if (phone && phone !== req.user.phone) {
      const existing = await prisma.user.findFirst({
        where: { phone, role: req.user.role, NOT: { id: req.user.id } },
      });
      if (existing) {
        return errorResponse(res, 'PHONE_ALREADY_EXISTS', 'Phone number is already registered by another account in this role', 409);
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(name ? { name } : {}),
        ...(phone ? { phone } : {}),
        ...(businessName !== undefined ? { businessName } : {}),
        ...(businessAddress !== undefined ? { businessAddress } : {}),
        ...(serviceArea ? { serviceArea } : {}),
        ...(preferredLanguage ? { preferredLanguage } : {}),
      },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        email: true,
        accountStatus: true,
        businessName: true,
        businessAddress: true,
        serviceArea: true,
        preferredLanguage: true,
      },
    });

    return successResponse(res, updated, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Upload verification document
 * Requirement: FR-SV-11, SI-4.1, SI-4.3
 */
async function uploadDocument(req, res, next) {
  try {
    if (!req.file) {
      return errorResponse(res, 'FILE_MISSING', 'Document file is required', 400);
    }

    const { documentType, expiryDate } = req.body;
    if (!documentType) {
      return errorResponse(res, 'DOC_TYPE_REQUIRED', 'documentType is required', 400);
    }

    // Save to object storage
    const uploadResult = await uploadVerificationDocument(req.file, req.user.id, documentType);

    // Save metadata in database (FR-SV-14)
    const doc = await prisma.verificationDocument.create({
      data: {
        userId: req.user.id,
        documentType,
        storageKey: uploadResult.storageKey,
        originalFilename: uploadResult.originalFilename,
        mimeType: uploadResult.mimeType,
        fileSizeBytes: uploadResult.fileSizeBytes,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        verificationStatus: 'PENDING',
      },
    });

    return successResponse(
      res,
      {
        id: doc.id,
        documentType: doc.documentType,
        verificationStatus: doc.verificationStatus,
        expiryDate: doc.expiryDate,
        createdAt: doc.createdAt,
      },
      'Document uploaded successfully and queued for administrator verification',
      201
    );
  } catch (error) {
    next(error);
  }
}

/**
 * List uploaded documents for user
 */
async function listDocuments(req, res, next) {
  try {
    const docs = await prisma.verificationDocument.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    const transformed = docs.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      verificationStatus: d.verificationStatus,
      expiryDate: d.expiryDate,
      rejectionReason: d.rejectionReason,
      viewUrl: generateSignedReadUrl(d.storageKey),
      createdAt: d.createdAt,
    }));

    return successResponse(res, transformed, 'Documents retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Saved locations management (FR-CO-2)
 */
async function getSavedLocations(req, res, next) {
  try {
    const locations = await prisma.savedLocation.findMany({
      where: { userId: req.user.id },
      orderBy: { isDefault: 'desc' },
    });
    return successResponse(res, locations, 'Saved locations retrieved');
  } catch (error) {
    next(error);
  }
}

async function addSavedLocation(req, res, next) {
  try {
    const { label, address, latitude, longitude, isDefault } = req.body;

    if (isDefault) {
      // Unset existing defaults
      await prisma.savedLocation.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
    }

    const location = await prisma.savedLocation.create({
      data: {
        userId: req.user.id,
        label,
        address,
        latitude,
        longitude,
        isDefault: isDefault || false,
      },
    });

    return successResponse(res, location, 'Saved location added', 201);
  } catch (error) {
    next(error);
  }
}

async function deleteSavedLocation(req, res, next) {
  try {
    const { id } = req.params;
    await prisma.savedLocation.deleteMany({
      where: { id, userId: req.user.id },
    });
    return successResponse(res, null, 'Saved location removed');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  uploadDocument,
  listDocuments,
  getSavedLocations,
  addSavedLocation,
  deleteSavedLocation,
};
