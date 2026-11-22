const prisma = require('../../config/db');
const { getRoute } = require('../../services/osrm.service');
const { dispatchNotification } = require('../../services/fcm.service');
const { computeRecommendationsForShipment, isCargoCompatibleWithVehicle } = require('../matching/matching.service');
const { generateSignedReadUrl } = require('../../services/storage.service');
const { getPaginationParams, buildPaginationMeta } = require('../../utils/pagination');
const { isBidExpired, bidCutoff } = require('../../utils/bids');
const { successResponse, errorResponse } = require('../../utils/response');
const { createWithReference } = require('../../utils/reference');
const {
  VEHICLE_TYPES,
  SHIPMENT_STATUS,
  BID_STATUS,
  PAYMENT_STATUS,
  ACCOUNT_STATUS,
  ROLES,
  LIMITS,
} = require('../../config/constants');

/**
 * Preview route distance, duration and polyline before publishing
 * Requirement: FR-CO-4, SI-2.1
 */
async function previewRoute(req, res, next) {
  try {
    const { pickupLat, pickupLng, dropoffLat, dropoffLng } = req.body;
    const route = await getRoute(pickupLat, pickupLng, dropoffLat, dropoffLng);
    return successResponse(res, route, 'Route calculated');
  } catch (error) {
    next(error);
  }
}

/**
 * Create and publish a new shipment request
 * Requirement: FR-CO-2, FR-CO-3, FR-CO-5, BR-4, BR-5, BR-6
 */
