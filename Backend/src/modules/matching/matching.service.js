const prisma = require('../../config/db');
const { calculateHaversineDistance } = require('../../services/osrm.service');
const {
  VEHICLE_TYPES,
  ACCOUNT_STATUS,
  LIMITS,
  MATCH_WEIGHTS,
  ROLES,
} = require('../../config/constants');
const logger = require('../../utils/logger');
const { dispatchNotification } = require('../../services/fcm.service');

// Shipment states in which a vehicle is committed to a route (BR-33)
const ACTIVE_TRIP_STATUSES = ['BOOKED', 'REACHED_PICKUP', 'CARGO_LOADED', 'IN_TRANSIT'];
const { ROAD_FACTOR, AVERAGE_SPEED_KMH } = LIMITS; // One speed and road factor for every estimate (C-52)
// Cargo that must not be mixed with a different cargo type on the same vehicle
const SAME_CARGO_ONLY_VEHICLES = ['TANKER', 'REFRIGERATED'];

const straightKm = (a, b) => calculateHaversineDistance(a.lat, a.lng, b.lat, b.lng).distanceKm;

/**
 * Remaining unused capacity in tonnes: rated capacity less the weight already assigned
 * Requirement: FR-RM-9, BR-4, BR-33
 */
function computeRemainingCapacity(ratedCapacity, assignedWeights = []) {
  const used = assignedWeights.reduce((sum, weight) => sum + (Number(weight) || 0), 0);
  return Math.max(0, Math.round((ratedCapacity - used) * 1000) / 1000);
}

/**
 * Extra distance caused by collecting a candidate on the way: A->P->Q->B compared with A->B
 * route = { pickupLat, pickupLng, dropoffLat, dropoffLng } of the committed trip, candidate likewise
 */
function computeDetour(route, candidate) {
  const a = { lat: route.pickupLat, lng: route.pickupLng };
  const b = { lat: route.dropoffLat, lng: route.dropoffLng };
  const p = { lat: candidate.pickupLat, lng: candidate.pickupLng };
  const q = { lat: candidate.dropoffLat, lng: candidate.dropoffLng };

  const baseKm = straightKm(a, b);
  const viaKm = straightKm(a, p) + straightKm(p, q) + straightKm(q, b);
  const detourKm = Math.max(0, viaKm - baseKm);

  return { baseKm, viaKm, detourKm, detourRatio: baseKm > 0 ? detourKm / baseKm : Infinity };
}

/**
 * Route similarity score from 0 (unrelated) to 1 (candidate lies exactly along the committed route)
 * Requirement: FR-RM-7
 */
function computeRouteSimilarity(route, candidate) {
  const { detourRatio } = computeDetour(route, candidate);
  if (!Number.isFinite(detourRatio)) return 0;
  return Math.round(Math.min(1, Math.max(0, 1 - detourRatio)) * 1000) / 1000;
}

/**
 * Decides whether a candidate shipment can share a partially loaded vehicle
 * Requirement: Algorithm 3 (deferred shared loads), BR-33 (weight, cargo compatibility, route closeness, delivery windows)
 * Returns null when not eligible, otherwise { remainingCapacity, similarity, detourKm }
 */
function evaluateSharedLoadEligibility({ vehicle, activeShipments, candidate, now = new Date() }) {
  if (!activeShipments || activeShipments.length === 0) return null;

  // 1. Weight (BR-33)
  const remainingCapacity = computeRemainingCapacity(
    vehicle.ratedCapacity,
    activeShipments.map((s) => s.cargoWeight)
  );
  if (remainingCapacity < candidate.cargoWeight) return null;

  // 2. Cargo compatibility with the vehicle body and, for tankers/reefers, with each other
  const bodyOk =
    isCargoCompatibleWithVehicle(vehicle.vehicleType, candidate.cargoType) &&
    activeShipments.every((s) => isCargoCompatibleWithVehicle(vehicle.vehicleType, s.cargoType));
  if (!bodyOk) return null;
  if (
    SAME_CARGO_ONLY_VEHICLES.includes(vehicle.vehicleType) &&
    activeShipments.some((s) => s.cargoType !== candidate.cargoType)
  ) {
    return null;
  }

  // 3. Candidate must lie close to the committed route (Algorithm 3 (deferred shared loads))
  const committed = activeShipments[0];
  const { detourKm, detourRatio, viaKm } = computeDetour(committed, candidate);
  if (!Number.isFinite(detourRatio) || detourRatio > LIMITS.SHARED_LOAD_DETOUR_PERCENT_MAX / 100) return null;

  // 4. Neither delivery window may be breached (BR-33)
  const hoursFor = (km) => (km * ROAD_FACTOR) / AVERAGE_SPEED_KMH;
  const committedEta = now.getTime() + hoursFor(viaKm) * 3600 * 1000;
  const candidateKm =
    straightKm({ lat: committed.pickupLat, lng: committed.pickupLng }, { lat: candidate.pickupLat, lng: candidate.pickupLng }) +
    straightKm({ lat: candidate.pickupLat, lng: candidate.pickupLng }, { lat: candidate.dropoffLat, lng: candidate.dropoffLng });
  const candidateEta = now.getTime() + hoursFor(candidateKm) * 3600 * 1000;

  if (committedEta > new Date(committed.expectedDeliveryDate).getTime()) return null;
  if (candidateEta > new Date(candidate.expectedDeliveryDate).getTime()) return null;

  return {
    remainingCapacity,
    similarity: computeRouteSimilarity(committed, candidate),
    detourKm: Math.round(detourKm * 10) / 10,
  };
}

