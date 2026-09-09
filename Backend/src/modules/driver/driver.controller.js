const prisma = require('../../config/db');
const { getMatchedShipmentsForUser } = require('../matching/matching.service');
const { uploadProofOfDelivery, generateSignedReadUrl } = require('../../services/storage.service');
const { dispatchNotification } = require('../../services/fcm.service');
const { successResponse, errorResponse } = require('../../utils/response');
const {
  BID_STATUS,
  SHIPMENT_STATUS,
  VALID_STATUS_TRANSITIONS,
  ACCOUNT_STATUS,
  LIMITS,
} = require('../../config/constants');

/**
 * Get matched open shipments for driver
 * Requirement: FR-DR-4, FR-DR-5
 */
async function getMatchedShipments(req, res, next) {
  try {
    const shipments = await getMatchedShipmentsForUser(req.user);
    return successResponse(res, shipments, 'Matched shipments retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Submit bid on open shipment
 * Requirement: FR-DR-7, FR-DR-8, BR-3, BR-7, BR-9
 */
async function submitBid(req, res, next) {
  try {
    const { shipmentId, proposedFare, estimatedDeliveryTime, offeredVehicleType } = req.body;

    // 1. Check if shipment is still PENDING (BR-9, FR-CO-14)
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment || shipment.status !== SHIPMENT_STATUS.PENDING) {
      return errorResponse(res, 'SHIPMENT_NOT_OPEN', 'Shipment is no longer open for bidding (BR-9)', 409);
    }

    // 2. Prevent duplicate active bids from same bidder (BR-7, FR-DR-8)
    const existingBid = await prisma.bid.findFirst({
      where: {
        shipmentId,
        bidderId: req.user.id,
        status: BID_STATUS.ACTIVE,
      },
    });

    if (existingBid) {
      return errorResponse(
        res,
        'DUPLICATE_ACTIVE_BID',
        'You already have an active bid on this shipment. You can revise it instead (BR-7).',
        409
      );
    }

    // 3. Resolve vehicle type
    let vehicleType = offeredVehicleType;
    if (!vehicleType) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { ownerId: req.user.id },
      });
      vehicleType = vehicle ? vehicle.vehicleType : shipment.requiredVehicleType;
    }

    const bid = await prisma.bid.create({
      data: {
        shipmentId,
        bidderId: req.user.id,
        offeredVehicleType: vehicleType,
        proposedFare,
        estimatedDeliveryTime: new Date(estimatedDeliveryTime),
        status: BID_STATUS.ACTIVE,
      },
    });

    // Notify cargo owner of new bid (FR-NC-5)
    await dispatchNotification({
      recipientId: shipment.cargoOwnerId,
      type: 'NEW_BID_RECEIVED',
      title: 'New Bid Received',
      message: `${req.user.name} submitted a bid of PKR ${proposedFare.toLocaleString()} for shipment ${shipment.shipmentNumber}.`,
      relatedShipmentId: shipment.id,
    });

    return successResponse(res, bid, 'Bid submitted successfully', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Revise an active bid
 * Requirement: FR-DR-9, BR-8
 */
async function updateBid(req, res, next) {
  try {
    const { id: bidId } = req.params;
    const { proposedFare, estimatedDeliveryTime } = req.body;

    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: { shipment: true },
    });

    if (!bid || bid.bidderId !== req.user.id) {
      return errorResponse(res, 'BID_NOT_FOUND', 'Bid not found or unauthorized', 404);
    }

    if (bid.status !== BID_STATUS.ACTIVE) {
      return errorResponse(
        res,
        'CANNOT_REVISE_BID',
        `Bid cannot be revised once it is in ${bid.status} status (BR-8).`,
        400
      );
    }

    const updatedBid = await prisma.bid.update({
      where: { id: bidId },
      data: {
        ...(proposedFare ? { proposedFare } : {}),
        ...(estimatedDeliveryTime ? { estimatedDeliveryTime: new Date(estimatedDeliveryTime) } : {}),
      },
    });

    return successResponse(res, updatedBid, 'Bid revised successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Withdraw an active bid
 * Requirement: FR-DR-9, BR-8
 */
async function withdrawBid(req, res, next) {
  try {
    const { id: bidId } = req.params;

    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
    });

    if (!bid || bid.bidderId !== req.user.id) {
      return errorResponse(res, 'BID_NOT_FOUND', 'Bid not found or unauthorized', 404);
    }

    if (bid.status !== BID_STATUS.ACTIVE) {
      return errorResponse(
        res,
        'CANNOT_WITHDRAW_BID',
        `Bid in ${bid.status} status cannot be withdrawn (BR-8).`,
        400
      );
    }

    await prisma.bid.update({
      where: { id: bidId },
      data: { status: BID_STATUS.WITHDRAWN },
    });

    return successResponse(res, null, 'Bid withdrawn successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Get current active trip for driver
 * Requirement: FR-DR-11
 */
async function getActiveTrip(req, res, next) {
  try {
    const trip = await prisma.trip.findFirst({
      where: {
        driverId: req.user.id,
        shipment: {
          status: {
            in: [
              SHIPMENT_STATUS.BOOKED,
              SHIPMENT_STATUS.REACHED_PICKUP,
              SHIPMENT_STATUS.CARGO_LOADED,
              SHIPMENT_STATUS.IN_TRANSIT,
              SHIPMENT_STATUS.REACHED_DESTINATION,
            ],
          },
        },
      },
      include: {
        shipment: {
          include: {
            cargoOwner: {
              select: { id: true, name: true, phone: true },
            },
          },
        },
        vehicle: true,
        statusLogs: {
          orderBy: { timestamp: 'asc' },
        },
        positions: {
          take: 1,
          orderBy: { recordedAt: 'desc' },
        },
      },
    });

    return successResponse(res, trip, 'Active trip retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Advance trip status along lifecycle
 * Requirement: FR-DR-12, FR-DR-13, FR-DR-14, BR-14, BR-15, BR-16
 */
async function updateTripStatus(req, res, next) {
  try {
    const { id: tripId } = req.params;
    const { status: nextStatus, note, timestamp } = req.body;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        shipment: true,
        vehicle: true,
      },
    });

    if (!trip || trip.driverId !== req.user.id) {
      return errorResponse(res, 'TRIP_NOT_FOUND', 'Trip not found or unauthorized', 404);
    }

    const currentStatus = trip.shipment.status;
    const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];

    // Strict lifecycle enforcement (BR-14, FR-DR-14)
    if (!allowedTransitions.includes(nextStatus)) {
      return errorResponse(
        res,
        'INVALID_STATUS_TRANSITION',
        `Invalid status transition from ${currentStatus} to ${nextStatus}. Allowed: [${allowedTransitions.join(', ')}] (BR-14).`,
        422
      );
    }

    // Check Proof of Delivery requirement before DELIVERED (BR-15, FR-DR-19)
    if (nextStatus === SHIPMENT_STATUS.DELIVERED) {
      const pod = await prisma.proofOfDelivery.findUnique({
        where: { shipmentId: trip.shipmentId },
      });

      if (!pod || !pod.imageKeys || pod.imageKeys.length === 0) {
        return errorResponse(
          res,
          'PROOF_OF_DELIVERY_REQUIRED',
          'At least one Proof of Delivery image must be uploaded before marking the shipment as Delivered (BR-15, FR-DR-19).',
          400
        );
      }
    }

    // Determine tracking state
    const isTrackingActive =
      nextStatus === SHIPMENT_STATUS.REACHED_PICKUP ||
      nextStatus === SHIPMENT_STATUS.CARGO_LOADED ||
      nextStatus === SHIPMENT_STATUS.IN_TRANSIT;

    const eventTime = timestamp ? new Date(timestamp) : new Date();

    // Execute update transaction
    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: trip.shipmentId },
        data: { status: nextStatus },
      }),
      prisma.trip.update({
        where: { id: tripId },
        data: {
          isTrackingActive,
          ...(nextStatus === SHIPMENT_STATUS.REACHED_PICKUP && !trip.startedAt ? { startedAt: eventTime } : {}),
        },
      }),
      prisma.tripStatusLog.create({
        data: {
          tripId,
          status: nextStatus,
          changedById: req.user.id,
          timestamp: eventTime,
          note: note || null,
        },
      }),
    ]);

    // Dispatch status change notification to cargo owner & fleet owner (FR-NC-7)
    await dispatchNotification({
      recipientId: trip.shipment.cargoOwnerId,
      type: 'TRIP_STATUS_CHANGED',
      title: 'Shipment Status Updated',
      message: `Shipment ${trip.shipment.shipmentNumber} status is now: ${nextStatus.replace(/_/g, ' ')}.`,
      relatedShipmentId: trip.shipmentId,
    });

    if (trip.fleetOwnerId) {
      await dispatchNotification({
        recipientId: trip.fleetOwnerId,
        type: 'TRIP_STATUS_CHANGED',
        title: 'Fleet Trip Status Updated',
        message: `Driver ${req.user.name} updated trip for ${trip.shipment.shipmentNumber} to: ${nextStatus}.`,
        relatedShipmentId: trip.shipmentId,
      });
    }

    return successResponse(res, null, `Trip status advanced to ${nextStatus}`);
  } catch (error) {
    next(error);
  }
}

