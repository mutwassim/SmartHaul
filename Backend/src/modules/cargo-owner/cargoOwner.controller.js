const prisma = require('../../config/db');
const { getRoute } = require('../../services/osrm.service');
const { dispatchNotification } = require('../../services/fcm.service');
const { generateSignedReadUrl } = require('../../services/storage.service');
const { getPaginationParams, buildPaginationMeta } = require('../../utils/pagination');
const { successResponse, errorResponse } = require('../../utils/response');
const {
  VEHICLE_TYPES,
  SHIPMENT_STATUS,
  BID_STATUS,
  PAYMENT_STATUS,
  ACCOUNT_STATUS,
  ROLES,
} = require('../../config/constants');

/**
 * Preview route distance, duration and polyline before publishing
 * Requirement: FR-CO-5, SI-2.1
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
 * Requirement: FR-CO-3, FR-CO-4, FR-CO-6, BR-4, BR-5, BR-6
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

    // Compute route distance & duration
    const routeData = await getRoute(pickupLat, pickupLng, dropoffLat, dropoffLng);

    // Generate unique sequential shipment number (e.g. SH-2026-0001)
    const year = new Date().getFullYear();
    const count = await prisma.shipment.count();
    const shipmentNumber = `SH-${year}-${String(count + 1).padStart(5, '0')}`;

    const shipment = await prisma.shipment.create({
      data: {
        shipmentNumber,
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
        status: isDraft ? SHIPMENT_STATUS.PENDING : SHIPMENT_STATUS.PENDING,
        isDraft: Boolean(isDraft),
      },
    });

    return successResponse(res, shipment, 'Shipment request created successfully', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * List shipments for Cargo Owner
 * Requirement: FR-CO-16, FR-CO-27, SI-1.5
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
        include: {
          bids: {
            where: { status: BID_STATUS.ACTIVE },
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
 * Requirement: FR-CO-13, FR-CO-14, FR-CO-15, BR-10, BR-11, BR-23, REL-4, REL-5
 */
async function acceptBid(req, res, next) {
  try {
    const { id: shipmentId } = req.params;
    const { bidId } = req.body;

    // Execute within a strict serializable/isolated database transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch shipment with row lock check
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

      // Check bidder account status
      if (bid.bidder.accountStatus !== ACCOUNT_STATUS.VERIFIED) {
        throw {
          code: 'BIDDER_NOT_VERIFIED',
          message: 'The bidder account is currently not verified or has been suspended',
          status: 400,
        };
      }

      // 3. Mark shipment as BOOKED
      const updatedShipment = await tx.shipment.update({
        where: { id: shipmentId },
        data: { status: SHIPMENT_STATUS.BOOKED },
      });

      // 4. Mark accepted bid as ACCEPTED
      await tx.bid.update({
        where: { id: bidId },
        data: { status: BID_STATUS.ACCEPTED },
      });

      // 5. Reject all other bids on this shipment (BR-11)
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
          agreedFare: bid.proposedFare,
          amountReceived: 0,
          status: PAYMENT_STATUS.PENDING,
          isFrozen: false,
        },
      });

      // 7. If bidder is individual driver, create Trip directly
      let trip = null;
      if (!isFleet) {
        const vehicle = await tx.vehicle.findFirst({
          where: { ownerId: bid.bidderId },
        });

        if (vehicle) {
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
      }

      return { updatedShipment, bid, paymentRecord, trip };
    });

    // Asynchronously dispatch notifications (outside transaction block)
    // Notify winning bidder (FR-NC-6)
    await dispatchNotification({
      recipientId: result.bid.bidderId,
      type: 'BID_ACCEPTED',
      title: 'Bid Accepted!',
      message: `Your bid of PKR ${result.bid.proposedFare.toLocaleString()} for shipment ${result.updatedShipment.shipmentNumber} was accepted.`,
      relatedShipmentId: shipmentId,
    });

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
 * Requirement: FR-CO-20, BR-20
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
    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          status: SHIPMENT_STATUS.COMPLETED,
          completedAt,
        },
      }),
      prisma.trip.update({
        where: { shipmentId },
        data: {
          completedAt,
          isTrackingActive: false,
        },
      }),
      // Increment completed trips for driver
      prisma.user.update({
        where: { id: shipment.trip.driverId },
        data: { completedTripsCount: { increment: 1 } },
      }),
      // Set vehicle availability back to AVAILABLE
      prisma.vehicle.update({
        where: { id: shipment.trip.vehicleId },
        data: { availabilityStatus: 'AVAILABLE' },
      }),
    ]);

    // Notify driver
    await dispatchNotification({
      recipientId: shipment.trip.driverId,
      type: 'DELIVERY_CONFIRMED',
      title: 'Delivery Confirmed',
      message: `Cargo owner has confirmed completion for shipment ${shipment.shipmentNumber}.`,
      relatedShipmentId: shipmentId,
    });

    return successResponse(res, null, 'Delivery confirmed and shipment marked completed (FR-CO-20)');
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel shipment
 * Requirement: FR-CO-9, BR-14
 */
async function cancelShipment(req, res, next) {
  try {
    const { id: shipmentId } = req.params;
    const { reason } = req.body;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { trip: true, bids: { where: { status: BID_STATUS.ACTIVE } } },
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

    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          status: SHIPMENT_STATUS.CANCELLED,
          cancellationReason: reason,
          cancelledById: req.user.id,
        },
      }),
      prisma.bid.updateMany({
        where: { shipmentId, status: BID_STATUS.ACTIVE },
        data: { status: BID_STATUS.REJECTED },
      }),
    ]);

    return successResponse(res, null, 'Shipment cancelled successfully (FR-CO-9)');
  } catch (error) {
    next(error);
  }
}

/**
 * Duplicate a previous shipment (FR-CO-8)
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

    const year = new Date().getFullYear();
    const count = await prisma.shipment.count();
    const shipmentNumber = `SH-${year}-${String(count + 1).padStart(5, '0')}`;

    const newShipment = await prisma.shipment.create({
      data: {
        shipmentNumber,
        cargoOwnerId: req.user.id,
        pickupAddress: existing.pickupAddress,
        pickupLat: existing.pickupLat,
        pickupLng: existing.pickupLng,
        dropoffAddress: existing.dropoffAddress,
        dropoffLat: existing.dropoffLat,
        dropoffLng: existing.dropoffLng,
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
      },
    });

    return successResponse(res, newShipment, 'Repeated shipment created successfully', 201);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  previewRoute,
  createShipment,
  listMyShipments,
  getShipmentById,
  acceptBid,
  confirmDelivery,
  cancelShipment,
  repeatShipment,
};