/**
 * Proximity points: 60 at the pickup, falling in a straight line to 0 at 200 km or more
 * Requirement: FR-RM-4, Algorithm 1 proximity term (UT-12, DEF-09)
 */
function computeProximityScore(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  const { PROXIMITY_MAX_POINTS, PROXIMITY_RADIUS_KM } = LIMITS;
  return Math.round(PROXIMITY_MAX_POINTS * Math.max(0, 1 - distanceKm / PROXIMITY_RADIUS_KM));
}

/**
 * Ranking score out of 100 (FR-RM-5, Algorithm 1). Weights are in MATCH_WEIGHTS; none is above 30.
 * A driver with no rating yet (avgRating 0) earns 0 rating points: no credit and no penalty beyond that.
 */
function computeMatchScore({ avgRating, completedTrips, isReturnLoad, isExactType, proximityPoints, sharedSimilarity }) {
  const w = MATCH_WEIGHTS;
  const rating = avgRating > 0 ? (avgRating / 5) * w.RATING : 0;
  const experience = (Math.min(completedTrips || 0, LIMITS.EXPERIENCE_FULL_TRIPS) / LIMITS.EXPERIENCE_FULL_TRIPS) * w.EXPERIENCE;
  const returnLoad = isReturnLoad ? w.RETURN_LOAD : 0;
  const fit = isExactType ? w.VEHICLE_FIT_EXACT : w.VEHICLE_FIT_COMPATIBLE;
  const shared = sharedSimilarity === null || sharedSimilarity === undefined ? 0 : sharedSimilarity * w.SHARED_LOAD;
  return Math.round(rating + experience + returnLoad + fit + shared + (proximityPoints || 0));
}

/**
 * Checks vehicle body type vs cargo type compatibility
 * Requirement: BR-5, Table C-5
 */
function isCargoCompatibleWithVehicle(vehicleType, cargoType) {
  const spec = VEHICLE_TYPES[vehicleType];
  if (!spec || !cargoType) return false;
  // Exact match against the Table C-5 list; cargoType is an enum, so no substring matching (C-13)
  return spec.compatibleCargos.includes(cargoType);
}

/**
 * Computes recommendations for a shipment, stores them, and notifies the best candidates
 * Requirement: MOD-5, FR-RM-1 to FR-RM-10, FR-NC-3
 */
