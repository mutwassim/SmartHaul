const prisma = require('../../config/db');
const { encrypt, hashDeterministic, decrypt } = require('../../services/encryption.service');
const { dispatchNotification } = require('../../services/fcm.service');
const { successResponse, errorResponse } = require('../../utils/response');
const { computeEmptyRunning, EMPTY_RUNNING_BASIS } = require('../../services/emptyRunning.service');
const {
  ACCOUNT_STATUS,
  SHIPMENT_STATUS,
  ROLES,
  VEHICLE_TYPES,
} = require('../../config/constants');

const ACTIVE_TRIP_STATUSES = [
  SHIPMENT_STATUS.BOOKED,
  SHIPMENT_STATUS.REACHED_PICKUP,
  SHIPMENT_STATUS.CARGO_LOADED,
  SHIPMENT_STATUS.IN_TRANSIT,
  SHIPMENT_STATUS.REACHED_DESTINATION,
];

/** True when the driver belongs to this fleet and has accepted the invitation (C-10) */
async function isActiveFleetDriver(fleetOwnerId, driverId) {
  const link = await prisma.driverFleetLink.findFirst({ where: { fleetOwnerId, driverId, status: 'ACTIVE' } });
  return !!link;
}

function publicVehicle(v) {
  const { registrationNumberEncrypted, registrationNumberIv, registrationNumberTag, registrationNumberHash, ...rest } = v;
  return rest;
}

/**
 * List vehicles in fleet
 * Requirement: FR-FO-3, FR-FO-5
 */