/**
 * Upload Proof of Delivery (1 to 5 photos)
 * Requirement: FR-DR-18, FR-DR-19, BR-18, BR-19
 */
async function uploadPOD(req, res, next) {
  try {
    const { id: tripId } = req.params;
    const { note, latitude, longitude } = req.body;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { shipment: true },
    });

    if (!trip || trip.driverId !== req.user.id) {
      return errorResponse(res, 'TRIP_NOT_FOUND', 'Trip not found or unauthorized', 404);
    }

    if (!req.files || req.files.length === 0) {
      return errorResponse(res, 'FILES_MISSING', 'At least 1 Proof of Delivery image is required (BR-18)', 400);
    }

    if (req.files.length > LIMITS.MAX_POD_IMAGES) {
      return errorResponse(
        res,
        'TOO_MANY_IMAGES',
        `Maximum ${LIMITS.MAX_POD_IMAGES} Proof of Delivery images allowed (BR-18)`,
        400
      );
    }

    // Upload all files to storage
    const imageKeys = [];
    for (const file of req.files) {
      const uploadRes = await uploadProofOfDelivery(file, trip.shipmentId);
      imageKeys.push(uploadRes.storageKey);
    }

    // Save or update ProofOfDelivery record
    const pod = await prisma.proofOfDelivery.upsert({
      where: { shipmentId: trip.shipmentId },
      update: {
        imageKeys: { push: imageKeys },
        note: note || undefined,
        captureLat: latitude ? parseFloat(latitude) : undefined,
        captureLng: longitude ? parseFloat(longitude) : undefined,
      },
      create: {
        shipmentId: trip.shipmentId,
        driverId: req.user.id,
        imageKeys,
        note: note || null,
        captureLat: latitude ? parseFloat(latitude) : null,
        captureLng: longitude ? parseFloat(longitude) : null,
      },
    });

    // Notify cargo owner that POD is available (FR-NC-8)
    await dispatchNotification({
      recipientId: trip.shipment.cargoOwnerId,
      type: 'PROOF_OF_DELIVERY_UPLOADED',
      title: 'Proof of Delivery Uploaded',
      message: `Driver has uploaded proof of delivery for shipment ${trip.shipment.shipmentNumber}.`,
      relatedShipmentId: trip.shipmentId,
    });

    return successResponse(res, pod, 'Proof of delivery uploaded successfully', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Batch synchronize offline queued status updates
 * Requirement: FR-DR-15, REL-6
 */
async function syncOfflineStatusUpdates(req, res, next) {
  try {
    const { id: tripId } = req.params;
    const { statusUpdates } = req.body;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { shipment: true },
    });

    if (!trip || trip.driverId !== req.user.id) {
      return errorResponse(res, 'NOT_FOUND', 'Trip not found or unauthorized', 404);
    }

    for (const update of statusUpdates) {
      await prisma.tripStatusLog.create({
        data: {
          tripId,
          status: update.status,
          changedById: req.user.id,
          timestamp: new Date(update.timestamp),
          note: update.note || 'Synced from offline queue (REL-6)',
        },
      });

      await prisma.shipment.update({
        where: { id: trip.shipmentId },
        data: { status: update.status },
      });
    }

    return successResponse(res, null, `Successfully synced ${statusUpdates.length} offline status changes`);
  } catch (error) {
    next(error);
  }
}