async function computeRecommendationsForShipment(shipmentId) {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment || shipment.isDraft || shipment.status !== 'PENDING') {
      return [];
    }

    // 1. Fetch all verified and available vehicles (BR-32)
    const candidates = await prisma.vehicle.findMany({
      where: {
        // ASSIGNED vehicles are kept only so they can be offered shared loads (Algorithm 3 (deferred shared loads))
        availabilityStatus: { in: ['AVAILABLE', 'ASSIGNED'] },
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
      },
    });

    // 2. Two queries for every vehicle, not two per vehicle (C-34)
    const vehicleIds = candidates.map((v) => v.id);
    const windowStart = new Date(Date.now() - LIMITS.RETURN_LOAD_WINDOW_HOURS * 60 * 60 * 1000);

    const activeTrips = candidates.some((v) => v.availabilityStatus === 'ASSIGNED')
      ? await prisma.trip.findMany({
          where: { vehicleId: { in: vehicleIds }, shipment: { status: { in: ACTIVE_TRIP_STATUSES } } },
          include: { shipment: true },
        })
      : [];
    const activeByVehicle = new Map();
    for (const trip of activeTrips) {
      if (!activeByVehicle.has(trip.vehicleId)) activeByVehicle.set(trip.vehicleId, []);
      activeByVehicle.get(trip.vehicleId).push(trip.shipment);
    }

    // Only a recent trip can make a new load a return load (FR-RM-4, C-34)
    const recentTrips = await prisma.trip.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        updatedAt: { gte: windowStart },
        shipment: { status: { in: ['IN_TRANSIT', 'REACHED_DESTINATION', 'COMPLETED'] } },
      },
      include: { shipment: true },
      orderBy: { updatedAt: 'desc' },
    });
    const latestTripByVehicle = new Map();
    for (const trip of recentTrips) {
      if (!latestTripByVehicle.has(trip.vehicleId)) latestTripByVehicle.set(trip.vehicleId, trip);
    }

    const recommendations = [];

    for (const vehicle of candidates) {
      const reasons = [];

      // Physical capacity filter (BR-4)
      if (vehicle.ratedCapacity < shipment.cargoWeight) {
        continue;
      }
      reasons.push(`Rated capacity (${vehicle.ratedCapacity}t) satisfies cargo weight (${shipment.cargoWeight}t)`);

      // The vehicle body must be able to carry this cargo type (BR-5); the exact requested type ranks higher
      if (!isCargoCompatibleWithVehicle(vehicle.vehicleType, shipment.cargoType)) {
        continue;
      }
      const isExactType = vehicle.vehicleType === shipment.requiredVehicleType;
      if (isExactType) reasons.push('Exact vehicle type match');

      // Service area corridor check (FR-RM-4)
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

      // Partially loaded vehicle: only eligible as a shared load (Algorithm 3 (deferred shared loads), BR-33)
      let sharedLoad = null;
      if (vehicle.availabilityStatus === 'ASSIGNED') {
        sharedLoad = evaluateSharedLoadEligibility({
          vehicle,
          activeShipments: activeByVehicle.get(vehicle.id) || [],
          candidate: shipment,
        });

        if (!sharedLoad) {
          continue;
        }
        reasons.push(
          `Shared load: ${sharedLoad.remainingCapacity}t spare, route similarity ${sharedLoad.similarity}, detour ${sharedLoad.detourKm}km`
        );
      }
      const isSharedLoad = sharedLoad !== null;

      // Return-load opportunity (FR-RM-7, FR-RM-8)
      let isReturnLoad = false;
      const recentTrip = latestTripByVehicle.get(vehicle.id);
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

      // Proximity (FR-RM-4): distance from where the vehicle will be free (the destination of its
      // current trip, else of its latest trip) to this pickup. A vehicle with no known reference gets no points.
      let proximityScore = 0;
      const referenceShipment = (activeByVehicle.get(vehicle.id) || [])[0] || (recentTrip && recentTrip.shipment) || null;
      if (referenceShipment) {
        const roadKm =
          straightKm(
            { lat: referenceShipment.dropoffLat, lng: referenceShipment.dropoffLng },
            { lat: shipment.pickupLat, lng: shipment.pickupLng }
          ) * ROAD_FACTOR;
        proximityScore = computeProximityScore(roadKm);
        if (proximityScore > 0) reasons.push(`Proximity: about ${Math.round(roadKm)}km from its next free point to pickup`);
      }

      // Composite ranking score (FR-RM-5, Algorithm 1)
      const totalScore = computeMatchScore({
        avgRating: vehicle.owner.avgRating,
        completedTrips: vehicle.owner.completedTripsCount,
        isReturnLoad,
        isExactType,
        proximityPoints: proximityScore,
        sharedSimilarity: isSharedLoad ? sharedLoad.similarity : null,
      });

      recommendations.push({
        candidateId: vehicle.owner.id,
        vehicleId: vehicle.id,
        vehicleType: vehicle.vehicleType,
        ratedCapacity: vehicle.ratedCapacity,
        owner: vehicle.owner,
        matchScore: totalScore,
        matchReasons: reasons,
        isReturnLoad,
        isSharedLoad,
      });
    }

    // Best vehicle per candidate, highest score first (FR-RM-5)
    // Equal scores: the higher average rating first (Algorithm 1)
    recommendations.sort(
      (a, b) => b.matchScore - a.matchScore || (b.owner.avgRating || 0) - (a.owner.avgRating || 0)
    );
    const seen = new Set();
    const ranked = recommendations.filter((rec) => {
      if (seen.has(rec.candidateId)) return false;
      seen.add(rec.candidateId);
      return true;
    });

    // Persist the latest run for the feed and for audit (FR-RM-10)
    const kept = ranked.slice(0, 50);
    await prisma.$transaction([
      prisma.recommendationLog.deleteMany({ where: { shipmentId } }),
      prisma.recommendationLog.createMany({
        data: kept.map((rec) => ({
          shipmentId,
          candidateId: rec.candidateId,
          matchScore: rec.matchScore,
          matchReasons: rec.matchReasons,
          isReturnLoad: rec.isReturnLoad,
          isSharedLoad: rec.isSharedLoad,
        })),
      }),
    ]);

    // Tell the best-ranked candidates (FR-NC-3)
    await Promise.allSettled(
      kept.slice(0, LIMITS.NOTIFY_TOP_CANDIDATES).map((rec) =>
        dispatchNotification({
          recipientId: rec.candidateId,
          type: 'NEW_MATCHING_SHIPMENT',
          title: 'New Matching Shipment',
          message: `${shipment.shipmentNumber}: ${shipment.pickupAddress} to ${shipment.dropoffAddress}, ${shipment.cargoWeight}t.${rec.isReturnLoad ? ' Return load for you.' : ''}`,
          relatedShipmentId: shipmentId,
        })
      )
    );

    return ranked;
  } catch (error) {
    logger.error('Error computing recommendations:', error);
    return [];
  }
}

