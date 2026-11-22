jest.setTimeout(30000);

const mockPrisma = {
  trip: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  tripPosition: { create: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
  tripStatusLog: { findFirst: jest.fn(), create: jest.fn() },
  shipment: { findMany: jest.fn(), updateMany: jest.fn() },
  user: { findMany: jest.fn(), update: jest.fn() },
  vehicle: { update: jest.fn() },
  proofOfDelivery: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../../src/config/db', () => mockPrisma);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/services/fcm.service', () => ({ dispatchNotification: jest.fn() }));
jest.mock('../../src/services/audit.service', () => ({ logAdminAction: jest.fn() }));
jest.mock('../../src/services/osrm.service', () => ({ estimateRoadRoute: () => ({ distanceKm: 1, durationMinutes: 2 }) }));

const fs = require('fs');
const path = require('path');
const ws = require('../../src/websocket/tracking.handler');
const driver = require('../../src/modules/driver/driver.controller');
const admin = require('../../src/modules/admin/admin.controller');
const { runAutoCompleteShipments } = require('../../src/jobs/autoCompleteShipments.job');
const { runTrackingInterruptionCheck } = require('../../src/jobs/trackingInterruption.job');
const { batchPositionsSyncSchema, batchStatusSyncSchema, updateTripStatusSchema } = require('../../src/modules/driver/driver.validation');
const { dispatchNotification } = require('../../src/services/fcm.service');

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const run = async (fn, req) => {
  const res = fakeRes(); const next = jest.fn();
  await fn({ query: {}, params: {}, body: {}, ...req }, res, next);
  if (next.mock.calls.length) throw next.mock.calls[0][0];
  return res;
};
const fakeWs = () => ({ readyState: 1, sent: [], send(m) { this.sent.push(JSON.parse(m)); } });
const msg = (o) => JSON.stringify(o);
const drv = { id: 'd1', role: 'DRIVER', name: 'Drv' };
const owner = { id: 'o1', role: 'CARGO_OWNER', name: 'Own' };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (arg) => (typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg)));
});

describe('C-29 WebSocket', () => {
  const now = new Date();
  const base = { latitude: 31.5, longitude: 74.3, accuracy: 10 };

  test('validateLocation rejects bad coordinates, missing/zero accuracy, bad and future timestamps', () => {
    expect(ws.validateLocation({ ...base, latitude: 95 }).ok).toBe(false);
    expect(ws.validateLocation({ ...base, longitude: 'x' }).ok).toBe(false);
    expect(ws.validateLocation({ ...base, latitude: NaN }).ok).toBe(false);
    expect(ws.validateLocation({ latitude: 1, longitude: 1 }).ok).toBe(false);
    expect(ws.validateLocation({ ...base, accuracy: 0 }).ok).toBe(false);
    expect(ws.validateLocation({ ...base, timestamp: 'garbage' }).ok).toBe(false);
    expect(ws.validateLocation({ ...base, timestamp: new Date(now.getTime() + 3600e3).toISOString() }, now).ok).toBe(false);
    expect(ws.validateLocation({ ...base, timestamp: new Date(now.getTime() - 3600e3).toISOString() }, now).ok).toBe(false);
    expect(ws.validateLocation({ ...base, timestamp: { a: 1 } }, now).ok).toBe(false);
  });

  test('validateLocation accepts a good report and defaults the time to now', () => {
    const r = ws.validateLocation(base, now);
    expect(r.ok).toBe(true);
    expect(r.value.recordedAt).toBe(now);
  });

  test('a socket can sit in several trip rooms and leaves them all on disconnect', async () => {
    const sock = fakeWs();
    mockPrisma.trip.findUnique.mockImplementation(async ({ where }) => ({ id: where.id, driverId: 'd1', shipment: { cargoOwnerId: 'o1' } }));
    await ws.handleTrackingMessage(sock, msg({ action: 'JOIN_TRIP', tripId: 't1' }), drv);
    await ws.handleTrackingMessage(sock, msg({ action: 'JOIN_TRIP', tripId: 't2' }), drv);
    expect([...sock.tripIds].sort()).toEqual(['t1', 't2']);
    await ws.handleTrackingMessage(sock, msg({ action: 'LEAVE_TRIP', tripId: 't1' }), drv);
    expect([...sock.tripIds]).toEqual(['t2']);
    ws.handleClientDisconnect(sock);
    expect(sock.tripIds.size).toBe(0);
  });

  test('a stranger cannot join a trip room', async () => {
    const sock = fakeWs();
    mockPrisma.trip.findUnique.mockResolvedValue({ id: 't1', driverId: 'd1', shipment: { cargoOwnerId: 'o1' } });
    await ws.handleTrackingMessage(sock, msg({ action: 'JOIN_TRIP', tripId: 't1' }), { id: 'x', role: 'CARGO_OWNER' });
    expect(sock.sent[0].event).toBe('ERROR');
    expect(sock.tripIds).toBeUndefined();
  });

  test('LOCATION_UPDATE with zero or missing accuracy is rejected before touching the database', async () => {
    const sock = fakeWs();
    await ws.handleTrackingMessage(sock, msg({ action: 'LOCATION_UPDATE', tripId: 't1', latitude: 1, longitude: 1, accuracy: 0 }), drv);
    await ws.handleTrackingMessage(sock, msg({ action: 'LOCATION_UPDATE', tripId: 't1', latitude: 1, longitude: 1 }), drv);
    expect(sock.sent.map((m) => m.event)).toEqual(['ERROR', 'ERROR']);
    expect(mockPrisma.tripPosition.create).not.toHaveBeenCalled();
  });

  test('non-object payloads and non-string tripId are ignored or rejected', async () => {
    const sock = fakeWs();
    await ws.handleTrackingMessage(sock, '[]', drv);
    await ws.handleTrackingMessage(sock, msg({ action: 'JOIN_TRIP', tripId: { $ne: 1 } }), drv);
    expect(sock.sent).toHaveLength(1);
    expect(mockPrisma.trip.findUnique).not.toHaveBeenCalled();
  });
});

