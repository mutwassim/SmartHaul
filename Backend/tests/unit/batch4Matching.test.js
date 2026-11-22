jest.setTimeout(30000);

const fs = require('fs');
const path = require('path');

const mockPrisma = {
  shipment: { findUnique: jest.fn(), findMany: jest.fn() },
  vehicle: { findMany: jest.fn() },
  trip: { findMany: jest.fn() },
  recommendationLog: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../../src/config/db', () => mockPrisma);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/services/fcm.service', () => ({ dispatchNotification: jest.fn().mockResolvedValue(undefined) }));

const matching = require('../../src/modules/matching/matching.service');
const { computeEmptyRunning } = require('../../src/services/emptyRunning.service');
const { calculateHaversineDistance } = require('../../src/services/osrm.service');
const { CARGO_TYPES, VEHICLE_TYPES, LIMITS } = require('../../src/config/constants');
const { createShipmentSchema } = require('../../src/modules/cargo-owner/cargoOwner.validation');
const cargoController = require('../../src/modules/cargo-owner/cargoOwner.controller');
const { dispatchNotification } = require('../../src/services/fcm.service');

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000);
const shipment = (o = {}) => ({
  id: 's1', shipmentNumber: 'SH-2026-00001', status: 'PENDING', isDraft: false, cargoType: 'CONSTRUCTION_MATERIAL',
  cargoWeight: 2.5, requiredVehicleType: 'OPEN_BODY', pickupAddress: 'Lahore', dropoffAddress: 'Islamabad',
  pickupLat: 31.5, pickupLng: 74.3, dropoffLat: 33.7, dropoffLng: 73.0, expectedDeliveryDate: new Date(Date.now() + 2 * 86400000), ...o,
});
const vehicle = (id, ownerId, o = {}) => ({
  id, ownerId, vehicleType: 'OPEN_BODY', ratedCapacity: 10, availabilityStatus: 'AVAILABLE',
  owner: { id: ownerId, role: 'DRIVER', name: ownerId, avgRating: 4, completedTripsCount: 0, serviceArea: [] }, ...o,
});

beforeEach(() => {
  jest.resetAllMocks();
  dispatchNotification.mockResolvedValue(undefined);
  mockPrisma.$transaction.mockImplementation(async (arg) => (typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg)));
  mockPrisma.shipment.findUnique.mockResolvedValue(shipment());
  mockPrisma.trip.findMany.mockResolvedValue([]);
});

