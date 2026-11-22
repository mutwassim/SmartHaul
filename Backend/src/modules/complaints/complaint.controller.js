const fs = require('fs');
const prisma = require('../../config/db');
const { uploadComplaintAttachment, generateSignedReadUrl, getAbsolutePath } = require('../../services/storage.service');
const { dispatchNotification } = require('../../services/fcm.service');
const { getPaginationParams, buildPaginationMeta } = require('../../utils/pagination');
const { successResponse, errorResponse } = require('../../utils/response');
const { nextReference } = require('../../utils/reference');
const { COMPLAINT_CATEGORIES, ROLES, LIMITS } = require('../../config/constants');

const OPEN_STATUSES = ['PENDING', 'UNDER_REVIEW'];

async function removeFiles(keys) {
  for (const key of keys) {
    try {
      await fs.promises.unlink(getAbsolutePath(key));
    } catch (e) {
      // best effort: an orphaned file is harmless, a failed clean-up must not hide the real error
    }
  }
}

/**
 * File a complaint on an active or completed shipment
 * Requirement: FR-CO-16, FR-DR-18, FR-FO-17, BR-26, UC-11
 */
async function createComplaint(req, res, next) {
  const attachmentKeys = [];
  try {
    const { shipmentId, category } = req.body;
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';

    // Validate category from Table C-4 (own keys only: 'constructor' is not a category)
    if (typeof category !== 'string' || !Object.prototype.hasOwnProperty.call(COMPLAINT_CATEGORIES, category)) {
      return errorResponse(res, 'INVALID_CATEGORY', 'Specified complaint category is invalid (Table C-4)', 400);
    }

    if (description.length < 5 || description.length > LIMITS.MAX_COMPLAINT_DESCRIPTION) {
      return errorResponse(
        res,
        'INVALID_DESCRIPTION',
        `A description of 5 to ${LIMITS.MAX_COMPLAINT_DESCRIPTION} characters is required (FR-CO-16).`,
        400
      );
    }

    if (typeof shipmentId !== 'string' || !shipmentId) {
      return errorResponse(res, 'SHIPMENT_REQUIRED', 'A shipment is required', 400);
    }

    if (req.files && req.files.length > LIMITS.MAX_COMPLAINT_IMAGES) {
      return errorResponse(
        res,
        'TOO_MANY_ATTACHMENTS',
        `Maximum ${LIMITS.MAX_COMPLAINT_IMAGES} attachments allowed (FR-CO-16)`,
        400
      );
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { trip: true, paymentRecord: true },
    });

    if (!shipment) {
      return errorResponse(res, 'SHIPMENT_NOT_FOUND', 'Shipment not found', 404);
    }

    // Precondition: user must be party to shipment (BR-26)
    const payeeId = shipment.paymentRecord
      ? shipment.paymentRecord.payeeId || shipment.paymentRecord.fleetOwnerId || shipment.paymentRecord.driverId
      : null;
    const isCargoOwner = shipment.cargoOwnerId === req.user.id;
    const isPayee = payeeId === req.user.id;
    const isDriver = shipment.trip && shipment.trip.driverId === req.user.id;
    const isFleetOwner = shipment.trip && shipment.trip.fleetOwnerId === req.user.id;

    if (!isCargoOwner && !isPayee && !isDriver && !isFleetOwner) {
      // A party penalised for a no-show has lost the booking but may contest the penalty
      const penalty = await prisma.driverPenalty.findFirst({
        where: { shipmentId, userId: req.user.id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!penalty) {
        return errorResponse(res, 'FORBIDDEN', 'Only parties to this shipment may raise a complaint (BR-26)', 403);
      }
      if (category !== COMPLAINT_CATEGORIES.CANCELLATION_DISPUTE) {
        return errorResponse(res, 'FORBIDDEN', 'A no-show penalty can be contested only as a cancellation dispute.', 403);
      }
    }

    const isPaymentDispute = category === COMPLAINT_CATEGORIES.PAYMENT_DISPUTE;

    if (isPaymentDispute) {
      if (!shipment.paymentRecord) {
        return errorResponse(res, 'NO_PAYMENT_RECORD', 'This shipment has no payment record to dispute', 422);
      }
      // An employee driver is not a party to the payment (C-09)
      if (!isCargoOwner && !isPayee) {
        return errorResponse(res, 'FORBIDDEN', 'Only the cargo owner or the party being paid may dispute a payment (BR-26)', 403);
      }
    }

    // Determine counterparty
    let counterpartyId = null;
    if (isCargoOwner) {
      counterpartyId = payeeId || (shipment.trip ? shipment.trip.driverId || shipment.trip.fleetOwnerId : null);
    } else {
      counterpartyId = shipment.cargoOwnerId;
    }

    // An identical open complaint is declined and the existing one is named (FR-CO-16, UC-11 E2)
    const openDuplicate = await prisma.complaint.findFirst({
      where: { shipmentId, submitterId: req.user.id, category, status: { in: ['PENDING', 'UNDER_REVIEW'] } },
      select: { referenceCode: true },
    });
    if (openDuplicate) {
      return errorResponse(
        res,
        'DUPLICATE_COMPLAINT',
        `You already have an open ${category} complaint on this shipment (${openDuplicate.referenceCode}).`,
        409
      );
    }

    const year = new Date().getFullYear();
    const referenceCode = await nextReference(prisma.complaint, 'referenceCode', `CMP-${year}-`, 4);

    // Files are written first because their keys are stored on the record; they are removed again if the record is not saved
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        attachmentKeys.push(await uploadComplaintAttachment(file, referenceCode));
      }
    }

    const complaint = await prisma.$transaction(async (tx) => {
      // The freeze is the lock: one open dispute per payment (C-39, BR-25)
      if (isPaymentDispute) {
        const frozen = await tx.paymentRecord.updateMany({
          where: { id: shipment.paymentRecord.id, isFrozen: false },
          data: { isFrozen: true },
        });
        if (frozen.count !== 1) return null;
      }

      return tx.complaint.create({
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

    if (!complaint) {
      await removeFiles(attachmentKeys);
      return errorResponse(
        res,
        'DISPUTE_ALREADY_OPEN',
        'A dispute is already open on this payment. It must be resolved or withdrawn first.',
        409
      );
    }

    // Notify administrators (FR-NC-10)
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

    return successResponse(res, complaint, 'Complaint filed successfully and queued for review (FR-CO-16)', 201);
  } catch (error) {
    await removeFiles(attachmentKeys);
    next(error);
  }
}

/**
 * List complaints for the logged in user
 * Requirement: FR-CO-17, FR-DR-18
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

    const withdrawn = await prisma.$transaction(async (tx) => {
      // Conditional: a complaint an administrator picked up in the meantime is no longer withdrawable
      const updated = await tx.complaint.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'WITHDRAWN' },
      });
      if (updated.count !== 1) return false;

      // Unfreeze the payment only when no other payment dispute on the shipment is still open (C-39, BR-25)
      if (
        complaint.category === COMPLAINT_CATEGORIES.PAYMENT_DISPUTE &&
        complaint.shipment &&
        complaint.shipment.paymentRecord
      ) {
        const stillOpen = await tx.complaint.count({
          where: {
            shipmentId: complaint.shipmentId,
            category: COMPLAINT_CATEGORIES.PAYMENT_DISPUTE,
            status: { in: OPEN_STATUSES },
            id: { not: id },
          },
        });
        if (stillOpen === 0) {
          await tx.paymentRecord.update({
            where: { id: complaint.shipment.paymentRecord.id },
            data: { isFrozen: false },
          });
        }
      }
      return true;
    });

    if (!withdrawn) {
      return errorResponse(res, 'CANNOT_WITHDRAW', 'Only pending complaints can be withdrawn', 409);
    }

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