async function listVehicles(req, res, next) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { ownerId: req.user.id },
      include: {
        defaultDriver: {
          select: { id: true, name: true, phone: true, accountStatus: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const transformed = vehicles.map((v) => ({
      id: v.id,
      registrationNumber: decrypt(v.registrationNumberEncrypted, v.registrationNumberIv, v.registrationNumberTag),
      vehicleType: v.vehicleType,
      ratedCapacity: v.ratedCapacity,
      model: v.model,
      year: v.year,
      availabilityStatus: v.availabilityStatus,
      defaultDriver: v.defaultDriver,
      createdAt: v.createdAt,
    }));

    return successResponse(res, transformed, 'Fleet vehicles retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Register a new vehicle to fleet
 * Requirement: FR-FO-3, FR-FO-3, BR-30, SEC-7, CON-12
 */
async function addVehicle(req, res, next) {
  try {
    const { registrationNumber, vehicleType, ratedCapacity, model, year, defaultDriverId } = req.body;

    // Capacity must fall in the range of the chosen body type (Table C-1)
    const range = VEHICLE_TYPES[vehicleType];
    if (!range || ratedCapacity < range.minCapacity || ratedCapacity > range.maxCapacity) {
      return errorResponse(
        res,
        'CAPACITY_OUT_OF_RANGE',
        `A ${vehicleType} carries ${range ? `${range.minCapacity} to ${range.maxCapacity}` : 'a set range of'} tonnes. ${ratedCapacity} is outside that range.`,
        422
      );
    }

    if (defaultDriverId && !(await isActiveFleetDriver(req.user.id, defaultDriverId))) {
      return errorResponse(res, 'DRIVER_NOT_IN_FLEET', 'The default driver must be a driver in your fleet who has accepted your invitation.', 422);
    }

    const registrationNumberHash = hashDeterministic(registrationNumber);

    // 1. Prevent duplicate vehicle registration numbers platform-wide (BR-30, FR-FO-3)
    const existing = await prisma.vehicle.findUnique({
      where: { registrationNumberHash },
    });

    if (existing) {
      return errorResponse(
        res,
        'DUPLICATE_VEHICLE_REGISTRATION',
        'A vehicle with this registration number is already registered on the platform (BR-30).',
        409
      );
    }

    // 2. Encrypt registration number (SEC-7, CON-12)
    const enc = encrypt(registrationNumber);

    const vehicle = await prisma.vehicle.create({
      data: {
        ownerId: req.user.id,
        registrationNumberEncrypted: enc.encryptedData,
        registrationNumberIv: enc.iv,
        registrationNumberTag: enc.authTag,
        registrationNumberHash,
        vehicleType,
        ratedCapacity,
        model,
        year,
        defaultDriverId: defaultDriverId || null,
        availabilityStatus: 'AVAILABLE',
      },
    });

    return successResponse(
      res,
      {
        id: vehicle.id,
        registrationNumber,
        vehicleType: vehicle.vehicleType,
        ratedCapacity: vehicle.ratedCapacity,
        model: vehicle.model,
        year: vehicle.year,
        availabilityStatus: vehicle.availabilityStatus,
      },
      'Vehicle registered successfully',
      201
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Update vehicle record
 * Requirement: FR-FO-4, FR-FO-5
 */
async function updateVehicle(req, res, next) {
  try {
    const { id } = req.params;
    const { model, year, availabilityStatus, defaultDriverId } = req.body;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id, ownerId: req.user.id },
    });

    if (!vehicle) {
      return errorResponse(res, 'VEHICLE_NOT_FOUND', 'Vehicle not found or unauthorized', 404);
    }

    // Availability is managed by the booking flow. The owner can only take a vehicle out of service or back (C-41).
    if (availabilityStatus !== undefined) {
      if (availabilityStatus === 'ASSIGNED') {
        return errorResponse(res, 'AVAILABILITY_NOT_SETTABLE', 'A vehicle becomes Assigned by being booked, not by hand.', 422);
      }
      if (vehicle.availabilityStatus === 'ASSIGNED') {
        return errorResponse(res, 'VEHICLE_ASSIGNED', 'This vehicle is assigned to a shipment. Its availability changes when the trip ends.', 409);
      }
    }

    if (defaultDriverId && !(await isActiveFleetDriver(req.user.id, defaultDriverId))) {
      return errorResponse(res, 'DRIVER_NOT_IN_FLEET', 'The default driver must be a driver in your fleet who has accepted your invitation.', 422);
    }

    // Conditional on the availability that was read, so a booking that lands meanwhile is not overwritten
    const result = await prisma.vehicle.updateMany({
      where: { id, ownerId: req.user.id, availabilityStatus: vehicle.availabilityStatus },
      data: {
        ...(model ? { model } : {}),
        ...(year ? { year } : {}),
        ...(availabilityStatus ? { availabilityStatus } : {}),
        ...(defaultDriverId !== undefined ? { defaultDriverId } : {}),
      },
    });

    if (result.count !== 1) {
      return errorResponse(res, 'VEHICLE_CHANGED', 'The vehicle changed while you were editing it. Reload and try again.', 409);
    }

    const updated = await prisma.vehicle.findUnique({ where: { id } });
    return successResponse(res, publicVehicle(updated), 'Vehicle updated successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Remove vehicle. One that has never carried or bid is deleted; one with history is made Inactive,
 * because the trips and bids that reference it must stay readable (C-41).
 * Requirement: FR-FO-4, BR-31
 */
async function deleteVehicle(req, res, next) {
  try {
    const { id } = req.params;

    const vehicle = await prisma.vehicle.findFirst({ where: { id, ownerId: req.user.id } });
    if (!vehicle) {
      return errorResponse(res, 'VEHICLE_NOT_FOUND', 'Vehicle not found or unauthorized', 404);
    }

    const activeTrip = await prisma.trip.findFirst({
      where: { vehicleId: id, shipment: { status: { in: ACTIVE_TRIP_STATUSES } } },
    });

    if (activeTrip || vehicle.availabilityStatus === 'ASSIGNED') {
      return errorResponse(
        res,
        'CANNOT_DELETE_ACTIVE_VEHICLE',
        'Cannot remove vehicle while it is assigned to an active shipment trip (BR-31).',
        400
      );
    }

    const [trips, bids] = await Promise.all([
      prisma.trip.count({ where: { vehicleId: id } }),
      prisma.bid.count({ where: { vehicleId: id } }),
    ]);

    if (trips > 0 || bids > 0) {
      await prisma.vehicle.updateMany({
        where: { id, ownerId: req.user.id },
        data: { availabilityStatus: 'INACTIVE', defaultDriverId: null },
      });
      return successResponse(
        res,
        { deactivated: true },
        'This vehicle has trip or bid history, so it was made Inactive instead of deleted.'
      );
    }

    await prisma.vehicle.deleteMany({ where: { id, ownerId: req.user.id } });

    return successResponse(res, { deactivated: false }, 'Vehicle removed successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * List employed drivers under fleet
 * Requirement: FR-FO-6, FR-FO-8
 */
async function listDrivers(req, res, next) {
  try {
    const links = await prisma.driverFleetLink.findMany({
      where: { fleetOwnerId: req.user.id },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            accountStatus: true,
            avgRating: true,
            completedTripsCount: true,
            driverVehicle: true,
          },
        },
      },
    });

    // linkStatus tells an accepted driver from one who has only been invited (C-10)
    const drivers = links.map((l) => ({ ...l.driver, linkStatus: l.status }));
    return successResponse(res, drivers, 'Fleet drivers retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * List available verified drivers not yet linked to any fleet
 * Requirement: FR-FO-6
 * Only what is needed to choose someone to invite: contact details are not shared (C-10).
 */
async function listAvailableDrivers(req, res, next) {
  try {
    const linkedDriverIds = (
      await prisma.driverFleetLink.findMany({
        select: { driverId: true },
      })
    ).map((l) => l.driverId);

    const availableDrivers = await prisma.user.findMany({
      where: {
        role: ROLES.DRIVER,
        accountStatus: ACCOUNT_STATUS.VERIFIED,
        id: { notIn: linkedDriverIds },
      },
      select: {
        id: true,
        name: true,
        avgRating: true,
        completedTripsCount: true,
      },
      take: 50,
    });

    return successResponse(res, availableDrivers, 'Available unlinked drivers retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Invite a driver to the fleet. The driver joins only by accepting (C-10).
 * Requirement: FR-FO-6
 */
async function linkDriver(req, res, next) {
  try {
    const { driverId, phone } = req.body;

    let driver = null;
    if (driverId) {
      driver = await prisma.user.findFirst({
        where: { id: driverId, role: ROLES.DRIVER },
      });
    } else if (phone) {
      driver = await prisma.user.findFirst({
        where: { phone, role: ROLES.DRIVER },
      });
    }

    if (!driver) {
      return errorResponse(res, 'DRIVER_NOT_FOUND', 'Driver not found with provided ID or phone number', 404);
    }

    if (driver.accountStatus !== ACCOUNT_STATUS.VERIFIED) {
      return errorResponse(res, 'DRIVER_NOT_VERIFIED', 'Only a verified driver can be invited to a fleet (BR-13).', 422);
    }

    const existingLink = await prisma.driverFleetLink.findUnique({
      where: { driverId: driver.id },
    });

    if (existingLink) {
      if (existingLink.fleetOwnerId === req.user.id && existingLink.status === 'INVITED') {
        return errorResponse(res, 'INVITATION_PENDING', 'This driver has already been invited and has not answered yet.', 409);
      }
      return errorResponse(res, 'DRIVER_ALREADY_LINKED', 'Driver is already linked to a fleet or has an invitation pending', 409);
    }

    try {
      await prisma.driverFleetLink.create({
        data: {
          fleetOwnerId: req.user.id,
          driverId: driver.id,
          status: 'INVITED',
        },
      });
    } catch (e) {
      // Two fleets inviting the same driver at once: the unique index lets one through
      if (e && e.code === 'P2002') {
        return errorResponse(res, 'DRIVER_ALREADY_LINKED', 'Driver is already linked to a fleet or has an invitation pending', 409);
      }
      throw e;
    }

    await dispatchNotification({
      recipientId: driver.id,
      type: 'FLEET_INVITATION',
      title: 'Fleet invitation',
      message: `${req.user.name} has invited you to join their fleet. Open the app to accept or decline.`,
    });

    return successResponse(
      res,
      { driverId: driver.id, name: driver.name, status: 'INVITED' },
      'Invitation sent. The driver joins the fleet once they accept.',
      201
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Unlink driver from fleet
 * Requirement: FR-FO-7
 */
async function unlinkDriver(req, res, next) {
  try {
    const { id } = req.params;

    const link = await prisma.driverFleetLink.findFirst({
      where: {
        driverId: id,
        fleetOwnerId: req.user.id,
      },
    });

    if (!link) {
      return errorResponse(res, 'LINK_NOT_FOUND', 'Driver is not linked to your fleet', 404);
    }

    // Check if driver is on an active trip for this fleet
    const activeTrip = await prisma.trip.findFirst({
      where: {
        driverId: id,
        fleetOwnerId: req.user.id,
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
    });

    if (activeTrip) {
      return errorResponse(
        res,
        'CANNOT_UNLINK_ACTIVE_DRIVER',
        'Cannot unlink driver while they are assigned to an active trip.',
        400
      );
    }

    await prisma.driverFleetLink.delete({
      where: { id: link.id },
    });

    return successResponse(res, null, 'Driver unlinked from fleet successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Shipments this fleet has won and still has to resource
 * Requirement: FR-FO-11
 */
async function listBookedShipments(req, res, next) {
  try {
    const shipments = await prisma.shipment.findMany({
      where: {
        status: SHIPMENT_STATUS.BOOKED,
        bids: { some: { bidderId: req.user.id, status: 'ACCEPTED' } },
      },
      omit: { routePolyline: true },
      include: {
        bids: { where: { bidderId: req.user.id, status: 'ACCEPTED' }, select: { id: true, proposedFare: true, vehicleId: true } },
        trip: { select: { id: true, driverId: true, vehicleId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return successResponse(res, shipments, 'Booked shipments retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Assign specific Driver + Vehicle to booked shipment
 * Requirement: FR-FO-11, FR-FO-11, BR-12, BR-13, BR-4
 */
async function assignTripResources(req, res, next) {
  try {
    const { shipmentId, vehicleId, driverId } = req.body;

    // 1. Fetch shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { bids: { where: { bidderId: req.user.id, status: 'ACCEPTED' } }, trip: true },
    });

    if (!shipment || shipment.status !== SHIPMENT_STATUS.BOOKED) {
      return errorResponse(res, 'INVALID_SHIPMENT_STATUS', 'Shipment must be in BOOKED status to assign resources', 400);
    }

    if (shipment.bids.length === 0) {
      return errorResponse(res, 'UNAUTHORIZED_ASSIGNMENT', 'Your fleet did not win the booking for this shipment', 403);
    }

    const existingTrip = shipment.trip || null;

    // 2. Validate Vehicle (a vehicle already on this same trip may be confirmed again)
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, ownerId: req.user.id },
    });

    const sameVehicle = existingTrip && existingTrip.vehicleId === vehicleId;
    if (!vehicle || (vehicle.availabilityStatus !== 'AVAILABLE' && !sameVehicle)) {
      return errorResponse(res, 'VEHICLE_UNAVAILABLE', 'Vehicle is unavailable or under maintenance (BR-12)', 400);
    }

    if (vehicle.ratedCapacity < shipment.cargoWeight) {
      return errorResponse(
        res,
        'VEHICLE_CAPACITY_INSUFFICIENT',
        `Vehicle capacity (${vehicle.ratedCapacity}t) cannot carry cargo weight (${shipment.cargoWeight}t) (BR-4).`,
        400
      );
    }

    // 3. Validate Driver: verified, and one of this fleet's own accepted drivers (C-10, BR-13)
    const driver = await prisma.user.findFirst({
      where: { id: driverId, role: ROLES.DRIVER },
    });

    if (!driver || driver.accountStatus !== ACCOUNT_STATUS.VERIFIED) {
      return errorResponse(res, 'DRIVER_NOT_VERIFIED', 'Selected driver is not verified or is suspended (BR-13).', 400);
    }

    if (!(await isActiveFleetDriver(req.user.id, driverId))) {
      return errorResponse(
        res,
        'DRIVER_NOT_IN_FLEET',
        'You can assign only drivers who are in your fleet and have accepted your invitation.',
        403
      );
    }

    // 4. No overlapping work: a driver holds one live trip at a time (FR-FO-11)
    const driverBusy = await prisma.trip.findFirst({
      where: {
        driverId,
        shipmentId: { not: shipmentId },
        shipment: { status: { in: ACTIVE_TRIP_STATUSES } },
      },
      select: { id: true },
    });

    if (driverBusy) {
      return errorResponse(
        res,
        'DRIVER_BUSY',
        'This driver is already on another booked or active trip. Choose another driver (FR-FO-11).',
        409
      );
    }

    const acceptedBid = shipment.bids[0];

    const trip = await prisma.$transaction(async (tx) => {
      // Reserve the vehicle first. Conditional, so two bookings cannot take the same vehicle.
      if (!sameVehicle) {
        const reserved = await tx.vehicle.updateMany({
          where: { id: vehicleId, ownerId: req.user.id, availabilityStatus: 'AVAILABLE' },
          data: { availabilityStatus: 'ASSIGNED' },
        });
        if (reserved.count !== 1) return null;

        // Changing vehicle on an existing trip frees the one it had
        if (existingTrip && existingTrip.vehicleId) {
          await tx.vehicle.updateMany({
            where: { id: existingTrip.vehicleId, availabilityStatus: 'ASSIGNED' },
            data: { availabilityStatus: 'AVAILABLE' },
          });
        }
      }

      // The payment record is left alone: the fleet owner stays the payee, the driver only performs the trip (C-09)
      const saved = await tx.trip.upsert({
        where: { shipmentId },
        update: { driverId, vehicleId, fleetOwnerId: req.user.id },
        create: {
          shipmentId,
          driverId,
          vehicleId,
          fleetOwnerId: req.user.id,
          agreedFare: acceptedBid.proposedFare,
        },
      });

      await tx.tripStatusLog.create({
        data: {
          tripId: saved.id,
          status: SHIPMENT_STATUS.BOOKED,
          changedById: req.user.id,
          timestamp: new Date(),
          note: `Fleet assigned Driver ${driver.name} and Vehicle ${vehicle.model}`,
        },
      });

      return saved;
    });

    if (!trip) {
      return errorResponse(res, 'VEHICLE_UNAVAILABLE', 'Vehicle was taken by another booking a moment ago (BR-12).', 409);
    }

    // Notify Driver
    await dispatchNotification({
      recipientId: driverId,
      type: 'TRIP_STATUS_CHANGED',
      title: 'New Trip Assigned',
      message: `You have been assigned to trip for shipment ${shipment.shipmentNumber}.`,
      relatedShipmentId: shipmentId,
    });

    return successResponse(res, trip, 'Driver and vehicle assigned to shipment successfully (FR-FO-11)');
  } catch (error) {
    next(error);
  }
}

/**
 * Fleet multi-vehicle live tracking map
 * Requirement: FR-FO-12
 */
async function getFleetLiveMap(req, res, next) {
  try {
    const activeTrips = await prisma.trip.findMany({
      where: {
        fleetOwnerId: req.user.id,
        shipment: {
          status: {
            in: [
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
          select: {
            id: true,
            shipmentNumber: true,
            status: true,
            pickupAddress: true,
            dropoffAddress: true,
          },
        },
        driver: { select: { id: true, name: true, phone: true } },
        vehicle: true,
        positions: {
          take: 1,
          orderBy: { recordedAt: 'desc' },
        },
      },
    });

    const liveData = activeTrips.map((t) => ({
      tripId: t.id,
      shipment: t.shipment,
      driver: t.driver,
      vehicle: {
        id: t.vehicle.id,
        model: t.vehicle.model,
        type: t.vehicle.vehicleType,
      },
      lastKnownPosition: t.positions.length > 0 ? t.positions[0] : null,
      isInterrupted: t.isInterrupted,
    }));

    return successResponse(res, liveData, 'Fleet live map data retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Driver performance records
 * Requirement: FR-FO-15
 */
async function getDriverPerformance(req, res, next) {
  try {
    const links = await prisma.driverFleetLink.findMany({
      where: { fleetOwnerId: req.user.id },
      include: {
        driver: {
          include: {
            driverTrips: {
              where: { shipment: { status: SHIPMENT_STATUS.COMPLETED } },
            },
            complaintsAgainst: true,
          },
        },
      },
    });

    const performance = links.map((l) => ({
      driverId: l.driver.id,
      name: l.driver.name,
      completedTrips: l.driver.completedTripsCount,
      avgRating: l.driver.avgRating,
      totalRatings: l.driver.totalRatings,
      complaintsCount: l.driver.complaintsAgainst.length,
    }));

    return successResponse(res, performance, 'Driver performance records retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Vehicle utilization report (Loaded vs Empty distance)
 * Requirement: FR-FO-16, FR-AR-6
 */
async function getVehicleUtilization(req, res, next) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { ownerId: req.user.id },
      include: {
        trips: {
          where: { shipment: { status: SHIPMENT_STATUS.COMPLETED } },
          include: { shipment: true },
        },
      },
    });

    const utilization = vehicles.map((v) => {
      const result = computeEmptyRunning(v.trips);
      return {
        vehicleId: v.id,
        model: v.model,
        vehicleType: v.vehicleType,
        completedTripsCount: result.tripCount,
        loadedDistanceKm: result.loadedDistanceKm,
        estimatedTotalDistanceKm: result.totalDistanceKm,
        emptyRunningPercentage: result.emptyRunningPercentage,
        measuredLegs: result.measuredLegs,
        basis: EMPTY_RUNNING_BASIS,
      };
    });

    return successResponse(res, utilization, 'Vehicle utilization report retrieved');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listVehicles,
  addVehicle,
  updateVehicle,
  deleteVehicle,
  listDrivers,
  listAvailableDrivers,
  linkDriver,
  unlinkDriver,
  assignTripResources,
  listBookedShipments,
  getFleetLiveMap,
  getDriverPerformance,
  getVehicleUtilization,
};