describe('C-30 status and sync endpoints', () => {
  test('schemas bound batch size and reject bad dates / zero accuracy', () => {
    const pos = { latitude: 1, longitude: 1, accuracy: 5, timestamp: new Date().toISOString() };
    expect(batchPositionsSyncSchema.safeParse({ positions: Array(500).fill(pos) }).success).toBe(true);
    expect(batchPositionsSyncSchema.safeParse({ positions: Array(501).fill(pos) }).success).toBe(false);
    expect(batchPositionsSyncSchema.safeParse({ positions: [{ ...pos, timestamp: 'nope' }] }).success).toBe(false);
    expect(batchPositionsSyncSchema.safeParse({ positions: [{ ...pos, accuracy: 0 }] }).success).toBe(false);
    const upd = { status: 'REACHED_PICKUP', timestamp: new Date().toISOString() };
    expect(batchStatusSyncSchema.safeParse({ statusUpdates: Array(21).fill(upd) }).success).toBe(false);
    expect(updateTripStatusSchema.safeParse({ status: 'REACHED_PICKUP', timestamp: 'x' }).success).toBe(false);
  });

  test('updateTripStatus clamps a forged past timestamp to the last log and a future one to now', async () => {
    const last = new Date(Date.now() - 3600e3);
    mockPrisma.trip.findUnique.mockResolvedValue({ id: 't1', driverId: 'd1', shipmentId: 's1', startedAt: null, shipment: { status: 'BOOKED' }, vehicle: {} });
    mockPrisma.tripStatusLog.findFirst.mockResolvedValue({ timestamp: last });
    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.trip.update.mockResolvedValue({});
    mockPrisma.tripStatusLog.create.mockResolvedValue({});

    await run(driver.updateTripStatus, { user: drv, params: { id: 't1' }, body: { status: 'REACHED_PICKUP', timestamp: '2020-01-01T00:00:00Z' } });
    expect(mockPrisma.tripStatusLog.create.mock.calls[0][0].data.timestamp).toEqual(last);

    mockPrisma.tripStatusLog.create.mockClear();
    const before = Date.now();
    await run(driver.updateTripStatus, { user: drv, params: { id: 't1' }, body: { status: 'REACHED_PICKUP', timestamp: '2999-01-01T00:00:00Z' } });
    const t = mockPrisma.tripStatusLog.create.mock.calls[0][0].data.timestamp.getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now());
  });

  test('syncOfflinePositions drops duplicates, future, pre-trip and low-accuracy points, and stored times', async () => {
    const created = new Date(Date.now() - 7200e3);
    const t1 = new Date(Date.now() - 3000e3).toISOString();
    const t2 = new Date(Date.now() - 2000e3).toISOString();
    const t3 = new Date(Date.now() - 1000e3).toISOString();
    mockPrisma.trip.findUnique.mockResolvedValue({ id: 't1', driverId: 'd1', createdAt: created });
    mockPrisma.tripPosition.findMany.mockResolvedValue([{ recordedAt: new Date(t3) }]);
    mockPrisma.tripPosition.createMany.mockResolvedValue({ count: 2 });
    const p = (timestamp, extra = {}) => ({ latitude: 1, longitude: 1, accuracy: 5, timestamp, ...extra });
    const res = await run(driver.syncOfflinePositions, {
      user: drv, params: { id: 't1' },
      body: { positions: [
        p(t1), p(t1), p(t2), p(t3),
        p(new Date(Date.now() + 3600e3).toISOString()),
        p(new Date(created.getTime() - 1000).toISOString()),
        p(new Date(Date.now() - 500e3).toISOString(), { accuracy: 500 }),
      ] },
    });
    const rows = mockPrisma.tripPosition.createMany.mock.calls[0][0].data;
    expect(rows.map((r) => r.recordedAt.toISOString())).toEqual([t1, t2]);
    expect(res.body.data.syncedCount).toBe(2);
    expect(res.body.data.skippedCount).toBe(5);
  });
});

