const prisma = require('../../config/db');
const { dispatchNotification } = require('../../services/fcm.service');
const { getPaginationParams, buildPaginationMeta } = require('../../utils/pagination');
const { successResponse, errorResponse } = require('../../utils/response');
const { nextReference } = require('../../utils/reference');
const {
  ROLES,
  PAYMENT_STATUS,
  SHIPMENT_STATUS,
  COMPLAINT_CATEGORIES,
} = require('../../config/constants');

/** The party being paid. Older rows are backfilled, so the fallbacks only matter for hand-made data. */
function payeeOf(record) {
  return record.payeeId || record.fleetOwnerId || record.driverId || null;
}

/**
 * List payment records by role
 * Requirement: FR-PM-5, SEC-10
 * Only the cargo owner and the payee see a record. An employee driver is not a party (C-09).
 */
async function listPaymentRecords(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { status } = req.query;

    if (status && !Object.values(PAYMENT_STATUS).includes(status)) {
      return errorResponse(res, 'INVALID_STATUS_FILTER', 'Status must be PENDING, PARTIAL or PAID', 400);
    }

    let whereClause = {};

    if (req.user.role === ROLES.CARGO_OWNER) {
      whereClause.cargoOwnerId = req.user.id;
    } else if (req.user.role === ROLES.DRIVER || req.user.role === ROLES.FLEET_OWNER) {
      whereClause.payeeId = req.user.id;
    } else if (req.user.role !== ROLES.ADMIN) {
      whereClause.id = '__none__';
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
      'Payment records retrieved (FR-PM-5)',
      200,
      buildPaginationMeta(total, page, limit)
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Get detailed payment record with audit history
 * Requirement: FR-PM-5, FR-PM-3, FR-CO-14
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
    const isPayee = payeeOf(record) === req.user.id;
    const isAdmin = req.user.role === ROLES.ADMIN;

    if (!isOwner && !isPayee && !isAdmin) {
      return errorResponse(res, 'FORBIDDEN', 'You are not authorized to view this payment record', 403);
    }

    return successResponse(res, record, 'Payment record retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Update payment status (Partial / Paid)
 * Requirement: FR-PM-2, FR-PM-3, FR-PM-4, BR-24, BR-25
 *
 * Only the party being paid confirms receipt (C-21). Paid is final, a Partial amount can only grow,
 * and the write is conditional on the state that was read, so two requests cannot both succeed.
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

    const isAdmin = req.user.role === ROLES.ADMIN;
    const isPayee = payeeOf(record) === req.user.id;

    if (!isAdmin && !isPayee) {
      if (record.cargoOwnerId === req.user.id) {
        return errorResponse(
          res,
          'ONLY_PAYEE_CONFIRMS',
          'Only the party being paid can record receipt of payment. The cargo owner cannot mark it received.',
          403
        );
      }
      return errorResponse(res, 'FORBIDDEN', 'Only parties to this shipment may update payment status', 403);
    }

    // Check if shipment is cancelled (BR-25, FR-PM-4)
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

    if (record.status === PAYMENT_STATUS.PAID) {
      return errorResponse(
        res,
        'PAYMENT_ALREADY_PAID',
        'This payment is already recorded as paid in full. A correction goes through a dispute.',
        409
      );
    }

    let newAmount;
    if (status === PAYMENT_STATUS.PAID) {
      if (amountReceived !== undefined && amountReceived !== record.agreedFare) {
        return errorResponse(
          res,
          'AMOUNT_MISMATCH_FOR_PAID',
          `Paid means the full agreed fare (PKR ${record.agreedFare}). Use Partial for a smaller amount.`,
          400
        );
      }
      newAmount = record.agreedFare;
    } else {
      if (amountReceived === undefined) {
        return errorResponse(res, 'AMOUNT_REQUIRED', 'A Partial status needs the amount received so far.', 400);
      }
      if (amountReceived > record.agreedFare) {
        return errorResponse(
          res,
          'AMOUNT_EXCEEDS_AGREED_FARE',
          `Amount received (PKR ${amountReceived}) cannot exceed agreed fare (PKR ${record.agreedFare}) (10.0.E1).`,
          400
        );
      }
      if (amountReceived <= 0 || amountReceived >= record.agreedFare) {
        return errorResponse(
          res,
          'INVALID_PARTIAL_AMOUNT',
          'A Partial amount must be more than 0 and less than the agreed fare. Use Paid for the full fare.',
          400
        );
      }
      if (amountReceived <= record.amountReceived) {
        return errorResponse(
          res,
          'AMOUNT_NOT_INCREASED',
          `A Partial amount can only go up. PKR ${record.amountReceived} is already recorded.`,
          400
        );
      }
      newAmount = amountReceived;
    }

    // Conditional write: it succeeds only if nobody changed the record since it was read
    const done = await prisma.$transaction(async (tx) => {
      const updated = await tx.paymentRecord.updateMany({
        where: {
          id,
          status: record.status,
          amountReceived: record.amountReceived,
          ...(isAdmin ? {} : { isFrozen: false }),
        },
        data: { status, amountReceived: newAmount },
      });
      if (updated.count !== 1) return false;

      await tx.paymentStatusLog.create({
        data: {
          paymentRecordId: id,
          previousStatus: record.status,
          newStatus: status,
          amountReceived: newAmount,
          changedById: req.user.id,
          note: note || null,
        },
      });
      return true;
    });

    if (!done) {
      return errorResponse(res, 'PAYMENT_CHANGED', 'The payment record changed while you were updating it. Reload and try again.', 409);
    }

    // Notify the other side (FR-NC-9). An administrator's change goes to both parties.
    const recipients = [record.cargoOwnerId, payeeOf(record)].filter((r) => r && r !== req.user.id);
    for (const recipientId of [...new Set(recipients)]) {
      await dispatchNotification({
        recipientId,
        type: 'PAYMENT_STATUS_CHANGED',
        title: 'Payment Status Updated',
        message: `${req.user.name} updated payment status for shipment ${record.shipment.shipmentNumber} to: ${status} (PKR ${newAmount.toLocaleString()} received).`,
        relatedShipmentId: record.shipmentId,
      });
    }

    return successResponse(res, null, `Payment status updated to ${status} (FR-PM-2)`);
  } catch (error) {
    next(error);
  }
}

/**
 * Raise a payment dispute -> freezes payment record
 * Requirement: FR-PM-6, BR-25, BR-26, UC-11
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

    const payeeId = payeeOf(record);
    const isParty = record.cargoOwnerId === req.user.id || payeeId === req.user.id;

    if (!isParty) {
      return errorResponse(res, 'FORBIDDEN', 'Only parties to this shipment may raise a dispute (BR-26)', 403);
    }

    const counterpartyId = req.user.id === record.cargoOwnerId ? payeeId : record.cargoOwnerId;

    const year = new Date().getFullYear();
    const referenceCode = await nextReference(prisma.complaint, 'referenceCode', `CMP-${year}-`, 4);

    // The freeze is the lock: only one request can move the record from unfrozen to frozen,
    // so a payment has at most one open dispute (C-39, BR-25).
    const created = await prisma.$transaction(async (tx) => {
      const frozen = await tx.paymentRecord.updateMany({
        where: { id, isFrozen: false },
        data: { isFrozen: true },
      });
      if (frozen.count !== 1) return false;

      await tx.complaint.create({
        data: {
          referenceCode,
          shipmentId: record.shipmentId,
          submitterId: req.user.id,
          counterpartyId,
          category: COMPLAINT_CATEGORIES.PAYMENT_DISPUTE,
          description: description.trim(),
          status: 'PENDING',
        },
      });
      return true;
    });

    if (!created) {
      return errorResponse(
        res,
        'DISPUTE_ALREADY_OPEN',
        'A dispute is already open on this payment. It must be resolved or withdrawn first.',
        409
      );
    }

    // Notify all administrators (FR-NC-10)
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
      'Payment dispute raised successfully and payment record frozen pending administrator review (FR-PM-6, BR-25)',
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
