const prisma = require('../../config/db');
const { isBidExpired } = require('../../utils/bids');
const { getMatchedShipmentsForUser, isCargoCompatibleWithVehicle } = require('../matching/matching.service');
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
 * Requirement: FR-DR-3, FR-DR-4
 */
async function getMatchedShipments(req, res, next) {
  try {
    // A driver who switched Accepting bids off sees no loads (FR-DR-19)
    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { isAcceptingBids: true } });
    if (me && me.isAcceptingBids === false) return successResponse(res, [], 'Accepting bids is switched off');
    const shipments = await getMatchedShipmentsForUser(req.user);
    return successResponse(res, shipments, 'Matched shipments retrieved');
  } catch (error) {
    next(error);
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A bid may promise delivery up to the end of the shipment's expected delivery day (UTC)
function deliveryDeadline(shipment) {
  const d = new Date(shipment.expectedDeliveryDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + MS_PER_DAY);
}

/**
 * Submit bid on open shipment
 * Requirement: FR-DR-6, FR-DR-6, BR-3, BR-7, BR-9
 */
async function submitBid(req, res, next) {
  try {
    const { shipmentId, proposedFare, estimatedDeliveryTime, vehicleId } = req.body;

    // 1. Shipment must be open: PENDING and published, not a draft (BR-9, FR-CO-7)
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment || shipment.isDraft || shipment.status !== SHIPMENT_STATUS.PENDING) {
      return errorResponse(res, 'SHIPMENT_NOT_OPEN', 'Shipment is no longer open for bidding (BR-9)', 409);
    }

    const eta = new Date(estimatedDeliveryTime);
    if (eta > deliveryDeadline(shipment)) {
      return errorResponse(
        res,
        'ETA_AFTER_DELIVERY_DATE',
        'Estimated delivery time is later than the cargo owner\'s expected delivery date.',
        422
      );
    }

    // 2. The bid commits a specific vehicle that the bidder owns (C-05)
    const vehicles = await prisma.vehicle.findMany({
      where: { ownerId: req.user.id, ...(vehicleId ? { id: vehicleId } : {}) },
    });
    if (vehicles.length === 0) {
      return errorResponse(
        res,
        'NO_VEHICLE',
        vehicleId ? 'That vehicle was not found on your account.' : 'Register a vehicle before bidding.',
        422
      );
    }
    if (vehicles.length > 1) {
      return errorResponse(res, 'VEHICLE_REQUIRED', 'Choose which of your vehicles you are offering (vehicleId).', 422);
    }
    const vehicle = vehicles[0];
    if (vehicle.availabilityStatus !== 'AVAILABLE') {
      return errorResponse(res, 'VEHICLE_UNAVAILABLE', 'The selected vehicle is not available (BR-12).', 409);
    }
    // The body must be able to carry this cargo (BR-5); a different type is allowed if it can
    if (!isCargoCompatibleWithVehicle(vehicle.vehicleType, shipment.cargoType)) {
      return errorResponse(res, 'VEHICLE_TYPE_MISMATCH', 'This vehicle cannot carry the shipment\'s cargo type (BR-5).', 422);
    }
    if (vehicle.ratedCapacity < shipment.cargoWeight) {
      return errorResponse(res, 'VEHICLE_CAPACITY_EXCEEDED', 'The vehicle\'s rated capacity is below the cargo weight (BR-4).', 422);
    }

    // 3. One active bid per bidder per shipment (BR-7, FR-DR-6). The partial unique index settles races.
    const duplicate = () =>
      errorResponse(
        res,
        'DUPLICATE_ACTIVE_BID',
        'You already have an active bid on this shipment. You can revise it instead (BR-7).',
        409
      );

    const existingBid = await prisma.bid.findFirst({
      where: { shipmentId, bidderId: req.user.id, status: BID_STATUS.ACTIVE },
    });
    if (existingBid && !isBidExpired(existingBid)) return duplicate();
    if (existingBid) {
      // The earlier bid ran out its 24 hours but the hourly job has not marked it yet
      await prisma.bid.updateMany({ where: { id: existingBid.id, status: BID_STATUS.ACTIVE }, data: { status: BID_STATUS.EXPIRED } });
    }

    let bid;
    try {
      bid = await prisma.bid.create({
        data: {
          shipmentId,
          bidderId: req.user.id,
          vehicleId: vehicle.id,
          offeredVehicleType: vehicle.vehicleType,
          proposedFare,
          estimatedDeliveryTime: eta,
          status: BID_STATUS.ACTIVE,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') return duplicate();
      throw error;
    }

    // Notify cargo owner of new bid (FR-NC-4)
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
 * Requirement: FR-DR-7, BR-8
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

    if (bid.status === BID_STATUS.ACTIVE && isBidExpired(bid)) {
      return errorResponse(res, 'BID_EXPIRED', 'This bid expired 24 hours after it was placed. Place a new bid.', 409);
    }

    if (bid.status !== BID_STATUS.ACTIVE) {
      return errorResponse(
        res,
        'CANNOT_REVISE_BID',
        `Bid cannot be revised once it is in ${bid.status} status (BR-8).`,
        400
      );
    }

    if (bid.shipment.status !== SHIPMENT_STATUS.PENDING) {
      return errorResponse(res, 'SHIPMENT_NOT_OPEN', 'Shipment is no longer open for bidding (BR-9)', 409);
    }

    if (estimatedDeliveryTime) {
      const eta = new Date(estimatedDeliveryTime);
      if (Number.isNaN(eta.getTime()) || eta <= new Date()) {
        return errorResponse(res, 'INVALID_ETA', 'Estimated delivery time must be in the future.', 422);
      }
      if (eta > deliveryDeadline(bid.shipment)) {
        return errorResponse(
          res,
          'ETA_AFTER_DELIVERY_DATE',
          'Estimated delivery time is later than the cargo owner\'s expected delivery date.',
          422
        );
      }
    }

    // Conditional on the bid still being ACTIVE, so a simultaneous accept or withdrawal wins cleanly
    const changed = await prisma.bid.updateMany({
      where: { id: bidId, status: BID_STATUS.ACTIVE },
      data: {
        ...(proposedFare ? { proposedFare } : {}),
        ...(estimatedDeliveryTime ? { estimatedDeliveryTime: new Date(estimatedDeliveryTime) } : {}),
      },
    });
    if (changed.count !== 1) {
      return errorResponse(res, 'CANNOT_REVISE_BID', 'Bid is no longer active and cannot be revised (BR-8).', 409);
    }

    const updatedBid = await prisma.bid.findUnique({ where: { id: bidId } });
    return successResponse(res, updatedBid, 'Bid revised successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Withdraw an active bid
 * Requirement: FR-DR-7, BR-8
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

    const withdrawn = await prisma.bid.updateMany({
      where: { id: bidId, status: BID_STATUS.ACTIVE },
      data: { status: BID_STATUS.WITHDRAWN },
    });
    if (withdrawn.count !== 1) {
      return errorResponse(res, 'CANNOT_WITHDRAW_BID', 'Bid is no longer active and cannot be withdrawn (BR-8).', 409);
    }

    return successResponse(res, null, 'Bid withdrawn successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Get current active trip for driver
 * Requirement: FR-DR-8
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
        // Only what a driver needs: no encrypted registration, hash or document key
        vehicle: { select: { id: true, vehicleType: true, ratedCapacity: true, model: true, year: true } },
        statusLogs: {
          orderBy: { timestamp: 'asc' },
        },
        positions: {
          take: 1,
          orderBy: { recordedAt: 'desc' },
        },
      },
    });

    // An employee driver is not a party to the fare, so it is not shown to them (C-09)
    if (trip && trip.fleetOwnerId) {
      const { agreedFare, ...withoutFare } = trip;
      return successResponse(res, withoutFare, 'Active trip retrieved');
    }

    return successResponse(res, trip, 'Active trip retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Driver cancels a booked trip: the shipment reopens to PENDING so the cargo owner can accept
 * another bid, the vehicle is released, and the cancellation is counted against the driver (C-47).
 * Blocks if money has already moved. Returns { error } on a conflict, otherwise { ok: true }.
 */
async function reopenAfterDriverCancel(trip, driver, reason) {
  try {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.paymentRecord.findUnique({ where: { shipmentId: trip.shipmentId } });
      if (payment && (payment.status !== 'PENDING' || payment.amountReceived > 0 || payment.isFrozen)) {
        throw { code: 'PAYMENT_ACTIVITY', status: 409, message: 'A payment has already been recorded, so the trip cannot be cancelled here. Raise a complaint instead.' };
      }

      const reopened = await tx.shipment.updateMany({
        where: { id: trip.shipmentId, status: trip.shipment.status },
        data: { status: SHIPMENT_STATUS.PENDING, cancellationReason: null, cancelledById: null },
      });
      if (reopened.count !== 1) {
        throw { code: 'STATUS_CHANGED', status: 409, message: 'The shipment status changed while you were cancelling. Refresh and try again.' };
      }

      if (payment) await tx.paymentRecord.delete({ where: { id: payment.id } });
      await tx.bid.updateMany({
        where: { shipmentId: trip.shipmentId, status: BID_STATUS.ACCEPTED },
        data: { status: BID_STATUS.WITHDRAWN },
      });
      await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { availabilityStatus: 'AVAILABLE' } });
      await tx.trip.delete({ where: { id: trip.id } });
      await tx.user.update({ where: { id: trip.driverId }, data: { cancelledTripsCount: { increment: 1 } } });
    });
  } catch (error) {
    if (error.code && error.status) return { error };
    throw error;
  }

  const number = trip.shipment.shipmentNumber;
  await dispatchNotification({
    recipientId: trip.shipment.cargoOwnerId,
    type: 'TRIP_STATUS_CHANGED',
    title: 'Driver Cancelled',
    message: `The driver cancelled shipment ${number} (${reason}). It is open for bidding again.`,
    relatedShipmentId: trip.shipmentId,
  });
  if (trip.fleetOwnerId) {
    await dispatchNotification({
      recipientId: trip.fleetOwnerId,
      type: 'TRIP_STATUS_CHANGED',
      title: 'Driver Cancelled Trip',
      message: `${driver.name} cancelled the trip for ${number} (${reason}).`,
      relatedShipmentId: trip.shipmentId,
    });
  }
  return { ok: true };
}

/**
 * Keeps a client-supplied event time honest: never in the future and never before the
 * previous status log, so status times and delays cannot be forged (C-30).
 */
function clampEventTime(value, floor, now = new Date()) {
  let at = value ? new Date(value) : now;
  if (Number.isNaN(at.getTime()) || at > now) at = now;
  if (floor && at < floor) at = floor > now ? now : floor;
  return at;
}

async function lastStatusLogTime(tripId) {
  const last = await prisma.tripStatusLog.findFirst({
    where: { tripId },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });
  return last ? last.timestamp : null;
}

/**
 * Advance trip status along lifecycle
 * Requirement: FR-DR-9, FR-DR-10, FR-DR-9, BR-14, BR-15, BR-16
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

    // Strict lifecycle enforcement (BR-14, FR-DR-9)
    if (!allowedTransitions.includes(nextStatus)) {
      return errorResponse(
        res,
        'INVALID_STATUS_TRANSITION',
        `Invalid status transition from ${currentStatus} to ${nextStatus}. Allowed: [${allowedTransitions.join(', ')}] (BR-14).`,
        422
      );
    }

    // Check Proof of Delivery requirement before DELIVERED (BR-15, FR-DR-15)
    if (nextStatus === SHIPMENT_STATUS.DELIVERED) {
      const pod = await prisma.proofOfDelivery.findUnique({
        where: { shipmentId: trip.shipmentId },
      });

      if (!pod || !pod.imageKeys || pod.imageKeys.length === 0) {
        return errorResponse(
          res,
          'PROOF_OF_DELIVERY_REQUIRED',
          'At least one Proof of Delivery image must be uploaded before marking the shipment as Delivered (BR-15, FR-DR-15).',
          400
        );
      }
    }

    if (nextStatus === SHIPMENT_STATUS.CANCELLED) {
      if (!(note && note.trim())) {
        return errorResponse(res, 'CANCELLATION_REASON_REQUIRED', 'A reason (note) is required when cancelling a trip.', 400);
      }
      const outcome = await reopenAfterDriverCancel(trip, req.user, note.trim());
      if (outcome.error) return errorResponse(res, outcome.error.code, outcome.error.message, outcome.error.status);
      return successResponse(res, null, 'Trip cancelled. The shipment is open for bidding again.');
    }

    // Determine tracking state
    const isTrackingActive =
      nextStatus === SHIPMENT_STATUS.REACHED_PICKUP ||
      nextStatus === SHIPMENT_STATUS.CARGO_LOADED ||
      nextStatus === SHIPMENT_STATUS.IN_TRANSIT;

    const eventTime = clampEventTime(timestamp, await lastStatusLogTime(tripId));

    // Compare-and-set on the status we validated, so two simultaneous updates cannot both apply
    try {
      await prisma.$transaction(async (tx) => {
        const moved = await tx.shipment.updateMany({
          where: { id: trip.shipmentId, status: currentStatus },
          data: {
            status: nextStatus,
            ...(nextStatus === SHIPMENT_STATUS.DELIVERED ? { deliveredAt: new Date() } : {}),
          },
        });
        if (moved.count !== 1) {
          throw { code: 'STATUS_CHANGED', status: 409, message: 'The shipment status changed. Refresh and try again.' };
        }
        await tx.trip.update({
          where: { id: tripId },
          data: {
            isTrackingActive,
            ...(nextStatus === SHIPMENT_STATUS.REACHED_PICKUP && !trip.startedAt ? { startedAt: eventTime } : {}),
          },
        });
        await tx.tripStatusLog.create({
          data: {
            tripId,
            status: nextStatus,
            changedById: req.user.id,
            timestamp: eventTime,
            note: note || null,
          },
        });
      });
    } catch (error) {
      if (error.code && error.status) return errorResponse(res, error.code, error.message, error.status);
      throw error;
    }

    // Dispatch status change notification to cargo owner & fleet owner (FR-NC-6)
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
 * Requirement: FR-DR-14, FR-DR-15, BR-18, BR-19
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

    // Only once the vehicle has reached the destination, and before the shipment is marked Delivered (BR-19)
    if (trip.shipment.status !== SHIPMENT_STATUS.REACHED_DESTINATION) {
      return errorResponse(
        res,
        'POD_NOT_ALLOWED_YET',
        'Proof of delivery can only be uploaded once the trip is at Reached Destination (BR-19).',
        409
      );
    }

    if (!req.files || req.files.length === 0) {
      return errorResponse(res, 'FILES_MISSING', 'At least 1 Proof of Delivery image is required (BR-18)', 400);
    }

    // The 5-image cap applies to the shipment in total, not per request (BR-18)
    const existingPod = await prisma.proofOfDelivery.findUnique({ where: { shipmentId: trip.shipmentId } });
    const alreadyUploaded = existingPod ? existingPod.imageKeys.length : 0;
    if (alreadyUploaded + req.files.length > LIMITS.MAX_POD_IMAGES) {
      return errorResponse(
        res,
        'TOO_MANY_IMAGES',
        `Maximum ${LIMITS.MAX_POD_IMAGES} Proof of Delivery images allowed in total; ${alreadyUploaded} already uploaded (BR-18)`,
        400
      );
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

    // Notify cargo owner that POD is available (FR-NC-7)
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
 * Requirement: FR-DR-11, REL-6
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

    // Replay in the order the events happened, skipping any already recorded (safe to retry)
    const alreadyLogged = new Set(
      (await prisma.tripStatusLog.findMany({ where: { tripId }, select: { status: true } })).map((log) => log.status)
    );
    const queue = [...statusUpdates]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .filter((update) => !alreadyLogged.has(update.status));

    // Validate the whole queue against the lifecycle before applying anything (BR-14, BR-15, FR-DR-9)
    // Clamp each event time between the previous log and now, keeping the replay order (C-30)
    let floor = await lastStatusLogTime(tripId);
    for (const update of queue) {
      update.at = clampEventTime(update.timestamp, floor);
      floor = update.at;
    }

    let currentStatus = trip.shipment.status;
    for (const update of queue) {
      const allowed = VALID_STATUS_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(update.status)) {
        return errorResponse(
          res,
          'INVALID_STATUS_TRANSITION',
          `Invalid status transition from ${currentStatus} to ${update.status}. Allowed: [${allowed.join(', ')}] (BR-14). No updates were applied.`,
          422
        );
      }

      if (update.status === SHIPMENT_STATUS.CANCELLED && !(update.note && update.note.trim())) {
        return errorResponse(res, 'CANCELLATION_REASON_REQUIRED', 'A reason (note) is required when cancelling a trip. No updates were applied.', 400);
      }

      if (update.status === SHIPMENT_STATUS.DELIVERED) {
        const pod = await prisma.proofOfDelivery.findUnique({ where: { shipmentId: trip.shipmentId } });
        if (!pod || !pod.imageKeys || pod.imageKeys.length === 0) {
          return errorResponse(
            res,
            'PROOF_OF_DELIVERY_REQUIRED',
            'At least one Proof of Delivery image must be uploaded before marking the shipment as Delivered (BR-15). No updates were applied.',
            400
          );
        }
      }

      currentStatus = update.status;
    }

    if (queue.length > 0 && currentStatus === SHIPMENT_STATUS.CANCELLED) {
      const cancel = queue[queue.length - 1];
      const outcome = await reopenAfterDriverCancel(
        { ...trip, shipment: { ...trip.shipment, status: trip.shipment.status } },
        req.user,
        cancel.note.trim()
      );
      if (outcome.error) return errorResponse(res, outcome.error.code, outcome.error.message, outcome.error.status);
      return successResponse(res, null, 'Trip cancelled. The shipment is open for bidding again.');
    }

    if (queue.length > 0) {
      const trackingStatuses = [SHIPMENT_STATUS.REACHED_PICKUP, SHIPMENT_STATUS.CARGO_LOADED, SHIPMENT_STATUS.IN_TRANSIT];
      const pickup = queue.find((update) => update.status === SHIPMENT_STATUS.REACHED_PICKUP);

      await prisma.$transaction([
        ...queue.map((update) =>
          prisma.tripStatusLog.create({
            data: {
              tripId,
              status: update.status,
              changedById: req.user.id,
              timestamp: update.at,
              note: update.note || 'Synced from offline queue (REL-6)',
            },
          })
        ),
        prisma.shipment.update({
          where: { id: trip.shipmentId },
          data: {
            status: currentStatus,
            ...(currentStatus === SHIPMENT_STATUS.DELIVERED ? { deliveredAt: new Date() } : {}),
          },
        }),
        prisma.trip.update({
          where: { id: tripId },
          data: {
            isTrackingActive: trackingStatuses.includes(currentStatus),
            ...(pickup && !trip.startedAt ? { startedAt: pickup.at } : {}),
          },
        }),
      ]);

      await dispatchNotification({
        recipientId: trip.shipment.cargoOwnerId,
        type: 'TRIP_STATUS_CHANGED',
        title: 'Shipment Status Updated',
        message: `Shipment ${trip.shipment.shipmentNumber} status is now: ${currentStatus.replace(/_/g, ' ')}.`,
        relatedShipmentId: trip.shipmentId,
      });
    }

    return successResponse(res, null, `Successfully synced ${queue.length} offline status changes`);
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
      include: { shipment: { select: { status: true, deliveredAt: true, updatedAt: true } } },
    });

    if (!trip || trip.driverId !== req.user.id) {
      return errorResponse(res, 'NOT_FOUND', 'Trip not found or unauthorized', 404);
    }

    // Collection stops when the shipment is Delivered or Cancelled; queued points recorded before that are still kept (BR-16, FR-RT-12)
    const finished = trip.shipment && ['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(trip.shipment.status);
    const endAt = finished ? new Date(trip.shipment.deliveredAt || trip.shipment.updatedAt).getTime() : null;

    // Keep only usable points: accuracy <= 100m (HI-3), a time between trip creation and now,
    // and no duplicates within the batch or against points already stored (C-30)
    const now = Date.now();
    const seen = new Set();
    const candidates = [];
    for (const p of positions) {
      const at = new Date(p.timestamp).getTime();
      if (p.accuracy > LIMITS.MAX_GPS_ACCURACY_METERS) continue;
      if (at > now + 60 * 1000 || at < trip.createdAt.getTime()) continue;
      if (endAt !== null && at > endAt) continue;
      if (seen.has(at)) continue;
      seen.add(at);
      candidates.push({ ...p, at });
    }

    let validPositions = candidates;
    if (candidates.length > 0) {
      const existing = await prisma.tripPosition.findMany({
        where: { tripId, recordedAt: { in: candidates.map((p) => new Date(p.at)) } },
        select: { recordedAt: true },
      });
      const stored = new Set(existing.map((e) => e.recordedAt.getTime()));
      validPositions = candidates.filter((p) => !stored.has(p.at));
    }

    if (validPositions.length > 0) {
      await prisma.tripPosition.createMany({
        data: validPositions.map((p) => ({
          tripId,
          driverId: req.user.id,
          latitude: p.latitude,
          longitude: p.longitude,
          accuracy: p.accuracy,
          recordedAt: new Date(p.at),
        })),
      });
    }

    return successResponse(
      res,
      { syncedCount: validPositions.length, skippedCount: positions.length - validPositions.length },
      `Successfully synced ${validPositions.length} offline GPS positions (CI-5)`
    );
  } catch (error) {
    next(error);
  }
}

/**
 * The caller's no-show penalties and this month's active count
 * Requirement: no-show penalty
 */
async function listMyPenalties(req, res, next) {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const penalties = await prisma.driverPenalty.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        shipmentId: true,
        reason: true,
        status: true,
        createdAt: true,
        waivedAt: true,
        shipment: { select: { shipmentNumber: true } },
      },
    });
    const activeThisMonth = penalties.filter((p) => p.status === 'ACTIVE' && p.createdAt >= monthStart).length;
    return successResponse(res, { activeThisMonth, limit: LIMITS.NO_SHOW_PENALTY_LIMIT, penalties }, 'Penalties retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Driver earnings report
 * Requirement: FR-DR-16
 */
async function getEarningsSummary(req, res, next) {
  try {
    const trips = await prisma.trip.findMany({
      where: {
        driverId: req.user.id,
        fleetOwnerId: null, // An employee driver is not the payee: the fleet's fare is not theirs to see (C-09)
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

/**
 * Fleet invitations waiting for this driver's answer (C-10)
 * Requirement: FR-FO-6
 */
async function listFleetInvitations(req, res, next) {
  try {
    const invitations = await prisma.driverFleetLink.findMany({
      where: { driverId: req.user.id, status: 'INVITED' },
      include: { fleetOwner: { select: { id: true, name: true, businessName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return successResponse(res, invitations, 'Fleet invitations retrieved');
  } catch (error) {
    next(error);
  }
}

async function answerFleetInvitation(req, res, next, accept) {
  try {
    const { id } = req.params;
    const invitation = await prisma.driverFleetLink.findFirst({
      where: { id, driverId: req.user.id, status: 'INVITED' },
    });
    if (!invitation) {
      return errorResponse(res, 'INVITATION_NOT_FOUND', 'No pending invitation found', 404);
    }

    // Conditional on the invitation still being open, so a double tap cannot answer twice
    const result = accept
      ? await prisma.driverFleetLink.updateMany({ where: { id, driverId: req.user.id, status: 'INVITED' }, data: { status: 'ACTIVE' } })
      : await prisma.driverFleetLink.deleteMany({ where: { id, driverId: req.user.id, status: 'INVITED' } });
    if (result.count !== 1) {
      return errorResponse(res, 'INVITATION_NOT_FOUND', 'No pending invitation found', 404);
    }

    await dispatchNotification({
      recipientId: invitation.fleetOwnerId,
      type: 'FLEET_INVITATION',
      title: accept ? 'Driver joined your fleet' : 'Invitation declined',
      message: `${req.user.name} has ${accept ? 'accepted' : 'declined'} your fleet invitation.`,
    });

    return successResponse(res, null, accept ? 'You have joined the fleet' : 'Invitation declined');
  } catch (error) {
    next(error);
  }
}

const acceptFleetInvitation = (req, res, next) => answerFleetInvitation(req, res, next, true);
const declineFleetInvitation = (req, res, next) => answerFleetInvitation(req, res, next, false);

/**
 * Accepting bids switch (FR-DR-19). Switching off also deletes the stored position (SEC-18).
 */
async function setAvailability(req, res, next) {
  try {
    const { accepting } = req.body;
    const data = accepting
      ? { isAcceptingBids: true }
      : { isAcceptingBids: false, lastLat: null, lastLng: null, lastLocationAt: null };
    await prisma.user.update({ where: { id: req.user.id }, data });
    return successResponse(res, { isAcceptingBids: accepting }, accepting ? 'Accepting bids' : 'Not accepting bids');
  } catch (error) {
    next(error);
  }
}

/**
 * Latest position of a driver who is accepting bids (FR-DR-19). Only the latest position is kept.
 */
async function reportLivePosition(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { isAcceptingBids: true } });
    if (!user || !user.isAcceptingBids) {
      return errorResponse(res, 'NOT_ACCEPTING_BIDS', 'Turn on Accepting bids before sharing your position.', 409);
    }
    const { latitude, longitude } = req.body;
    await prisma.user.update({
      where: { id: req.user.id },
      data: { lastLat: latitude, lastLng: longitude, lastLocationAt: new Date() },
    });
    return successResponse(res, { recordedAt: new Date().toISOString() }, 'Position recorded');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  setAvailability,
  reportLivePosition,
  listMyPenalties,
  listFleetInvitations,
  acceptFleetInvitation,
  declineFleetInvitation,
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
