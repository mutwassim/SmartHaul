const prisma = require('../../config/db');
const { calculateHaversineDistance } = require('../../services/osrm.service');
const {
  VEHICLE_TYPES,
  ACCOUNT_STATUS,
  LIMITS,
  ROLES,
} = require('../../config/constants');
const logger = require('../../utils/logger');

/**
 * Checks vehicle body type vs cargo type compatibility
 * Requirement: BR-5, Table C-5
 */
function isCargoCompatibleWithVehicle(vehicleType, cargoType) {
  const spec = VEHICLE_TYPES[vehicleType];
  if (!spec) return false;

  const normalizedCargo = cargoType.toUpperCase().replace(/\s+/g, '_');
  
  // Check if cargo matches any compatible cargo categories
  return spec.compatibleCargos.some(
    (c) => normalizedCargo.includes(c) || c.includes(normalizedCargo) || c === 'GENERAL_GOODS'
  );
}

/**
 * Computes recommendations for a shipment
 * Requirement: MOD-5, FR-RM-1 to FR-RM-15
 */
async function computeRecommendationsForShipment(shipmentId) {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment || shipment.status !== 'PENDING') {
      return [];
    }

    // 1. Fetch all verified and available vehicles (BR-32)
    const candidates = await prisma.vehicle.findMany({
      where: {
        availabilityStatus: 'AVAILABLE',
        owner: {
          accountStatus: ACCOUNT_STATUS.VERIFIED,
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            role: true,
            name: true,
            phone: true,
            avgRating: true,
            completedTripsCount: true,
            serviceArea: true,
          },
        },
        defaultDriver: {
          select: {
            id: true,
            name: true,
            phone: true,
            avgRating: true,
            accountStatus: true,
          },
        },
      },
    });

    const recommendations = [];

    for (const vehicle of candidates) {
      const reasons = [];

      // Physical capacity filter (BR-4)
      if (vehicle.ratedCapacity < shipment.cargoWeight) {
        continue;
      }
      reasons.push(`Rated capacity (${vehicle.ratedCapacity}t) satisfies cargo weight (${shipment.cargoWeight}t)`);

      // Vehicle type match or compatible body type (BR-5)
      const isExactType = vehicle.vehicleType === shipment.requiredVehicleType;
      const isCompatible = isCargoCompatibleWithVehicle(vehicle.vehicleType, shipment.cargoType);

      if (!isExactType && !isCompatible) {
        continue;
      }
      if (isExactType) reasons.push('Exact vehicle type match');

      // Service area corridor check (FR-RM-5)
      if (vehicle.owner.serviceArea && vehicle.owner.serviceArea.length > 0) {
        const matchesArea = vehicle.owner.serviceArea.some(
          (area) =>
            shipment.pickupAddress.toLowerCase().includes(area.toLowerCase()) ||
            shipment.dropoffAddress.toLowerCase().includes(area.toLowerCase())
        );
        if (!matchesArea) {
          continue;
        }
        reasons.push('Service area covers shipment corridor');
      }

      // Check for return-load opportunity (FR-RM-10, FR-RM-11)
      let isReturnLoad = false;
      const recentTrip = await prisma.trip.findFirst({
        where: {
          vehicleId: vehicle.id,
          shipment: { status: { in: ['IN_TRANSIT', 'REACHED_DESTINATION', 'COMPLETED'] } },
        },
        include: { shipment: true },
        orderBy: { updatedAt: 'desc' },
      });

      if (recentTrip && recentTrip.shipment) {
        const destDist = calculateHaversineDistance(
          recentTrip.shipment.dropoffLat,
          recentTrip.shipment.dropoffLng,
          shipment.pickupLat,
          shipment.pickupLng
        );

        if (destDist.distanceKm <= LIMITS.RETURN_LOAD_RADIUS_KM) {
          isReturnLoad = true;
          reasons.push(`Return-load match: completing previous delivery within ${destDist.distanceKm}km`);
        }
      }

      // Calculate composite heuristic ranking score (FR-RM-8)
      // High rating + more trips + return load bonus
      const ratingWeight = (vehicle.owner.avgRating || 4.0) * 20; // 0 to 100
      const tripsWeight = Math.min(vehicle.owner.completedTripsCount * 2, 40); // 0 to 40
      const returnLoadBonus = isReturnLoad ? 50 : 0;
      const exactTypeBonus = isExactType ? 30 : 10;

      const totalScore = ratingWeight + tripsWeight + returnLoadBonus + exactTypeBonus;

      recommendations.push({
        candidateId: vehicle.owner.id,
        vehicleId: vehicle.id,
        vehicleType: vehicle.vehicleType,
        ratedCapacity: vehicle.ratedCapacity,
        owner: vehicle.owner,
        matchScore: totalScore,
        matchReasons: reasons,
        isReturnLoad,
        isSharedLoad: false,
      });
    }

    // Sort descending by score (FR-RM-8)
    recommendations.sort((a, b) => b.matchScore - a.matchScore);

    // Persist recommendation results for audit & inspection (FR-RM-15)
    for (const rec of recommendations.slice(0, 50)) {
      await prisma.recommendationLog.create({
        data: {
          shipmentId,
          candidateId: rec.candidateId,
          matchScore: rec.matchScore,
          matchReasons: rec.matchReasons,
          isReturnLoad: rec.isReturnLoad,
          isSharedLoad: rec.isSharedLoad,
        },
      });
    }

    return recommendations;
  } catch (error) {
    logger.error('Error computing recommendations:', error);
    return [];
  }
}

/**
 * Returns matched open shipments for a driver or fleet owner
 * Requirement: FR-DR-4, FR-FO-11
 */
async function getMatchedShipmentsForUser(user) {
  try {
    // 1. Get user's vehicles
    const vehicles = await prisma.vehicle.findMany({
      where: {
        ownerId: user.role === ROLES.DRIVER ? user.id : user.id,
        availabilityStatus: 'AVAILABLE',
      },
    });

    if (vehicles.length === 0) {
      return [];
    }

    const vehicleTypes = vehicles.map((v) => v.vehicleType);
    const maxCapacity = Math.max(...vehicles.map((v) => v.ratedCapacity));

    // 2. Fetch pending shipments matching capacity & vehicle types
    const shipments = await prisma.shipment.findMany({
      where: {
        status: 'PENDING',
        isDraft: false,
        requiredVehicleType: { in: vehicleTypes },
        cargoWeight: { lte: maxCapacity },
      },
      include: {
        cargoOwner: {
          select: { id: true, name: true, avgRating: true },
        },
        bids: {
          where: { bidderId: user.id },
          select: { id: true, proposedFare: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return shipments.map((s) => ({
      ...s,
      myBid: s.bids.length > 0 ? s.bids[0] : null,
      bids: undefined,
    }));
  } catch (error) {
    logger.error('Error fetching matched shipments for user:', error);
    return [];
  }
}

module.exports = {
  isCargoCompatibleWithVehicle,
  computeRecommendationsForShipment,
  getMatchedShipmentsForUser,
};
