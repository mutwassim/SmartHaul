jest.setTimeout(60000);

const mockPrisma = {
  shipment: { findUnique: jest.fn() },
  vehicle: { findMany: jest.fn() },
  trip: { findMany: jest.fn() },
  recommendationLog: { deleteMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../../src/config/db', () => mockPrisma);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/services/fcm.service', () => ({ dispatchNotification: jest.fn().mockResolvedValue(undefined) }));

const matching = require('../../src/modules/matching/matching.service');
const { calculateHaversineDistance } = require('../../src/services/osrm.service');
const { LIMITS, MATCH_WEIGHTS } = require('../../src/config/constants');

// Matching evaluation (FR-RM-4, FR-RM-5, Algorithm 1). Generated scenarios, not field data.
// The same eligible vehicles are ranked three ways: SmartHaul, nearest truck, and a manual
// broker who picks any eligible vehicle (the average over all of them).

const PICKUP = { lat: 31.5, lng: 74.3 };
const SCENARIOS = 200;
const VEHICLES_PER_SCENARIO = 12;

function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const emptyKm = (lat, lng) => calculateHaversineDistance(lat, lng, PICKUP.lat, PICKUP.lng).distanceKm * LIMITS.ROAD_FACTOR;

function buildScenario(random) {
  const vehicles = [];
  const trips = [];
  for (let i = 0; i < VEHICLES_PER_SCENARIO; i += 1) {
    const unrated = random() < 0.3;
    const owner = {
      id: `U${i}`, role: 'DRIVER', name: `U${i}`, serviceArea: [],
      avgRating: unrated ? 0 : 3 + random() * 2,
      completedTripsCount: unrated ? 0 : Math.floor(random() * 41),
    };
    vehicles.push({ id: `v${i}`, ownerId: owner.id, vehicleType: 'OPEN_BODY', ratedCapacity: 10, availabilityStatus: 'AVAILABLE', owner });
    // Where the vehicle is free: the drop-off of a trip that ended in the last 48 hours
    const lat = PICKUP.lat + (random() - 0.5) * 2.8;
    const lng = PICKUP.lng + (random() - 0.5) * 2.8;
    trips.push({ vehicleId: `v${i}`, shipment: { dropoffLat: lat, dropoffLng: lng } });
  }
  return { vehicles, trips };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(async (arg) => (typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg)));
  mockPrisma.shipment.findUnique.mockResolvedValue({
    id: 's1', shipmentNumber: 'SH-1', status: 'PENDING', isDraft: false, cargoType: 'CONSTRUCTION_MATERIAL',
    cargoWeight: 2.5, requiredVehicleType: 'OPEN_BODY', pickupAddress: 'Lahore', dropoffAddress: 'Islamabad',
    pickupLat: PICKUP.lat, pickupLng: PICKUP.lng, dropoffLat: 33.7, dropoffLng: 73.0,
    expectedDeliveryDate: new Date(Date.now() + 2 * 86400000),
  });
});

