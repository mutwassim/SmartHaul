const prisma = require('../../config/db');
const { encrypt, hashDeterministic, decrypt } = require('../../services/encryption.service');
const { dispatchNotification } = require('../../services/fcm.service');
const { successResponse, errorResponse } = require('../../utils/response');
const {
  ACCOUNT_STATUS,
  SHIPMENT_STATUS,
  ROLES,
} = require('../../config/constants');

/**
 * List vehicles in fleet
 * Requirement: FR-FO-3, FR-FO-6
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
 * Requirement: FR-FO-3, FR-FO-4, BR-30, SEC-7, CON-12
 */
async function addVehicle(req, res, next) {
  try {
    const { registrationNumber, vehicleType, ratedCapacity, model, year, defaultDriverId } = req.body;

    const registrationNumberHash = hashDeterministic(registrationNumber);

    // 1. Prevent duplicate vehicle registration numbers platform-wide (BR-30, FR-FO-4)
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
 * Requirement: FR-FO-5, FR-FO-6
 */
async function updateVehicle(req, res, next) {
  try {
    const { id } = req.params;
    const { model, year, availabilityStatus, defaultDriverId } = req.body;

    const vehicle = await prisma.vehicle.findUnique({
      where: { id, ownerId: req.user.id },
    });

    if (!vehicle) {
      return errorResponse(res, 'VEHICLE_NOT_FOUND', 'Vehicle not found or unauthorized', 404);
    }

    const updated = await prisma.vehicle.update({
      where: { id },
      data: {
        ...(model ? { model } : {}),
        ...(year ? { year } : {}),
        ...(availabilityStatus ? { availabilityStatus } : {}),
        ...(defaultDriverId !== undefined ? { defaultDriverId } : {}),
      },
    });

    return successResponse(res, updated, 'Vehicle updated successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Remove vehicle (blocks deletion if currently assigned to an active trip)
 * Requirement: FR-FO-5, BR-31
 */
async function deleteVehicle(req, res, next) {
  try {
    const { id } = req.params;

    const activeTrip = await prisma.trip.findFirst({
      where: {
        vehicleId: id,
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
        'CANNOT_DELETE_ACTIVE_VEHICLE',
        'Cannot remove vehicle while it is assigned to an active shipment trip (BR-31).',
        400
      );
    }

    await prisma.vehicle.delete({
      where: { id, ownerId: req.user.id },
    });

    return successResponse(res, null, 'Vehicle removed successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * List employed drivers under fleet
 * Requirement: FR-FO-7, FR-FO-9
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

    const drivers = links.map((l) => l.driver);
    return successResponse(res, drivers, 'Fleet drivers retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * List available verified drivers not yet linked to any fleet
 * Requirement: FR-FO-7
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
        phone: true,
        email: true,
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
 * Add / link driver to fleet
 * Requirement: FR-FO-7
 */
async function linkDriver(req, res, next) {
  try {
    const { driverId, phone } = req.body;

    let driver = null;
    if (driverId) {
      driver = await prisma.user.findUnique({
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

    const existingLink = await prisma.driverFleetLink.findUnique({
      where: { driverId: driver.id },
    });

    if (existingLink) {
      return errorResponse(res, 'DRIVER_ALREADY_LINKED', 'Driver is already linked to a fleet', 409);
    }

    await prisma.driverFleetLink.create({
      data: {
        fleetOwnerId: req.user.id,
        driverId: driver.id,
      },
    });

    return successResponse(res, { driverId: driver.id, name: driver.name }, 'Driver linked to fleet successfully', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Unlink driver from fleet
 * Requirement: FR-FO-8
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
 * Assign specific Driver + Vehicle to booked shipment
 * Requirement: FR-FO-13, FR-FO-14, BR-12, BR-13, BR-4
 */
async function assignTripResources(req, res, next) {
  try {
    const { shipmentId, vehicleId, driverId } = req.body;

    // 1. Fetch shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { bids: { where: { bidderId: req.user.id, status: 'ACCEPTED' } } },
    });

    if (!shipment || shipment.status !== SHIPMENT_STATUS.BOOKED) {
      return errorResponse(res, 'INVALID_SHIPMENT_STATUS', 'Shipment must be in BOOKED status to assign resources', 400);
    }

    if (shipment.bids.length === 0) {
      return errorResponse(res, 'UNAUTHORIZED_ASSIGNMENT', 'Your fleet did not win the booking for this shipment', 403);
    }

    // 2. Validate Vehicle
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId, ownerId: req.user.id },
    });

    if (!vehicle || vehicle.availabilityStatus !== 'AVAILABLE') {
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

    // 3. Validate Driver
    const driver = await prisma.user.findUnique({
      where: { id: driverId, role: ROLES.DRIVER },
    });

    if (!driver || driver.accountStatus !== ACCOUNT_STATUS.VERIFIED) {
      return errorResponse(res, 'DRIVER_NOT_VERIFIED', 'Selected driver is not verified or is suspended (BR-13)', 400);
    }

    // 4. Create or update Trip record
    const acceptedBid = shipment.bids[0];
    const trip = await prisma.trip.upsert({
      where: { shipmentId },
      update: {
        driverId,
        vehicleId,
        fleetOwnerId: req.user.id,
      },
      create: {
        shipmentId,
        driverId,
        vehicleId,
        fleetOwnerId: req.user.id,
        agreedFare: acceptedBid.proposedFare,
      },
    });

    // Update vehicle availability to ASSIGNED
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { availabilityStatus: 'ASSIGNED' },
    });

    // Update PaymentRecord driver reference
    await prisma.paymentRecord.update({
      where: { shipmentId },
      data: { driverId, fleetOwnerId: req.user.id },
    });

    // Create trip log
    await prisma.tripStatusLog.create({
      data: {
        tripId: trip.id,
        status: SHIPMENT_STATUS.BOOKED,
        changedById: req.user.id,
        timestamp: new Date(),
        note: `Fleet assigned Driver ${driver.name} and Vehicle ${vehicle.model}`,
      },
    });

    // Notify Driver
    await dispatchNotification({
      recipientId: driverId,
      type: 'TRIP_STATUS_CHANGED',
      title: 'New Trip Assigned',
      message: `You have been assigned to trip for shipment ${shipment.shipmentNumber}.`,
      relatedShipmentId: shipmentId,
    });

    return successResponse(res, trip, 'Driver and vehicle assigned to shipment successfully (FR-FO-13)');
  } catch (error) {
    next(error);
  }
}

/**
 * Fleet multi-vehicle live tracking map
 * Requirement: FR-FO-15
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
 * Requirement: FR-FO-18
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
 * Requirement: FR-FO-19, FR-AR-7
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
      let totalLoadedKm = 0;
      v.trips.forEach((t) => {
        totalLoadedKm += t.shipment.distanceKm || 0;
      });

      // Estimated total km including return legs (~1.3x)
      const estimatedTotalKm = totalLoadedKm * 1.3;
      const emptyKm = estimatedTotalKm - totalLoadedKm;
      const emptyRatio = estimatedTotalKm > 0 ? Math.round((emptyKm / estimatedTotalKm) * 100) : 0;

      return {
        vehicleId: v.id,
        model: v.model,
        vehicleType: v.vehicleType,
        completedTripsCount: v.trips.length,
        loadedDistanceKm: Math.round(totalLoadedKm),
        estimatedTotalDistanceKm: Math.round(estimatedTotalKm),
        emptyRunningPercentage: emptyRatio,
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
  getFleetLiveMap,
  getDriverPerformance,
  getVehicleUtilization,
};
