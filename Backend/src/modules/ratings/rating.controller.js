const prisma = require('../../config/db');
const { successResponse, errorResponse } = require('../../utils/response');
const { SHIPMENT_STATUS, LIMITS } = require('../../config/constants');

/**
 * Submit rating for completed shipment
 * Requirement: FR-CO-15, FR-DR-17, BR-21, BR-22
 *
 * The cargo owner rates the party that was paid (the driver, or the fleet owner for a fleet booking),
 * and that party rates the cargo owner. An employee driver is not a rated or rating party (C-38).
 */
async function submitRating(req, res, next) {
  try {
    const { shipmentId, score, review } = req.body;

    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return errorResponse(res, 'INVALID_SCORE', 'Rating score must be an integer between 1 and 5 (BR-21)', 400);
    }

    if (typeof shipmentId !== 'string' || !shipmentId) {
      return errorResponse(res, 'SHIPMENT_REQUIRED', 'A shipment is required', 400);
    }

    if (review !== undefined && review !== null && (typeof review !== 'string' || review.length > LIMITS.MAX_REVIEW_LENGTH)) {
      return errorResponse(
        res,
        'INVALID_REVIEW',
        `A review must be text of at most ${LIMITS.MAX_REVIEW_LENGTH} characters.`,
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

    // Only allowed after shipment reaches COMPLETED (BR-21)
    if (shipment.status !== SHIPMENT_STATUS.COMPLETED) {
      return errorResponse(
        res,
        'SHIPMENT_NOT_COMPLETED',
        'Ratings can only be submitted after shipment completion has been confirmed (BR-21).',
        400
      );
    }

    const payeeId =
      (shipment.paymentRecord && (shipment.paymentRecord.payeeId || shipment.paymentRecord.fleetOwnerId || shipment.paymentRecord.driverId)) ||
      (shipment.trip ? shipment.trip.fleetOwnerId || shipment.trip.driverId : null);

    const isCargoOwner = shipment.cargoOwnerId === req.user.id;
    const isPayee = payeeId === req.user.id;

    if (!isCargoOwner && !isPayee) {
      return errorResponse(res, 'FORBIDDEN', 'Only parties to this shipment may submit a rating (BR-21)', 403);
    }

    const toUserId = isCargoOwner ? payeeId : shipment.cargoOwnerId;
    if (!toUserId) {
      return errorResponse(res, 'NO_RATING_TARGET', 'There is nobody to rate on this shipment.', 409);
    }

    // Check if user has already rated this shipment (BR-21)
    const existingRating = await prisma.rating.findUnique({
      where: {
        unique_rating_per_party_per_shipment: {
          shipmentId,
          fromUserId: req.user.id,
        },
      },
    });

    if (existingRating) {
      return errorResponse(
        res,
        'RATING_ALREADY_SUBMITTED',
        'You have already submitted a rating for this shipment. Ratings cannot be edited or resubmitted (BR-21, BR-22).',
        409
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Lock the rated user so two ratings for them are counted one after the other, never over each other
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${toUserId} FOR UPDATE`;

        await tx.rating.create({
          data: {
            shipmentId,
            fromUserId: req.user.id,
            toUserId,
            score,
            review: review ? review.trim() : null,
          },
        });

        const agg = await tx.rating.aggregate({
          where: { toUserId },
          _avg: { score: true },
          _count: { _all: true },
        });

        await tx.user.update({
          where: { id: toUserId },
          data: {
            avgRating: Math.round(agg._avg.score * 10) / 10,
            totalRatings: agg._count._all,
          },
        });
      });
    } catch (e) {
      // A double submit that raced past the check above hits the unique index
      if (e && e.code === 'P2002') {
        return errorResponse(
          res,
          'RATING_ALREADY_SUBMITTED',
          'You have already submitted a rating for this shipment. Ratings cannot be edited or resubmitted (BR-21, BR-22).',
          409
        );
      }
      throw e;
    }

    return successResponse(res, null, 'Rating submitted successfully (BR-21)', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Get ratings received by user
 */
async function getUserRatings(req, res, next) {
  try {
    const { userId } = req.params;

    const ratings = await prisma.rating.findMany({
      where: { toUserId: userId },
      include: {
        fromUser: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return successResponse(res, ratings, 'User ratings retrieved');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  submitRating,
  getUserRatings,
};