async function createShipment(req, res, next) {
  try {
    const {
      pickupAddress,
      pickupLat,
      pickupLng,
      pickupContactName,
      pickupContactPhone,
      dropoffAddress,
      dropoffLat,
      dropoffLng,
      dropoffContactName,
      dropoffContactPhone,
      cargoType,
      cargoWeight,
      cargoDimensions,
      requiredVehicleType,
      expectedDeliveryDate,
      isDraft,
    } = req.body;

    // Validate cargo weight against selected vehicle maximum capacity (BR-4)
    const vehicleSpec = VEHICLE_TYPES[requiredVehicleType];
    if (!vehicleSpec) {
      return errorResponse(res, 'INVALID_VEHICLE_TYPE', 'Specified vehicle type is invalid', 400);
    }

    if (cargoWeight > vehicleSpec.maxCapacity) {
      return errorResponse(
        res,
        'WEIGHT_EXCEEDS_CAPACITY',
        `Cargo weight (${cargoWeight} tonnes) exceeds maximum capacity for ${vehicleSpec.label} (${vehicleSpec.maxCapacity} tonnes) (BR-4).`,
        422
      );
    }

    // The cargo must be one the chosen vehicle body can carry (BR-5, Table C-5)
    if (!isCargoCompatibleWithVehicle(requiredVehicleType, cargoType)) {
      return errorResponse(
        res,
        'CARGO_VEHICLE_INCOMPATIBLE',
        `${vehicleSpec.label} cannot carry this cargo type (BR-5). Choose a suitable vehicle type.`,
        422
      );
    }

    // Compute route distance & duration
    const routeData = await getRoute(pickupLat, pickupLng, dropoffLat, dropoffLng);

    const shipment = await createWithReference(prisma.shipment, {
      field: 'shipmentNumber',
      prefix: `SH-${new Date().getFullYear()}-`,
      width: 5,
      data: {
        cargoOwnerId: req.user.id,
        pickupAddress,
        pickupLat,
        pickupLng,
        pickupContactName: pickupContactName || null,
        pickupContactPhone: pickupContactPhone || null,
        dropoffAddress,
        dropoffLat,
        dropoffLng,
        dropoffContactName: dropoffContactName || null,
        dropoffContactPhone: dropoffContactPhone || null,
        cargoType,
        cargoWeight,
        cargoDimensions: cargoDimensions || null,
        requiredVehicleType,
        expectedDeliveryDate: new Date(expectedDeliveryDate),
        distanceKm: routeData.distanceKm,
        durationMinutes: routeData.durationMinutes,
        routePolyline: routeData.polyline,
        isDistanceApproximate: routeData.isDistanceApproximate,
        status: SHIPMENT_STATUS.PENDING,
        isDraft: Boolean(isDraft),
      },
    });

    // Match the new request against eligible vehicles, including return and shared loads (FR-RM-11)
    if (!shipment.isDraft) {
      await computeRecommendationsForShipment(shipment.id);
    }

    return successResponse(res, shipment, 'Shipment request created successfully', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Publish a saved draft so it opens for bidding
 * Requirement: FR-CO-5
 */
async function publishShipment(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.shipment.findUnique({ where: { id } });

    if (!existing || existing.cargoOwnerId !== req.user.id) {
      return errorResponse(res, 'NOT_FOUND', 'Shipment not found or unauthorized', 404);
    }
    if (!existing.isDraft || existing.status !== SHIPMENT_STATUS.PENDING) {
      return errorResponse(res, 'NOT_A_DRAFT', 'Only a saved draft can be published.', 409);
    }
    if (new Date(existing.expectedDeliveryDate) < new Date(new Date().setHours(0, 0, 0, 0))) {
      return errorResponse(
        res,
        'DELIVERY_DATE_PASSED',
        'The expected delivery date has passed. Create a new request with a new date (BR-6).',
        422
      );
    }

    const published = await prisma.shipment.updateMany({
      where: { id, isDraft: true, status: SHIPMENT_STATUS.PENDING },
      data: { isDraft: false },
    });
    if (published.count !== 1) {
      return errorResponse(res, 'NOT_A_DRAFT', 'Only a saved draft can be published.', 409);
    }

    await computeRecommendationsForShipment(id);
    const shipment = await prisma.shipment.findUnique({ where: { id } });
    return successResponse(res, shipment, 'Shipment published');
  } catch (error) {
    next(error);
  }
}

/**
 * List shipments for Cargo Owner
 * Requirement: FR-CO-9, FR-CO-18, SI-1.5
 */
async function listMyShipments(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { status, isDraft } = req.query;

    const whereClause = {
      cargoOwnerId: req.user.id,
      ...(status ? { status } : {}),
      ...(isDraft !== undefined ? { isDraft: isDraft === 'true' } : {}),
    };

    const [total, shipments] = await Promise.all([
      prisma.shipment.count({ where: whereClause }),
      prisma.shipment.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        omit: { routePolyline: true }, // lists stay light; the full route is on the detail view (C-33)
        include: {
          bids: {
            where: { status: BID_STATUS.ACTIVE, createdAt: { gt: bidCutoff() } },
            select: { id: true, proposedFare: true },
          },
          paymentRecord: {
            select: { agreedFare: true, amountReceived: true, status: true },
          },
        },
      }),
    ]);

    const transformed = shipments.map((s) => ({
      ...s,
      activeBidsCount: s.bids.length,
    }));

    return successResponse(
      res,
      transformed,
      'Shipments retrieved',
      200,
      buildPaginationMeta(total, page, limit)
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Get detailed shipment by ID
 */
async function getShipmentById(req, res, next) {
  try {
    const { id } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        cargoOwner: {
          select: { id: true, name: true, phone: true, email: true },
        },
        bids: {
          include: {
            bidder: {
              select: {
                id: true,
                name: true,
                phone: true,
                role: true,
                avgRating: true,
                completedTripsCount: true,
              },
            },
          },
          orderBy: { proposedFare: 'asc' },
        },
        trip: {
          include: {
            driver: {
              select: { id: true, name: true, phone: true, avgRating: true },
            },
            vehicle: true,
            statusLogs: {
              orderBy: { timestamp: 'asc' },
            },
          },
        },
        proofOfDelivery: true,
        paymentRecord: {
          include: {
            statusLogs: { orderBy: { timestamp: 'desc' } },
          },
        },
      },
    });

    if (!shipment) {
      return errorResponse(res, 'SHIPMENT_NOT_FOUND', 'Shipment not found', 404);
    }

    // Ensure only the owner, assigned driver/fleet, or admin can view detail (SEC-10)
    const isOwner = shipment.cargoOwnerId === req.user.id;
    const isDriver = shipment.trip && shipment.trip.driverId === req.user.id;
    const isFleetOwner = shipment.trip && shipment.trip.fleetOwnerId === req.user.id;
    const isAdmin = req.user.role === ROLES.ADMIN;

    if (!isOwner && !isDriver && !isFleetOwner && !isAdmin) {
      return errorResponse(res, 'FORBIDDEN_ACCESS', 'You are not authorized to view this shipment', 403);
    }

    // Competing bids belong to the owner only; other parties see the winning bid (SEC-10)
    if (!isOwner && !isAdmin) {
      shipment.bids = shipment.bids.filter((b) => b.status === BID_STATUS.ACCEPTED);
    }

    // Attach signed URLs for POD images if present
    if (shipment.proofOfDelivery && shipment.proofOfDelivery.imageKeys) {
      shipment.proofOfDelivery.signedUrls = shipment.proofOfDelivery.imageKeys.map((key) =>
        generateSignedReadUrl(key)
      );
    }

    return successResponse(res, shipment, 'Shipment retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Accept a bid (ATOMIC TRANSACTION)
 * Requirement: FR-CO-7, FR-CO-7, FR-CO-7, BR-10, BR-11, BR-23, REL-4, REL-5
 */
async function acceptBid(req, res, next) {
  try {
    const { id: shipmentId } = req.params;
    const { bidId, expectedFare } = req.body;

    // Run in one transaction. Concurrent accepts are resolved by the compare-and-set in step 3.
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch shipment and validate ownership/state
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
      });

      if (!shipment) {
        throw { code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found', status: 404 };
      }

      if (shipment.cargoOwnerId !== req.user.id) {
        throw { code: 'FORBIDDEN', message: 'Only the shipment owner can accept bids', status: 403 };
      }

      if (shipment.status !== SHIPMENT_STATUS.PENDING) {
        throw {
          code: 'SHIPMENT_ALREADY_BOOKED',
          message: `Cannot accept bid. Shipment is in ${shipment.status} state. (BR-10, REL-5)`,
          status: 409,
        };
      }

      // 2. Fetch the candidate bid
      const bid = await tx.bid.findUnique({
        where: { id: bidId },
        include: { bidder: true },
      });

      if (!bid || bid.shipmentId !== shipmentId || bid.status !== BID_STATUS.ACTIVE) {
        throw { code: 'INVALID_BID', message: 'Selected bid is not active or not found', status: 400 };
      }
      if (isBidExpired(bid)) {
        throw { code: 'BID_EXPIRED', message: 'This bid expired 24 hours after it was placed. Ask the driver to bid again.', status: 409 };
      }

      // The fare the owner saw must still be the bid's fare; a late revision means they must look again (C-08)
      if (Math.abs(bid.proposedFare - expectedFare) > 0.005) {
        throw {
          code: 'BID_CHANGED',
          message: 'The bid was revised after you viewed it. Review the new fare and accept again.',
          status: 409,
        };
      }

      // Check bidder account status
      if (bid.bidder.accountStatus !== ACCOUNT_STATUS.VERIFIED) {
        throw {
          code: 'BIDDER_NOT_VERIFIED',
          message: 'The bidder account is currently not verified or has been suspended',
          status: 400,
        };
      }

      // 3. Mark shipment as BOOKED only if it is still PENDING (compare-and-set).
      // Two simultaneous accepts both pass the check above; only one can match here (BR-10, REL-5).
      const booked = await tx.shipment.updateMany({
        where: { id: shipmentId, status: SHIPMENT_STATUS.PENDING },
        data: { status: SHIPMENT_STATUS.BOOKED },
      });

      if (booked.count !== 1) {
        throw {
          code: 'SHIPMENT_ALREADY_BOOKED',
          message: 'Shipment was booked by another request. (BR-10, REL-5)',
          status: 409,
        };
      }

      const updatedShipment = await tx.shipment.findUnique({ where: { id: shipmentId } });

      // 4. Mark accepted bid as ACCEPTED, only if it is still ACTIVE at this fare
      const accepted = await tx.bid.updateMany({
        where: { id: bidId, status: BID_STATUS.ACTIVE, proposedFare: bid.proposedFare },
        data: { status: BID_STATUS.ACCEPTED },
      });
      if (accepted.count !== 1) {
        throw { code: 'BID_CHANGED', message: 'The bid was withdrawn or revised. Review it and try again.', status: 409 };
      }

      // 5. Reject all other bids on this shipment (BR-11) and remember who lost (FR-NC-7)
      const losingBids = await tx.bid.findMany({
        where: { shipmentId, id: { not: bidId }, status: BID_STATUS.ACTIVE },
        select: { bidderId: true },
      });
      const losingBidderIds = [...new Set(losingBids.map((b) => b.bidderId))];

      await tx.bid.updateMany({
        where: {
          shipmentId,
          id: { not: bidId },
          status: BID_STATUS.ACTIVE,
        },
        data: { status: BID_STATUS.REJECTED },
      });

      // 6. Create immutable PaymentRecord initialized to PENDING (BR-23, FR-PM-1)
      const isFleet = bid.bidder.role === ROLES.FLEET_OWNER;
      const paymentRecord = await tx.paymentRecord.create({
        data: {
          shipmentId,
          cargoOwnerId: req.user.id,
          driverId: isFleet ? null : bid.bidderId,
          fleetOwnerId: isFleet ? bid.bidderId : null,
          payeeId: bid.bidderId,
          agreedFare: bid.proposedFare,
          amountReceived: 0,
          status: PAYMENT_STATUS.PENDING,
          isFrozen: false,
        },
      });

      // 7. If bidder is an individual driver, reserve the bid's vehicle and create the Trip (C-05, C-11)
      let trip = null;
      if (!isFleet) {
        const vehicle = bid.vehicleId
          ? await tx.vehicle.findUnique({ where: { id: bid.vehicleId } })
          : await tx.vehicle.findFirst({ where: { ownerId: bid.bidderId } });

        if (!vehicle || vehicle.ownerId !== bid.bidderId) {
          throw { code: 'BID_VEHICLE_MISSING', message: 'The vehicle offered with this bid is no longer on the bidder\'s account.', status: 409 };
        }

        const reserved = await tx.vehicle.updateMany({
          where: { id: vehicle.id, availabilityStatus: 'AVAILABLE' },
          data: { availabilityStatus: 'ASSIGNED' },
        });
        if (reserved.count !== 1) {
          throw { code: 'VEHICLE_UNAVAILABLE', message: 'The bidder\'s vehicle is no longer available. Choose another bid.', status: 409 };
        }

        trip = await tx.trip.create({
          data: {
            shipmentId,
            driverId: bid.bidderId,
            vehicleId: vehicle.id,
            agreedFare: bid.proposedFare,
          },
        });

        await tx.tripStatusLog.create({
          data: {
            tripId: trip.id,
            status: SHIPMENT_STATUS.BOOKED,
            changedById: req.user.id,
            timestamp: new Date(),
            note: 'Shipment booked and driver assigned',
          },
        });
      }

      return { updatedShipment, bid, paymentRecord, trip, losingBidderIds };
    });

    // Asynchronously dispatch notifications (outside transaction block)
    // Notify winning bidder (FR-NC-5)
    await dispatchNotification({
      recipientId: result.bid.bidderId,
      type: 'BID_ACCEPTED',
      title: 'Bid Accepted!',
      message: `Your bid of PKR ${result.bid.proposedFare.toLocaleString()} for shipment ${result.updatedShipment.shipmentNumber} was accepted.`,
      relatedShipmentId: shipmentId,
    });

    // Tell every bidder who lost that the shipment is no longer available
    await Promise.all(
      result.losingBidderIds.map((bidderId) =>
        dispatchNotification({
          recipientId: bidderId,
          type: 'SHIPMENT_BOOKED_BY_ANOTHER',
          title: 'Shipment Booked',
          message: `Shipment ${result.updatedShipment.shipmentNumber} was booked with another bidder.`,
          relatedShipmentId: shipmentId,
        })
      )
    );

    return successResponse(
      res,
      {
        shipment: result.updatedShipment,
        paymentRecord: result.paymentRecord,
        trip: result.trip,
      },
      'Bid accepted successfully and shipment booked (REL-4)'
    );
  } catch (error) {
    if (error.code && error.status) {
      return errorResponse(res, error.code, error.message, error.status);
    }
    next(error);
  }
}

