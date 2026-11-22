const mockPrisma = {
  trip: { findMany: jest.fn(), update: jest.fn((args) => ({ op: 'trip.update', args })) },
  tripPosition: { findMany: jest.fn(), deleteMany: jest.fn((args) => ({ op: 'deleteMany', args })) },
  tripStatusLog: { findFirst: jest.fn() },
  routeSummary: { upsert: jest.fn((args) => ({ op: 'upsert', args })) },
  $transaction: jest.fn(async (ops) => ops.map((op) => (op.op === 'deleteMany' ? { count: 3 } : op))),
};

jest.mock('../../src/config/db', () => mockPrisma);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { buildRouteSummary, runTrackingRetentionCleanup } = require('../../src/jobs/trackingRetention.job');

const at = (minutes) => new Date(Date.UTC(2026, 0, 1, 10, minutes));
// Lahore -> Islamabad in four steps
const positions = [
  { latitude: 31.47, longitude: 74.24, recordedAt: at(0) },
  { latitude: 32.0, longitude: 73.9, recordedAt: at(60) },
  { latitude: 32.9, longitude: 73.3, recordedAt: at(120) },
  { latitude: 33.66, longitude: 73.06, recordedAt: at(180) },
];

describe('GPS retention summary (BR-17, FR-RT-11)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('summary keeps distance, duration and a route path', () => {
    const summary = buildRouteSummary(positions);
    expect(summary.totalKm).toBeGreaterThan(200);
    expect(summary.totalKm).toBeLessThan(300);
    expect(summary.loadedKm).toBe(0);
    expect(summary.durationMin).toBe(180);
    expect(summary.positionCount).toBe(4);
    expect(summary.path).toHaveLength(4);
  });

  test('loaded distance counts only legs after cargo was loaded', () => {
    const all = buildRouteSummary(positions, at(0));
    const half = buildRouteSummary(positions, at(120));
    expect(all.loadedKm).toBe(all.totalKm);
    expect(half.loadedKm).toBeGreaterThan(0);
    expect(half.loadedKm).toBeLessThan(all.totalKm);
  });

  test('long routes are down-sampled but keep the final point', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      latitude: 31 + i * 0.005,
      longitude: 74 - i * 0.002,
      recordedAt: at(i),
    }));
    const summary = buildRouteSummary(many);
    expect(summary.path.length).toBeLessThanOrEqual(51);
    expect(summary.path[summary.path.length - 1]).toEqual([many[499].latitude, many[499].longitude]);
  });

  test('job writes the summary in the same transaction that deletes the positions', async () => {
    mockPrisma.trip.findMany.mockResolvedValue([{ id: 'trip-1', shipmentId: 'ship-1' }]);
    mockPrisma.tripPosition.findMany.mockResolvedValue(positions);
    mockPrisma.tripStatusLog.findFirst.mockResolvedValue(null);

    await runTrackingRetentionCleanup();

    const ops = mockPrisma.$transaction.mock.calls[0][0].map((op) => op.op);
    expect(ops).toEqual(['upsert', 'trip.update', 'deleteMany']);
    expect(mockPrisma.routeSummary.upsert.mock.calls[0][0].create).toMatchObject({
      tripId: 'trip-1',
      shipmentId: 'ship-1',
      positionCount: 4,
    });
  });

  test('trips without positions are skipped', async () => {
    mockPrisma.trip.findMany.mockResolvedValue([{ id: 'trip-2', shipmentId: 'ship-2' }]);
    mockPrisma.tripPosition.findMany.mockResolvedValue([]);

    await runTrackingRetentionCleanup();

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