describe('cargo compatibility is an exact match (C-13)', () => {
  test.each([
    ['OPEN_BODY', 'PERISHABLE_GOODS'],      // used to be true because the list contains GENERAL_GOODS
    ['MAZDA_MGV', 'LIQUIDS_AND_BULK_FLUID'],
    ['TANKER', 'L'],                         // a one-letter substring used to match
    ['REFRIGERATED', 'GOODS'],
    ['TANKER', undefined],
    ['NOT_A_VEHICLE', 'GENERAL_GOODS'],
  ])('%s cannot carry %s', (vehicleType, cargo) => {
    expect(matching.isCargoCompatibleWithVehicle(vehicleType, cargo)).toBe(false);
  });

  test('every category on every vehicle list is accepted, and nothing else', () => {
    for (const [type, spec] of Object.entries(VEHICLE_TYPES)) {
      for (const cargo of CARGO_TYPES) {
        expect(matching.isCargoCompatibleWithVehicle(type, cargo)).toBe(spec.compatibleCargos.includes(cargo));
      }
    }
  });

  test('the Prisma CargoType enum lists exactly the categories in Table C-5', () => {
    const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const body = schema.match(/enum CargoType \{([^}]*)\}/)[1];
    const values = body.split('\n').map((l) => l.trim()).filter(Boolean);
    expect([...values].sort()).toEqual([...CARGO_TYPES].sort());
  });

  const base = {
    pickupAddress: 'Lahore Dry Port', pickupLat: 31.5, pickupLng: 74.3, dropoffAddress: 'Islamabad I-9', dropoffLat: 33.7, dropoffLng: 73.0,
    cargoWeight: 2, requiredVehicleType: 'OPEN_BODY', expectedDeliveryDate: new Date(Date.now() + 86400000).toISOString(),
  };
  test('free-text cargo types are rejected at creation, listed ones accepted', () => {
    expect(createShipmentSchema.safeParse({ ...base, cargoType: 'Industrial Machinery & Spare Parts' }).success).toBe(false);
    expect(createShipmentSchema.safeParse({ ...base, cargoType: 'MACHINERY' }).success).toBe(true);
  });

  test('a vehicle type that cannot carry the cargo is refused at creation (BR-5)', async () => {
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    const next = jest.fn();
    await cargoController.createShipment({ user: { id: 'co' }, body: { ...base, cargoType: 'FURNITURE', requiredVehicleType: 'TANKER', cargoWeight: 12 } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(422);
    expect(res.body.error.code).toBe('CARGO_VEHICLE_INCOMPATIBLE');
  });
});

describe('computeRecommendationsForShipment (C-01, C-34)', () => {
  test('ranks by score, keeps one row per candidate, excludes incompatible bodies', async () => {
    mockPrisma.vehicle.findMany.mockResolvedValue([
      vehicle('v1', 'A', { owner: { id: 'A', avgRating: 4.5, completedTripsCount: 0, serviceArea: [] } }),
      vehicle('v1b', 'A', { vehicleType: 'MAZDA_MGV', owner: { id: 'A', avgRating: 4.5, completedTripsCount: 0, serviceArea: [] } }),
      vehicle('v2', 'B', { vehicleType: 'REFRIGERATED' }),
      vehicle('v3', 'C', { vehicleType: 'MAZDA_MGV', owner: { id: 'C', avgRating: 5, completedTripsCount: 0, serviceArea: [] } }),
    ]);
    const out = await matching.computeRecommendationsForShipment('s1');

    expect(out.map((r) => r.candidateId)).toEqual(['C', 'A'].sort((x, y) => out.findIndex((r) => r.candidateId === x) - out.findIndex((r) => r.candidateId === y)));
    expect(out.map((r) => r.candidateId)).not.toContain('B');
    expect(out.filter((r) => r.candidateId === 'A')).toHaveLength(1);
    expect(out.find((r) => r.candidateId === 'A').vehicleId).toBe('v1'); // exact type beats the Mazda
    // A: 4.5/5*25 = 22.5, plus exact fit 15 = 37.5, rounds to 38; C: 25 plus compatible fit 5 = 30
    expect(out[0].candidateId).toBe('A');
    expect(out[0].matchScore).toBe(38);
    expect(out[1].matchScore).toBe(30);
  });

  test('stores the ranked list and notifies the top candidates in order (FR-NC-3)', async () => {
    const vs = Array.from({ length: 12 }, (_, i) => vehicle(`v${i}`, `U${i}`, { owner: { id: `U${i}`, avgRating: 3 + i * 0.1, completedTripsCount: 0, serviceArea: [] } }));
    mockPrisma.vehicle.findMany.mockResolvedValue(vs);
    await matching.computeRecommendationsForShipment('s1');

    const stored = mockPrisma.recommendationLog.createMany.mock.calls[0][0].data;
    expect(stored).toHaveLength(12);
    expect(mockPrisma.recommendationLog.deleteMany).toHaveBeenCalledWith({ where: { shipmentId: 's1' } });
    const notified = dispatchNotification.mock.calls.map((c) => c[0]);
    expect(notified).toHaveLength(LIMITS.NOTIFY_TOP_CANDIDATES);
    expect(notified.every((n) => n.type === 'NEW_MATCHING_SHIPMENT')).toBe(true);
    expect(notified[0].recipientId).toBe('U11');
  });

  test('uses two trip queries in total, not two per vehicle', async () => {
    mockPrisma.vehicle.findMany.mockResolvedValue(Array.from({ length: 20 }, (_, i) => vehicle(`v${i}`, `U${i}`)));
    await matching.computeRecommendationsForShipment('s1');
    expect(mockPrisma.trip.findMany.mock.calls.length).toBeLessThanOrEqual(2);
    expect(mockPrisma.vehicle.findMany).toHaveBeenCalledTimes(1);
  });

  test('a return load needs a recent trip ending near the pickup (48 h window)', async () => {
    mockPrisma.vehicle.findMany.mockResolvedValue([vehicle('v1', 'A')]);
    mockPrisma.trip.findMany.mockResolvedValue([
      { vehicleId: 'v1', shipment: { dropoffLat: 31.52, dropoffLng: 74.31 } },
    ]);
    const out = await matching.computeRecommendationsForShipment('s1');
    expect(out[0].isReturnLoad).toBe(true);
    const prox = matching.computeProximityScore(calculateHaversineDistance(31.52, 74.31, 31.5, 74.3).distanceKm * LIMITS.ROAD_FACTOR);
    expect(out[0].matchScore).toBe(20 + 15 + 20 + prox);

    // The query itself limits the trip to the window, so a months-old trip cannot be returned
    const where = mockPrisma.trip.findMany.mock.calls[0][0].where;
    const cutoff = where.updatedAt.gte.getTime();
    expect(Math.abs(cutoff - (Date.now() - LIMITS.RETURN_LOAD_WINDOW_HOURS * 3600 * 1000))).toBeLessThan(5000);
  });

  test('a return trip ending far from the pickup earns no bonus', async () => {
    mockPrisma.vehicle.findMany.mockResolvedValue([vehicle('v1', 'A')]);
    mockPrisma.trip.findMany.mockResolvedValue([{ vehicleId: 'v1', shipment: { dropoffLat: 24.86, dropoffLng: 67.0 } }]);
    const out = await matching.computeRecommendationsForShipment('s1');
    expect(out[0].isReturnLoad).toBe(false);
  });

  test('a draft is not matched or notified', async () => {
    mockPrisma.shipment.findUnique.mockResolvedValue(shipment({ isDraft: true }));
    expect(await matching.computeRecommendationsForShipment('s1')).toEqual([]);
    expect(mockPrisma.vehicle.findMany).not.toHaveBeenCalled();
    expect(dispatchNotification).not.toHaveBeenCalled();
  });
});

describe('getMatchedShipmentsForUser returns the ranked list (C-01)', () => {
  test('ranked matches first by score, then other eligible loads; incompatible loads are left out', async () => {
    mockPrisma.recommendationLog.findMany.mockResolvedValue([
      { shipmentId: 's2', matchScore: 150, matchReasons: ['a'], isReturnLoad: true, isSharedLoad: false },
      { shipmentId: 's1', matchScore: 200, matchReasons: ['b'], isReturnLoad: false, isSharedLoad: false },
    ]);
    mockPrisma.vehicle.findMany.mockResolvedValue([vehicle('v1', 'U')]);
    const row = (id, o = {}) => ({ id, cargoType: 'CONSTRUCTION_MATERIAL', cargoWeight: 2, createdAt: new Date(), bids: [], cargoOwner: {}, ...o });
    mockPrisma.shipment.findMany.mockResolvedValue([
      row('s3'),
      row('s2'),
      row('s4', { cargoType: 'PERISHABLE_GOODS' }),
      row('s1'),
    ]);

    const out = await matching.getMatchedShipmentsForUser({ id: 'U', role: 'DRIVER' });
    expect(out.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(out[0].recommendation).toEqual({ score: 200, reasons: ['b'], isReturnLoad: false, isSharedLoad: false });
    expect(out[2].recommendation).toBeNull();
  });
});

describe('empty running is measured, not assumed (C-12)', () => {
  const T = (id, vehicleId, drop, pick, start, end, km = 200) => ({
    id, vehicleId, startedAt: start, completedAt: end, createdAt: start, loadedDistanceKm: null,
    shipment: { distanceKm: km, pickupLat: pick[0], pickupLng: pick[1], dropoffLat: drop[0], dropoffLng: drop[1], completedAt: end },
  });

  test('no trips, and a single trip, measure no empty distance', () => {
    expect(computeEmptyRunning([]).emptyRunningPercentage).toBe(0);
    const one = computeEmptyRunning([T('t1', 'v1', [31, 74], [32, 74], hoursAgo(30), hoursAgo(20), 100)]);
    expect(one).toMatchObject({ loadedDistanceKm: 100, emptyDistanceKm: 0, emptyRunningPercentage: 0, measuredLegs: 0 });
  });

  test('the old constant (23 per cent for any data) is gone: different data, different answers', () => {
    const small = computeEmptyRunning([T('a', 'v1', [31, 74], [32, 74], hoursAgo(30), hoursAgo(20), 10)]);
    const big = computeEmptyRunning([T('b', 'v1', [31, 74], [32, 74], hoursAgo(30), hoursAgo(20), 12345)]);
    expect(small.emptyRunningPercentage).toBe(0);
    expect(big.emptyRunningPercentage).toBe(0);
  });

  test('empty distance is drop-off to next pickup for the same vehicle within 48 h', () => {
    const t1 = T('t1', 'v1', [31, 74], [30, 74], hoursAgo(40), hoursAgo(30), 200);
    const t2 = T('t2', 'v1', [31, 74], [32, 74], hoursAgo(25), hoursAgo(10), 200); // starts 5 h after t1 ended, 111 km away
    const r = computeEmptyRunning([t2, t1]); // order must not matter
    const expectedEmpty = Math.round(calculateHaversineDistance(31, 74, 32, 74).distanceKm * LIMITS.ROAD_FACTOR);
    expect(r.measuredLegs).toBe(1);
    expect(r.emptyDistanceKm).toBe(expectedEmpty);
    expect(r.loadedDistanceKm).toBe(400);
    expect(r.emptyRunningPercentage).toBeCloseTo((expectedEmpty / (expectedEmpty + 400)) * 100, 0);
  });

  test('a gap longer than the window, or a different vehicle, is not counted', () => {
    const t1 = T('t1', 'v1', [31, 74], [30, 74], hoursAgo(200), hoursAgo(190));
    const later = T('t2', 'v1', [31, 74], [32, 74], hoursAgo(100), hoursAgo(90)); // 90 h gap
    const other = T('t3', 'v2', [31, 74], [32, 74], hoursAgo(185), hoursAgo(180));
    expect(computeEmptyRunning([t1, later, other]).measuredLegs).toBe(0);
  });

  test('prefers measured loaded distance from tracking over the planned distance', () => {
    const t = T('t1', 'v1', [31, 74], [32, 74], hoursAgo(30), hoursAgo(20), 100);
    t.loadedDistanceKm = 120;
    expect(computeEmptyRunning([t]).loadedDistanceKm).toBe(120);
  });
});

describe('one speed for every estimate (C-52)', () => {
  test('road-route fallback uses the shared speed and road factor', () => {
    const { estimateRoadRoute } = require('../../src/services/osrm.service');
    const r = estimateRoadRoute(31, 74, 32, 74);
    expect(r.durationMinutes).toBe(Math.round((r.distanceKm / LIMITS.AVERAGE_SPEED_KMH) * 60));
    expect(LIMITS.AVERAGE_SPEED_KMH).toBe(50);
  });
});

describe('proximity term (FR-RM-4, Algorithm 1)', () => {
  test('30 points at the pickup, falling in a line to 0 at 200 km', () => {
    expect(matching.computeProximityScore(0)).toBe(30);
    expect(matching.computeProximityScore(100)).toBe(15);
    expect(matching.computeProximityScore(200)).toBe(0);
    expect(matching.computeProximityScore(900)).toBe(0);
    expect(matching.computeProximityScore(NaN)).toBe(0);
    expect(matching.computeProximityScore(-5)).toBe(0);
  });

  test('of two otherwise equal vehicles the one that frees up nearer the pickup ranks first', async () => {
    mockPrisma.vehicle.findMany.mockResolvedValue([vehicle('far', 'F'), vehicle('near', 'N')]);
    mockPrisma.trip.findMany.mockResolvedValue([
      { vehicleId: 'far', shipment: { dropoffLat: 32.9, dropoffLng: 73.7 } }, // roughly 150 km from the pickup
      { vehicleId: 'near', shipment: { dropoffLat: 31.9, dropoffLng: 74.3 } }, // roughly 45 km, so also a return load
    ]);
    const out = await matching.computeRecommendationsForShipment('s1');
    expect(out.map((r) => r.candidateId)).toEqual(['N', 'F']);
    expect(out[0].matchReasons.some((r) => r.startsWith('Proximity'))).toBe(true);
  });

  test('a vehicle with no known reference gets no proximity points and no reason', async () => {
    mockPrisma.vehicle.findMany.mockResolvedValue([vehicle('v1', 'A')]);
    mockPrisma.trip.findMany.mockResolvedValue([]);
    const out = await matching.computeRecommendationsForShipment('s1');
    expect(out[0].matchScore).toBe(20 + 15);
    expect(out[0].matchReasons.some((r) => r.startsWith('Proximity'))).toBe(false);
  });
});