/**
 * Confirm delivery completion
 * Requirement: FR-CO-12, BR-20
 */
async function confirmDelivery(req, res, next) {
  try {
    const { id: shipmentId } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { trip: true, proofOfDelivery: true },
    });

    if (!shipment || shipment.cargoOwnerId !== req.user.id) {
      return errorResponse(res, 'NOT_FOUND', 'Shipment not found or unauthorized', 404);
    }

    if (shipment.status !== SHIPMENT_STATUS.DELIVERED) {
      return errorResponse(
        res,
        'INVALID_STATUS',
        `Shipment must be in DELIVERED status to confirm completion. Current status: ${shipment.status}`,
        400
      );
    }

    if (!shipment.proofOfDelivery) {
      return errorResponse(
        res,
        'POD_REQUIRED',
        'Cannot confirm completion without uploaded proof of delivery (BR-15).',
        400
      );
    }

    // Update status to COMPLETED
    const completedAt = new Date();
    const confirmed = await prisma.$transaction(async (tx) => {
      // Compare-and-set so the 72-hour job and this call cannot both complete (and count) the same shipment (C-35)
      const moved = await tx.shipment.updateMany({
        where: { id: shipmentId, status: SHIPMENT_STATUS.DELIVERED },
        data: { status: SHIPMENT_STATUS.COMPLETED, completedAt },
      });
      if (moved.count !== 1) return false;
      await tx.trip.update({
        where: { shipmentId },
        data: { completedAt, isTrackingActive: false },
      });
      // Increment completed trips for driver
      await tx.user.update({
        where: { id: shipment.trip.driverId },
        data: { completedTripsCount: { increment: 1 } },
      });
      // Set vehicle availability back to AVAILABLE
      await tx.vehicle.update({
        where: { id: shipment.trip.vehicleId },
        data: { availabilityStatus: 'AVAILABLE' },
      });
      return true;
    });

    if (!confirmed) {
      return errorResponse(res, 'STATUS_CHANGED', 'The shipment status changed. Refresh and try again.', 409);
    }

    // Notify driver
    await dispatchNotification({
      recipientId: shipment.trip.driverId,
      type: 'DELIVERY_CONFIRMED',
      title: 'Delivery Confirmed',
      message: `Cargo owner has confirmed completion for shipment ${shipment.shipmentNumber}.`,
      relatedShipmentId: shipmentId,
    });

    return successResponse(res, null, 'Delivery confirmed and shipment marked completed (FR-CO-12)');
  } catch (error) {
    next(error);
  }
}