/**
 * Batch synchronize offline queued GPS coordinates
 * Requirement: FR-RT-12, CI-5
 */
async function syncOfflinePositions(req, res, next) {
  try {
    const { id: tripId } = req.params;
    const { positions } = req.body;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip || trip.driverId !== req.user.id) {
      return errorResponse(res, 'NOT_FOUND', 'Trip not found or unauthorized', 404);
    }

    // Filter positions where accuracy <= 100m (HI-3)
    const validPositions = positions.filter((p) => p.accuracy <= LIMITS.MAX_GPS_ACCURACY_METERS);

    if (validPositions.length > 0) {
      await prisma.tripPosition.createMany({
        data: validPositions.map((p) => ({
          tripId,
          driverId: req.user.id,
          latitude: p.latitude,
          longitude: p.longitude,
          accuracy: p.accuracy,
          recordedAt: new Date(p.timestamp),
        })),
      });
    }

    return successResponse(
      res,
      { syncedCount: validPositions.length },
      `Successfully synced ${validPositions.length} offline GPS positions (CI-5)`
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Driver earnings report
 * Requirement: FR-DR-21
 */
async function getEarningsSummary(req, res, next) {
  try {
    const trips = await prisma.trip.findMany({
      where: {
        driverId: req.user.id,
        shipment: { status: SHIPMENT_STATUS.COMPLETED },
      },
      include: {
        shipment: {
          include: { paymentRecord: true },
        },
      },
      orderBy: { completedAt: 'desc' },
    });

    let totalEarned = 0;
    let pendingSettlement = 0;

    trips.forEach((t) => {
      const fare = t.agreedFare || 0;
      totalEarned += fare;
      if (t.shipment.paymentRecord && t.shipment.paymentRecord.status !== 'PAID') {
        pendingSettlement += fare - (t.shipment.paymentRecord.amountReceived || 0);
      }
    });

    return successResponse(
      res,
      {
        totalCompletedTrips: trips.length,
        totalEarningsPKR: totalEarned,
        pendingSettlementPKR: pendingSettlement,
        recentTrips: trips.slice(0, 20),
      },
      'Earnings summary retrieved'
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMatchedShipments,
  submitBid,
  updateBid,
  withdrawBid,
  getActiveTrip,
  updateTripStatus,
  uploadPOD,
  syncOfflineStatusUpdates,
  syncOfflinePositions,
  getEarningsSummary,
};