describe('ranking weights (FR-RM-5)', () => {
  test('the weights add up to 100 and no factor is worth more than 30', () => {
    const { VEHICLE_FIT_COMPATIBLE, SHARED_LOAD, ...main } = MATCH_WEIGHTS;
    expect(main.PROXIMITY + main.RATING + main.RETURN_LOAD + main.VEHICLE_FIT_EXACT + main.EXPERIENCE).toBe(100);
    expect(Math.max(...Object.values(MATCH_WEIGHTS))).toBeLessThanOrEqual(30);
  });

  test('an unrated driver earns 0 rating points and ranks below an equal driver rated 4', () => {
    const base = { completedTrips: 0, isReturnLoad: false, isExactType: true, proximityPoints: 20, sharedSimilarity: null };
    const unrated = matching.computeMatchScore({ ...base, avgRating: 0 });
    const rated = matching.computeMatchScore({ ...base, avgRating: 4 });
    expect(rated - unrated).toBe(20);
  });

  test('the return-load bonus alone cannot beat a nearby, rated driver', () => {
    const farReturn = matching.computeMatchScore({ avgRating: 0, completedTrips: 0, isReturnLoad: true, isExactType: true, proximityPoints: 0, sharedSimilarity: null });
    const nearRated = matching.computeMatchScore({ avgRating: 4, completedTrips: 0, isReturnLoad: false, isExactType: true, proximityPoints: matching.computeProximityScore(20) });
    expect(nearRated).toBeGreaterThan(farReturn);
  });

  test('with everything else equal, a return load ranks first', () => {
    const base = { avgRating: 4, completedTrips: 10, isExactType: true, proximityPoints: 15, sharedSimilarity: null };
    expect(matching.computeMatchScore({ ...base, isReturnLoad: true })).toBeGreaterThan(matching.computeMatchScore({ ...base, isReturnLoad: false }));
  });
});

describe('matching evaluation on generated scenarios', () => {
  async function evaluate() {
    const random = seeded(2026);
    const stat = { smart: 0, nearest: 0, broker: 0, smartRating: 0, nearestRating: 0, smartRated: 0, nearestRated: 0, smartReturn: 0, nearestReturn: 0 };
    for (let n = 0; n < SCENARIOS; n += 1) {
      const { vehicles, trips } = buildScenario(random);
      mockPrisma.vehicle.findMany.mockResolvedValue(vehicles);
      mockPrisma.trip.findMany.mockResolvedValue(trips);
      const ranked = await matching.computeRecommendationsForShipment('s1');

      const km = (vehicleId) => {
        const t = trips.find((x) => x.vehicleId === vehicleId).shipment;
        return emptyKm(t.dropoffLat, t.dropoffLng);
      };
      const ownerOf = (vehicleId) => vehicles.find((v) => v.id === vehicleId).owner;
      const all = vehicles.map((v) => ({ id: v.id, km: km(v.id) }));
      const nearest = all.reduce((a, b) => (b.km < a.km ? b : a));
      const top = ranked[0];

      stat.smart += km(top.vehicleId);
      stat.nearest += nearest.km;
      stat.broker += all.reduce((s, x) => s + x.km, 0) / all.length;
      if (ownerOf(top.vehicleId).avgRating > 0) { stat.smartRating += ownerOf(top.vehicleId).avgRating; stat.smartRated += 1; }
      if (ownerOf(nearest.id).avgRating > 0) { stat.nearestRating += ownerOf(nearest.id).avgRating; stat.nearestRated += 1; }
      if (top.isReturnLoad) stat.smartReturn += 1;
      if (nearest.km / LIMITS.ROAD_FACTOR <= LIMITS.RETURN_LOAD_RADIUS_KM) stat.nearestReturn += 1;
    }
    return {
      smartKm: stat.smart / SCENARIOS,
      nearestKm: stat.nearest / SCENARIOS,
      brokerKm: stat.broker / SCENARIOS,
      smartRating: stat.smartRating / stat.smartRated,
      nearestRating: stat.nearestRating / stat.nearestRated,
      smartUnrated: 1 - stat.smartRated / SCENARIOS,
      nearestUnrated: 1 - stat.nearestRated / SCENARIOS,
    };
  }

  test('the top-ranked vehicle cuts empty distance by at least 40% against an unranked pick, at little cost against the nearest truck', async () => {
    const r = await evaluate();
    expect(r.smartKm).toBeLessThanOrEqual(0.6 * r.brokerKm); // measured about 53% lower
    expect(r.smartKm).toBeLessThanOrEqual(1.5 * r.nearestKm); // measured about 21% above the nearest truck
    expect(r.smartRating).toBeGreaterThan(r.nearestRating); // and a better-rated driver on average
    expect(r.smartUnrated).toBeLessThan(r.nearestUnrated); // unrated drivers are not put first
  });
});