/**
 * Flag a no-show: the booked party did not turn up. Only the cargo owner who booked can do it,
 * only while the shipment is still Booked. The shipment is reopened for bidding, the party gets a
 * penalty, and three active penalties in a calendar month suspend the account.
 * Requirement: FR-CO no-show, BR no-show penalty
 */
async function flagNoShow(req, res, next) {
  try {
    const { id: shipmentId } = req.params;
    const reason = typeof req.body.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : null;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { trip: true, paymentRecord: true },
    });

    if (!shipment || shipment.cargoOwnerId !== req.user.id) {
      return errorResponse(res, 'NOT_FOUND', 'Shipment not found or unauthorized', 404);
    }

    if (shipment.status !== SHIPMENT_STATUS.BOOKED) {
      return errorResponse(res, 'NOT_BOOKED', 'A no-show can be flagged only while the shipment is Booked and the driver has not reached pickup.', 409);
    }

    const payment = shipment.paymentRecord;
    if (!payment) {
      return errorResponse(res, 'NO_BOOKING', 'This shipment has no accepted booking to flag.', 409);
    }
    if (payment.status !== PAYMENT_STATUS.PENDING || payment.amountReceived > 0 || payment.isFrozen) {
      return errorResponse(res, 'PAYMENT_ACTIVITY', 'A payment has already been recorded, so a no-show cannot be flagged here. Raise a complaint instead.', 409);
    }

    const targetId = payment.payeeId || payment.fleetOwnerId || payment.driverId;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const reopened = await tx.shipment.updateMany({
          where: { id: shipmentId, status: SHIPMENT_STATUS.BOOKED },
          data: { status: SHIPMENT_STATUS.PENDING, cancellationReason: null, cancelledById: null },
        });
        if (reopened.count !== 1) {
          throw { code: 'STATUS_CHANGED', status: 409, message: 'The shipment status changed. Refresh and try again.' };
        }

        await tx.paymentRecord.delete({ where: { id: payment.id } });
        await tx.bid.updateMany({
          where: { shipmentId, status: BID_STATUS.ACCEPTED },
          data: { status: BID_STATUS.WITHDRAWN },
        });
        if (shipment.trip) {
          await tx.vehicle.update({ where: { id: shipment.trip.vehicleId }, data: { availabilityStatus: 'AVAILABLE' } });
          await tx.trip.delete({ where: { id: shipment.trip.id } });
        }

        await tx.driverPenalty.create({
          data: { userId: targetId, shipmentId, flaggedById: req.user.id, reason },
        });
        const penaltiesThisMonth = await tx.driverPenalty.count({
          where: { userId: targetId, status: 'ACTIVE', createdAt: { gte: monthStart } },
        });

        let suspended = false;
        if (penaltiesThisMonth >= LIMITS.NO_SHOW_PENALTY_LIMIT) {
          const target = await tx.user.findUnique({ where: { id: targetId }, select: { accountStatus: true } });
          if (target && target.accountStatus !== ACCOUNT_STATUS.SUSPENDED) {
            await tx.bid.updateMany({
              where: { bidderId: targetId, status: BID_STATUS.ACTIVE },
              data: { status: BID_STATUS.WITHDRAWN },
            });
            await tx.user.update({
              where: { id: targetId },
              data: {
                accountStatus: ACCOUNT_STATUS.SUSPENDED,
                statusBeforeSuspension: target.accountStatus,
                tokenVersion: { increment: 1 },
              },
            });
            suspended = true;
          }
        }
        return { penaltiesThisMonth, suspended };
      });
    } catch (error) {
      if (error.code === 'P2002') {
        return errorResponse(res, 'ALREADY_FLAGGED', 'This booking has already been flagged as a no-show.', 409);
      }
      if (error.code && error.status) return errorResponse(res, error.code, error.message, error.status);
      throw error;
    }

    const number = shipment.shipmentNumber;
    await dispatchNotification({
      recipientId: targetId,
      type: 'DRIVER_PENALTY',
      title: 'No-show Recorded',
      message: `The cargo owner reported a no-show on shipment ${number}. You have ${result.penaltiesThisMonth} of ${LIMITS.NO_SHOW_PENALTY_LIMIT} penalties this month. If this is wrong, raise a cancellation dispute.`,
      relatedShipmentId: shipmentId,
    });
    if (shipment.trip && shipment.trip.driverId !== targetId) {
      await dispatchNotification({
        recipientId: shipment.trip.driverId,
        type: 'TRIP_STATUS_CHANGED',
        title: 'Booking Cancelled',
        message: `Shipment ${number} was reopened after a no-show report against your fleet.`,
        relatedShipmentId: shipmentId,
      });
    }
    if (result.suspended) {
      await dispatchNotification({
        recipientId: targetId,
        type: 'ACCOUNT_SUSPENDED_OR_REINSTATED',
        title: 'Account Suspended',
        message: `Your account was suspended after ${LIMITS.NO_SHOW_PENALTY_LIMIT} no-show penalties in one month. Contact support to appeal.`,
      });
      const admins = await prisma.user.findMany({ where: { role: ROLES.ADMIN }, select: { id: true } });
      await Promise.allSettled(
        admins.map((admin) =>
          dispatchNotification({
            recipientId: admin.id,
            type: 'ACCOUNT_SUSPENDED_OR_REINSTATED',
            title: 'Account Auto-Suspended',
            message: `An account was suspended automatically after ${LIMITS.NO_SHOW_PENALTY_LIMIT} no-show penalties this month (latest: shipment ${number}).`,
            relatedShipmentId: shipmentId,
          })
        )
      );
    }

    return successResponse(
      res,
      { penaltiesThisMonth: result.penaltiesThisMonth, accountSuspended: result.suspended },
      'No-show recorded. The shipment is open for bidding again.'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel shipment
 * Requirement: FR-CO-8, BR-14
 */
async function cancelShipment(req, res, next) {
  try {
    const { id: shipmentId } = req.params;
    const { reason } = req.body;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { trip: true },
    });

    if (!shipment || shipment.cargoOwnerId !== req.user.id) {
      return errorResponse(res, 'NOT_FOUND', 'Shipment not found or unauthorized', 404);
    }

    // Can only cancel from PENDING or BOOKED (BR-14)
    if (shipment.status !== SHIPMENT_STATUS.PENDING && shipment.status !== SHIPMENT_STATUS.BOOKED) {
      return errorResponse(
        res,
        'CANNOT_CANCEL',
        `Shipment in status ${shipment.status} cannot be cancelled (BR-14).`,
        400
      );
    }

    let bidderIds = [];
    try {
      bidderIds = await prisma.$transaction(async (tx) => {
        // Compare-and-set: cancel only if the status is still the one we validated (a driver may have moved it)
        const cancelled = await tx.shipment.updateMany({
          where: { id: shipmentId, status: shipment.status },
          data: {
            status: SHIPMENT_STATUS.CANCELLED,
            cancellationReason: reason,
            cancelledById: req.user.id,
          },
        });
        if (cancelled.count !== 1) {
          throw { code: 'STATUS_CHANGED', status: 409, message: 'The shipment status changed. Refresh and try again.' };
        }

        const activeBids = await tx.bid.findMany({
          where: { shipmentId, status: BID_STATUS.ACTIVE },
          select: { bidderId: true },
        });
        await tx.bid.updateMany({
          where: { shipmentId, status: BID_STATUS.ACTIVE },
          data: { status: BID_STATUS.REJECTED },
        });

        if (shipment.trip) {
          // Release the vehicle and stop tracking; keep the trip as history
          await tx.vehicle.update({ where: { id: shipment.trip.vehicleId }, data: { availabilityStatus: 'AVAILABLE' } });
          await tx.trip.update({ where: { id: shipment.trip.id }, data: { isTrackingActive: false } });
          await tx.tripStatusLog.create({
            data: {
              tripId: shipment.trip.id,
              status: SHIPMENT_STATUS.CANCELLED,
              changedById: req.user.id,
              timestamp: new Date(),
              note: `Cancelled by cargo owner: ${reason}`,
            },
          });
        }

        // An untouched payment record has nothing to settle; leave any record with activity in place
        const payment = await tx.paymentRecord.findUnique({ where: { shipmentId } });
        if (payment && payment.status === PAYMENT_STATUS.PENDING && payment.amountReceived === 0 && !payment.isFrozen) {
          await tx.paymentRecord.delete({ where: { id: payment.id } });
        }

        return [...new Set(activeBids.map((b) => b.bidderId))];
      });
    } catch (error) {
      if (error.code && error.status) return errorResponse(res, error.code, error.message, error.status);
      throw error;
    }

    const recipients = new Set(bidderIds);
    if (shipment.trip) {
      recipients.add(shipment.trip.driverId);
      if (shipment.trip.fleetOwnerId) recipients.add(shipment.trip.fleetOwnerId);
    }
    await Promise.all(
      [...recipients].map((recipientId) =>
        dispatchNotification({
          recipientId,
          type: 'TRIP_STATUS_CHANGED',
          title: 'Shipment Cancelled',
          message: `Shipment ${shipment.shipmentNumber} was cancelled by the cargo owner.`,
          relatedShipmentId: shipmentId,
        })
      )
    );

    return successResponse(res, null, 'Shipment cancelled successfully (FR-CO-8)');
  } catch (error) {
    next(error);
  }
}