/**
 * Returns matched open shipments for a driver or fleet owner, best match first
 * Requirement: FR-DR-3, FR-FO-9, FR-RM-5
 */
async function getMatchedShipmentsForUser(user) {
  try {
    // Recommendations stored when each shipment was published
    const logs = await prisma.recommendationLog.findMany({
      where: { candidateId: user.id, shipment: { status: 'PENDING', isDraft: false } },
      orderBy: { computedAt: 'desc' },
    });
    const recByShipment = new Map();
    for (const log of logs) {
      if (!recByShipment.has(log.shipmentId)) recByShipment.set(log.shipmentId, log);
    }

    // Shipments the user's available vehicles can carry but that have no stored recommendation yet
    const vehicles = await prisma.vehicle.findMany({
      where: { ownerId: user.id, availabilityStatus: 'AVAILABLE' },
    });
    const maxCapacity = vehicles.length ? Math.max(...vehicles.map((v) => v.ratedCapacity)) : 0;

    const shipments = await prisma.shipment.findMany({
      where: {
        status: 'PENDING',
        isDraft: false,
        OR: [
          { id: { in: [...recByShipment.keys()] } },
          ...(vehicles.length ? [{ cargoWeight: { lte: maxCapacity } }] : []),
        ],
      },
      omit: { routePolyline: true }, // C-33
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
      take: 200,
    });

    const eligible = shipments.filter(
      (s) =>
        recByShipment.has(s.id) ||
        vehicles.some((v) => v.ratedCapacity >= s.cargoWeight && isCargoCompatibleWithVehicle(v.vehicleType, s.cargoType))
    );

    return eligible
      .map((s) => {
        const rec = recByShipment.get(s.id);
        return {
          ...s,
          myBid: s.bids.length > 0 ? s.bids[0] : null,
          bids: undefined,
          recommendation: rec
            ? {
                score: rec.matchScore,
                reasons: rec.matchReasons,
                isReturnLoad: rec.isReturnLoad,
                isSharedLoad: rec.isSharedLoad,
              }
            : null,
        };
      })
      .sort((a, b) => {
        // Ranked matches first by score, then the rest newest first
        if (a.recommendation && b.recommendation) return b.recommendation.score - a.recommendation.score;
        if (a.recommendation) return -1;
        if (b.recommendation) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      })
      .slice(0, 100);
  } catch (error) {
    logger.error('Error fetching matched shipments for user:', error);
    return [];
  }
}

module.exports = {
  isCargoCompatibleWithVehicle,
  computeRemainingCapacity,
  computeMatchScore,
  computeRouteSimilarity,
  computeProximityScore,
  evaluateSharedLoadEligibility,
  computeRecommendationsForShipment,
  getMatchedShipmentsForUser,
};
