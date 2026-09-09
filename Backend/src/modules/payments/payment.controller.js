const prisma = require('../../config/db');
const { dispatchNotification } = require('../../services/fcm.service');
const { getPaginationParams, buildPaginationMeta } = require('../../utils/pagination');
const { successResponse, errorResponse } = require('../../utils/response');
const {
  ROLES,
  PAYMENT_STATUS,
  SHIPMENT_STATUS,
  COMPLAINT_CATEGORIES,
} = require('../../config/constants');

/**
 * List payment records by role
 * Requirement: FR-PM-4, SEC-10
 */
async function listPaymentRecords(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { status } = req.query;

    let whereClause = {};

    if (req.user.role === ROLES.CARGO_OWNER) {
      whereClause.cargoOwnerId = req.user.id;
    } else if (req.user.role === ROLES.DRIVER) {
      whereClause.driverId = req.user.id;
    } else if (req.user.role === ROLES.FLEET_OWNER) {
      whereClause.fleetOwnerId = req.user.id;
    } else if (req.user.role === ROLES.ADMIN) {
      // Admin sees all
    }

    if (status) {
      whereClause.status = status;
    }

    const [total, records] = await Promise.all([
      prisma.paymentRecord.count({ where: whereClause }),
      prisma.paymentRecord.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          shipment: {
            select: {
              id: true,
              shipmentNumber: true,
              status: true,
              pickupAddress: true,
              dropoffAddress: true,
              cargoType: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return successResponse(
      res,
      records,
      'Payment records retrieved (FR-PM-4)',
      200,
      buildPaginationMeta(total, page, limit)
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Get detailed payment record with audit history
 * Requirement: FR-PM-4, FR-PM-6, FR-CO-22
 */
async function getPaymentRecordById(req, res, next) {
  try {
    const { id } = req.params;

    const record = await prisma.paymentRecord.findUnique({
      where: { id },
      include: {
        shipment: true,
        statusLogs: {
          include: {
            changedBy: { select: { id: true, name: true, role: true } },
          },
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!record) {
      return errorResponse(res, 'RECORD_NOT_FOUND', 'Payment record not found', 404);
    }

    // Role access authorization check (SEC-10)
    const isOwner = record.cargoOwnerId === req.user.id;
    const isDriver = record.driverId === req.user.id;
    const isFleet = record.fleetOwnerId === req.user.id;
    const isAdmin = req.user.role === ROLES.ADMIN;

    if (!isOwner && !isDriver && !isFleet && !isAdmin) {
      return errorResponse(res, 'FORBIDDEN', 'You are not authorized to view this payment record', 403);
    }

    return successResponse(res, record, 'Payment record retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Update payment status (Partial / Paid)
 * Requirement: FR-PM-5, FR-PM-6, FR-PM-7, BR-24, BR-25
 */
async function updatePaymentStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, amountReceived, note } = req.body;

    const record = await prisma.paymentRecord.findUnique({
      where: { id },
      include: { shipment: true },
    });

    if (!record) {
      return errorResponse(res, 'RECORD_NOT_FOUND', 'Payment record not found', 404);
    }

    // Check authorization (party to shipment or Admin)
    const isParty =
      record.cargoOwnerId === req.user.id ||
      record.driverId === req.user.id ||
      record.fleetOwnerId === req.user.id;
    const isAdmin = req.user.role === ROLES.ADMIN;

    if (!isParty && !isAdmin) {
      return errorResponse(res, 'FORBIDDEN', 'Only parties to this shipment may update payment status', 403);
    }

    // Check if shipment is cancelled (BR-25, FR-PM-7)
    if (record.shipment.status === SHIPMENT_STATUS.CANCELLED) {
      return errorResponse(
        res,
        'CANNOT_UPDATE_CANCELLED_PAYMENT',
        'Payment status cannot be updated for a cancelled shipment (BR-25).',
        400
      );
    }

    // Check if payment dispute is currently open / frozen (BR-25, 10.0.E3)
    if (record.isFrozen && !isAdmin) {
      return errorResponse(
        res,
        'PAYMENT_RECORD_FROZEN',
        'This payment record is currently frozen due to an active dispute under administrator review (BR-25).',
        423
      );
    }

    // Validate amountReceived
    const newAmount =
      status === PAYMENT_STATUS.PAID
        ? record.agreedFare
        : amountReceived !== undefined
        ? amountReceived
        : record.amountReceived;

    if (newAmount > record.agreedFare) {
      return errorResponse(
        res,
        'AMOUNT_EXCEEDS_AGREED_FARE',
        `Amount received (PKR ${newAmount}) cannot exceed agreed fare (PKR ${record.agreedFare}) (10.0.E1).`,
        400
      );
    }

    // Execute update with status log
    await prisma.$transaction([
      prisma.paymentRecord.update({
        where: { id },
        data: {
          status,
          amountReceived: newAmount,
        },
      }),
      prisma.paymentStatusLog.create({
        data: {
          paymentRecordId: id,
          previousStatus: record.status,
          newStatus: status,
          amountReceived: newAmount,
          changedById: req.user.id,
          note: note || null,
        },
      }),
    ]);

    // Notify counterparty (FR-NC-10)
    const counterpartyId =
      req.user.id === record.cargoOwnerId
        ? record.driverId || record.fleetOwnerId
        : record.cargoOwnerId;

    if (counterpartyId) {
      await dispatchNotification({
        recipientId: counterpartyId,
        type: 'PAYMENT_STATUS_CHANGED',
        title: 'Payment Status Updated',
        message: `${req.user.name} updated payment status for shipment ${record.shipment.shipmentNumber} to: ${status} (PKR ${newAmount.toLocaleString()} received).`,
        relatedShipmentId: record.shipmentId,
      });
    }

    return successResponse(res, null, `Payment status updated to ${status} (FR-PM-5)`);
  } catch (error) {
    next(error);
  }
}

/**
 * Raise a payment dispute -> freezes payment record
 * Requirement: FR-PM-8, BR-25, BR-26, UC-11
 */
async function raisePaymentDispute(req, res, next) {
  try {
    const { id } = req.params;
    const { description } = req.body;

    const record = await prisma.paymentRecord.findUnique({
      where: { id },
      include: { shipment: true },
    });

    if (!record) {
      return errorResponse(res, 'RECORD_NOT_FOUND', 'Payment record not found', 404);
    }

    const isParty =
      record.cargoOwnerId === req.user.id ||
      record.driverId === req.user.id ||
      record.fleetOwnerId === req.user.id;

    if (!isParty) {
      return errorResponse(res, 'FORBIDDEN', 'Only parties to this shipment may raise a dispute (BR-26)', 403);
    }

    const counterpartyId =
      req.user.id === record.cargoOwnerId
        ? record.driverId || record.fleetOwnerId
        : record.cargoOwnerId;

    const year = new Date().getFullYear();
    const count = await prisma.complaint.count();
    const referenceCode = `CMP-${year}-${String(count + 1).padStart(4, '0')}`;

    // Transaction: Freeze payment record and create Complaint
    await prisma.$transaction([
      prisma.paymentRecord.update({
        where: { id },
        data: { isFrozen: true },
      }),
      prisma.complaint.create({
        data: {
          referenceCode,
          shipmentId: record.shipmentId,
          submitterId: req.user.id,
          counterpartyId,
          category: COMPLAINT_CATEGORIES.PAYMENT_DISPUTE,
          description,
          status: 'PENDING',
        },
      }),
    ]);

    // Notify all administrators (FR-NC-11)
    const admins = await prisma.user.findMany({
      where: { role: ROLES.ADMIN },
      select: { id: true },
    });

    for (const admin of admins) {
      await dispatchNotification({
        recipientId: admin.id,
        type: 'COMPLAINT_RECEIVED',
        title: 'New Payment Dispute Raised',
        message: `Dispute ${referenceCode} filed for shipment ${record.shipment.shipmentNumber}. Payment record frozen.`,
        relatedShipmentId: record.shipmentId,
      });
    }

    return successResponse(
      res,
      { referenceCode, isFrozen: true },
      'Payment dispute raised successfully and payment record frozen pending administrator review (FR-PM-8, BR-25)',
      201
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listPaymentRecords,
  getPaymentRecordById,
  updatePaymentStatus,
  raisePaymentDispute,
};