/**
 * Duplicate a previous shipment (FR-CO-2)
 */
async function repeatShipment(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.shipment.findUnique({
      where: { id, cargoOwnerId: req.user.id },
    });

    if (!existing) {
      return errorResponse(res, 'NOT_FOUND', 'Original shipment not found', 404);
    }

    const newShipment = await createWithReference(prisma.shipment, {
      field: 'shipmentNumber',
      prefix: `SH-${new Date().getFullYear()}-`,
      width: 5,
      data: {
        cargoOwnerId: req.user.id,
        pickupAddress: existing.pickupAddress,
        pickupLat: existing.pickupLat,
        pickupLng: existing.pickupLng,
        pickupContactName: existing.pickupContactName,
        pickupContactPhone: existing.pickupContactPhone,
        dropoffAddress: existing.dropoffAddress,
        dropoffLat: existing.dropoffLat,
        dropoffLng: existing.dropoffLng,
        dropoffContactName: existing.dropoffContactName,
        dropoffContactPhone: existing.dropoffContactPhone,
        cargoType: existing.cargoType,
        cargoWeight: existing.cargoWeight,
        cargoDimensions: existing.cargoDimensions,
        requiredVehicleType: existing.requiredVehicleType,
        expectedDeliveryDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Default tomorrow
        distanceKm: existing.distanceKm,
        durationMinutes: existing.durationMinutes,
        routePolyline: existing.routePolyline,
        isDistanceApproximate: existing.isDistanceApproximate,
        status: SHIPMENT_STATUS.PENDING,
        isDraft: false,
      },
    });

    // Same matching step as a newly created request (FR-RM-11)
    await computeRecommendationsForShipment(newShipment.id);

    return successResponse(res, newShipment, 'Repeated shipment created successfully', 201);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  previewRoute,
  createShipment,
  publishShipment,
  listMyShipments,
  getShipmentById,
  acceptBid,
  confirmDelivery,
  cancelShipment,
  flagNoShow,
  repeatShipment,
};
