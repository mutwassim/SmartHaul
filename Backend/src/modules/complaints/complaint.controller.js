const prisma = require('../../config/db');
const { uploadComplaintAttachment, generateSignedReadUrl } = require('../../services/storage.service');
const { dispatchNotification } = require('../../services/fcm.service');
const { getPaginationParams, buildPaginationMeta } = require('../../utils/pagination');
const { successResponse, errorResponse } = require('../../utils/response');
const { COMPLAINT_CATEGORIES, ROLES, LIMITS } = require('../../config/constants');

/**
 * File a complaint on an active or completed shipment
 * Requirement: FR-CO-25, FR-DR-23, FR-FO-20, BR-26, UC-11
 */
async function createComplaint(req, res, next) {
  try {
    const { shipmentId, category, description } = req.body;

    // Validate category from Table C-4
    if (!COMPLAINT_CATEGORIES[category]) {
      return errorResponse(res, 'INVALID_CATEGORY', 'Specified complaint category is invalid (Table C-4)', 400);
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { trip: true, paymentRecord: true },
    });

    if (!shipment) {
      return errorResponse(res, 'SHIPMENT_NOT_FOUND', 'Shipment not found', 404);
    }

    // Precondition: user must be party to shipment (BR-26)
    const isCargoOwner = shipment.cargoOwnerId === req.user.id;
    const isDriver = shipment.trip && shipment.trip.driverId === req.user.id;
    const isFleetOwner = shipment.trip && shipment.trip.fleetOwnerId === req.user.id;

    if (!isCargoOwner && !isDriver && !isFleetOwner) {
      return errorResponse(res, 'FORBIDDEN', 'Only parties to this shipment may raise a complaint (BR-26)', 403);
    }

    // Determine counterparty
    let counterpartyId = null;
    if (isCargoOwner) {
      counterpartyId = shipment.trip ? shipment.trip.driverId || shipment.trip.fleetOwnerId : null;
    } else {
      counterpartyId = shipment.cargoOwnerId;
    }

    // Handle optional attachments (up to 3 images, FR-CO-25)
    const attachmentKeys = [];
    const year = new Date().getFullYear();
    const count = await prisma.complaint.count();
    const referenceCode = `CMP-${year}-${String(count + 1).padStart(4, '0')}`;

    if (req.files && req.files.length > 0) {
      if (req.files.length > LIMITS.MAX_COMPLAINT_IMAGES) {
        return errorResponse(
          res,
          'TOO_MANY_ATTACHMENTS',
          `Maximum ${LIMITS.MAX_COMPLAINT_IMAGES} attachments allowed (FR-CO-25)`,
          400
        );
      }
      for (const file of req.files) {
        const key = await uploadComplaintAttachment(file, referenceCode);
        attachmentKeys.push(key);
      }
    }

    // If category is PAYMENT_DISPUTE, freeze payment record (BR-25)
    const isPaymentDispute = category === COMPLAINT_CATEGORIES.PAYMENT_DISPUTE;

    const complaint = await prisma.$transaction(async (tx) => {
      if (isPaymentDispute && shipment.paymentRecord) {
        await tx.paymentRecord.update({
          where: { id: shipment.paymentRecord.id },
          data: { isFrozen: true },
        });
      }

      return await tx.complaint.create({
        data: {
          referenceCode,
          shipmentId,
          submitterId: req.user.id,
          counterpartyId,
          category,
          description,
          attachmentKeys,
          status: 'PENDING',
        },
      });
    });

    // Notify administrators (FR-NC-11)
    const admins = await prisma.user.findMany({
      where: { role: ROLES.ADMIN },
      select: { id: true },
    });

    for (const admin of admins) {
      await dispatchNotification({
        recipientId: admin.id,
        type: 'COMPLAINT_RECEIVED',
        title: 'New Complaint Filed',
        message: `Complaint ${referenceCode} (${category}) filed for shipment ${shipment.shipmentNumber}.`,
        relatedShipmentId: shipmentId,
      });
    }

    return successResponse(res, complaint, 'Complaint filed successfully and queued for review (FR-CO-25)', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * List complaints for the logged in user
 * Requirement: FR-CO-26, FR-DR-23
 */
async function listMyComplaints(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);

    const whereClause = {
      OR: [{ submitterId: req.user.id }, { counterpartyId: req.user.id }],
    };

    const [total, complaints] = await Promise.all([
      prisma.complaint.count({ where: whereClause }),
      prisma.complaint.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          shipment: { select: { id: true, shipmentNumber: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const transformed = complaints.map((c) => ({
      ...c,
      signedAttachmentUrls: c.attachmentKeys.map((k) => generateSignedReadUrl(k)),
    }));

    return successResponse(res, transformed, 'Complaints retrieved', 200, buildPaginationMeta(total, page, limit));
  } catch (error) {
    next(error);
  }
}

/**
 * Withdraw a pending complaint
 * Requirement: UC-11 alternative flow 11.2, BR-27
 */
async function withdrawComplaint(req, res, next) {
  try {
    const { id } = req.params;

    const complaint = await prisma.complaint.findUnique({
      where: { id },
      include: { shipment: { include: { paymentRecord: true } } },
    });

    if (!complaint || complaint.submitterId !== req.user.id) {
      return errorResponse(res, 'NOT_FOUND', 'Complaint not found or unauthorized', 404);
    }

    if (complaint.status !== 'PENDING') {
      return errorResponse(res, 'CANNOT_WITHDRAW', 'Only pending complaints can be withdrawn', 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.complaint.update({
        where: { id },
        data: { status: 'WITHDRAWN' },
      });

      // Unfreeze payment record if this was a payment dispute
      if (
        complaint.category === COMPLAINT_CATEGORIES.PAYMENT_DISPUTE &&
        complaint.shipment &&
        complaint.shipment.paymentRecord
      ) {
        await tx.paymentRecord.update({
          where: { id: complaint.shipment.paymentRecord.id },
          data: { isFrozen: false },
        });
      }
    });

    return successResponse(res, null, 'Complaint withdrawn successfully');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createComplaint,
  listMyComplaints,
  withdrawComplaint,
};
