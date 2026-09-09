const prisma = require('../../config/db');
const { successResponse, errorResponse } = require('../../utils/response');
const { SHIPMENT_STATUS } = require('../../config/constants');

/**
 * Submit rating for completed shipment
 * Requirement: FR-CO-24, FR-DR-22, BR-21, BR-22
 */
async function submitRating(req, res, next) {
  try {
    const { shipmentId, score, review } = req.body;

    if (!score || score < 1 || score > 5) {
      return errorResponse(res, 'INVALID_SCORE', 'Rating score must be an integer between 1 and 5 (BR-21)', 400);
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { trip: true },
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

    // Identify target recipient
    const isCargoOwner = shipment.cargoOwnerId === req.user.id;
    const isDriver = shipment.trip && shipment.trip.driverId === req.user.id;
    const isFleetOwner = shipment.trip && shipment.trip.fleetOwnerId === req.user.id;

    if (!isCargoOwner && !isDriver && !isFleetOwner) {
      return errorResponse(res, 'FORBIDDEN', 'Only parties to this shipment may submit a rating (BR-21)', 403);
    }

    let toUserId = null;
    if (isCargoOwner) {
      toUserId = shipment.trip ? shipment.trip.driverId || shipment.trip.fleetOwnerId : null;
    } else {
      toUserId = shipment.cargoOwnerId;
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

    // Create rating and update target user's average rating
    await prisma.$transaction(async (tx) => {
      await tx.rating.create({
        data: {
          shipmentId,
          fromUserId: req.user.id,
          toUserId,
          score,
          review: review ? review.trim() : null,
        },
      });

      // Recalculate target user average rating
      const ratings = await tx.rating.findMany({
        where: { toUserId },
        select: { score: true },
      });

      const totalRatings = ratings.length;
      const sumScores = ratings.reduce((acc, r) => acc + r.score, 0);
      const avgRating = Math.round((sumScores / totalRatings) * 10) / 10;

      await tx.user.update({
        where: { id: toUserId },
        data: {
          avgRating,
          totalRatings,
        },
      });
    });

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