describe('C-35 auto-complete job', () => {
  const ship = (id, trip = { driverId: 'd1', vehicleId: 'v1' }) => ({ id, shipmentNumber: id, cargoOwnerId: 'o1', trip });

  test('query skips shipments with open complaints', async () => {
    mockPrisma.shipment.findMany.mockResolvedValue([]);
    await runAutoCompleteShipments();
    expect(mockPrisma.shipment.findMany.mock.calls[0][0].where.complaints).toEqual({ none: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } });
  });

  test('a null trip does not abort the batch and the others still complete', async () => {
    mockPrisma.shipment.findMany.mockResolvedValue([ship('a', null), ship('b')]);
    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 1 });
    await runAutoCompleteShipments();
    expect(mockPrisma.shipment.updateMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.update.mock.calls[0][0].where.id).toBe('d1');
  });

  test('one failing shipment does not stop the next', async () => {
    mockPrisma.shipment.findMany.mockResolvedValue([ship('a'), ship('b')]);
    mockPrisma.shipment.updateMany.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ count: 1 });
    await runAutoCompleteShipments();
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
  });

  test('if the owner already confirmed (no row moved) nothing is counted or notified', async () => {
    mockPrisma.shipment.findMany.mockResolvedValue([ship('a')]);
    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 0 });
    await runAutoCompleteShipments();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(dispatchNotification).not.toHaveBeenCalled();
  });
});

describe('C-36 tracking interruption job', () => {
  test('query also catches trips that never reported a position', async () => {
    mockPrisma.trip.findMany.mockResolvedValue([]);
    await runTrackingInterruptionCheck();
    const where = mockPrisma.trip.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { lastPositionAt: { lte: expect.any(Date) } },
      { lastPositionAt: null, updatedAt: { lte: expect.any(Date) } },
    ]);
  });

  test('overlapping runs are skipped', async () => {
    let release;
    mockPrisma.trip.findMany.mockImplementation(() => new Promise((r) => { release = () => r([]); }));
    const first = runTrackingInterruptionCheck();
    await runTrackingInterruptionCheck();
    expect(mockPrisma.trip.findMany).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  test('a trip flagged by someone else in the meantime is not notified again', async () => {
    mockPrisma.trip.findMany.mockResolvedValue([{ id: 't1', shipmentId: 's1', shipment: { cargoOwnerId: 'o1', shipmentNumber: 'N' } }]);
    mockPrisma.trip.updateMany.mockResolvedValue({ count: 0 });
    await runTrackingInterruptionCheck();
    expect(dispatchNotification).not.toHaveBeenCalled();
  });
});

describe('C-51 notification retry job', () => {
  test('the no-op job is no longer scheduled', () => {
    const idx = fs.readFileSync(path.join(__dirname, '../../src/jobs/index.js'), 'utf8');
    expect(idx).not.toMatch(/notificationRetry/);
    expect(fs.existsSync(path.join(__dirname, '../../src/jobs/notificationRetry.job.js'))).toBe(false);
  });
});

describe('C-53 verification queue', () => {
  test('submittedAt is the last document upload, oldest submission first, and the list is paginated', async () => {
    const d = (s) => new Date(s);
    const u = (id, created, docs) => ({ id, name: id, role: 'DRIVER', phone: '1', email: id, createdAt: d(created), documents: docs.map((x) => ({ createdAt: d(x) })), driverVehicle: null, fleetVehicles: [] });
    mockPrisma.user.findMany.mockResolvedValue([
      u('late', '2026-01-01', ['2026-03-10', '2026-03-12']),
      u('early', '2026-02-01', ['2026-02-02']),
      u('nodocs', '2026-02-20', []),
    ]);
    const res = await run(admin.getVerificationQueue, { query: { page: '1', limit: '2' } });
    expect(res.body.data.map((x) => x.id)).toEqual(['early', 'nodocs']);
    expect(res.body.data[0].submittedAt).toEqual(d('2026-02-02'));
    expect(res.body.pagination.totalRecords).toBe(3);
    const p2 = await run(admin.getVerificationQueue, { query: { page: '2', limit: '2' } });
    expect(p2.body.data.map((x) => x.id)).toEqual(['late']);
    expect(p2.body.data[0].submittedAt).toEqual(d('2026-03-12'));
  });
});

describe('C-33 lists omit routePolyline', () => {
  test('the shipment list sources exclude it', () => {
    for (const f of ['modules/cargo-owner/cargoOwner.controller.js', 'modules/admin/admin.controller.js', 'modules/matching/matching.service.js']) {
      expect(fs.readFileSync(path.join(__dirname, '../../src', f), 'utf8')).toMatch(/omit: \{ routePolyline: true \}/);
    }
  });
});
