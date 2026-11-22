/**
 * SRS Chapter 6 plan, second API suite: rows that were only partly covered by srs_api.test.js
 * plus the fleet, job, retention, reporting and integration rows.
 * Each test names the plan ID first. Real Express app, real PostgreSQL database.
 */
jest.mock('../../src/middleware/rateLimiter.middleware', () => {
  const pass = (req, res, next) => next();
  return { apiLimiter: pass, authLimiter: pass };
});

const {
  ctx, app, prisma, request, API, auth, hoursAhead, register, uploadDoc, verify, giveVehicle, verifiedDriver,
  newShipment, bid, accept, bookedJob, setStatus, deliver, confirm, rnd,
} = require('./srsHelpers');
const { runDocumentExpiryCheck } = require('../../src/jobs/documentExpiry.job');
const { runAutoCompleteShipments } = require('../../src/jobs/autoCompleteShipments.job');
const { runTrackingRetentionCleanup } = require('../../src/jobs/trackingRetention.job');
const { runTrackingInterruptionCheck } = require('../../src/jobs/trackingInterruption.job');

jest.setTimeout(120000);

let adminToken;
const days = (n) => new Date(Date.now() - n * 24 * 3600 * 1000);
const hoursAgo = (n) => new Date(Date.now() - n * 3600 * 1000);
const items = (res) => {
  const d = res.body && res.body.data;
  if (Array.isArray(d)) return d;
  const arr = d && Object.values(d).find(Array.isArray);
  return arr || [];
};
const notes = async (token) => JSON.stringify((await request(app).get(`${API}/notifications`).set(auth(token))).body);
const until = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
};
// Other vehicles in the test database would compete for the top-10 notification places, so they are made Inactive for this test
const retireOldTestVehicles = (keepIds) =>
  prisma.vehicle.updateMany({
    where: { id: { notIn: keepIds } },
    data: { availabilityStatus: 'INACTIVE' },
  });
const complaint = (owner, shipmentId, category = 'DELAY', description = 'Cargo arrived late') =>
  request(app).post(`${API}/complaints`).set(auth(owner.token)).send({ shipmentId, category, description });

beforeAll(async () => {
  const res = await request(app)
    .post(`${API}/auth/login`)
    .send({ identifier: 'admin@smarthaul.pk', password: 'SmartHaul@Admin2026!', role: 'ADMIN' });
  expect(res.status).toBe(200);
  adminToken = res.body.data.token;
  ctx.adminToken = adminToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Access, suspension and expiry', () => {
  test('FT-05: role matrix; unauthenticated 401, and each role refused on the other roles\' routes (403)', async () => {
    const owner = await register('CARGO_OWNER', 'm5o');
    const driver = await register('DRIVER', 'm5d');
    const fleet = await register('FLEET_OWNER', 'm5f');
    const unauth = ['/users/me', '/shipments', '/driver/active-trip', '/fleet/vehicles', '/admin/users', '/payments',
      '/notifications', '/analytics/platform-summary', '/tracking/shipment/x', '/messages/shipment/x'];
    for (const p of unauth) expect([p, (await request(app).get(`${API}${p}`)).status]).toEqual([p, 401]);

    const refused = {
      owner: [owner, ['/fleet/vehicles', '/admin/users', '/analytics/platform-summary', '/driver/matched-shipments']],
      driver: [driver, ['/shipments', '/fleet/vehicles', '/admin/users', '/analytics/route-demand']],
      fleet: [fleet, ['/shipments', '/admin/users', '/analytics/platform-summary']],
    };
    for (const [role, [user, paths]] of Object.entries(refused)) {
      for (const p of paths) {
        const status = (await request(app).get(`${API}${p}`).set(auth(user.token))).status;
        expect([role, p, status]).toEqual([role, p, 403]);
      }
    }
  });

  test('FT-07: suspension ends the driver\'s session mid-trip (R-06, FR-AD-5 as amended in R-40) and bids are refused', async () => {
    const job = await bookedJob();
    expect((await setStatus(job.driver, job.trip.id, 'REACHED_PICKUP')).status).toBe(200);
    const susp = await request(app)
      .post(`${API}/admin/users/${job.driver.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'SUSPENDED', reason: 'SRS test suspension mid-trip' });
    expect(susp.status).toBe(200);
    const next = await setStatus(job.driver, job.trip.id, 'CARGO_LOADED');
    expect(next.status).toBe(401);
    expect(await prisma.trip.count({ where: { id: job.trip.id } })).toBe(1);
    const owner2 = await register('CARGO_OWNER', 'ft07o');
    expect((await bid(job.driver, await newShipment(owner2))).status).toBeGreaterThanOrEqual(400);
  });

  test('FT-08: a document past its expiry date moves the account to Pending, notifies the user and blocks bidding', async () => {
    const driver = await verifiedDriver('ft08');
    const owner = await register('CARGO_OWNER', 'ft08o');
    const shipmentId = await newShipment(owner);
    await prisma.verificationDocument.updateMany({ where: { userId: driver.id }, data: { expiryDate: days(1) } });
    await runDocumentExpiryCheck();
    expect((await prisma.user.findUnique({ where: { id: driver.id } })).accountStatus).toBe('PENDING');
    expect(await notes(driver.token)).toContain('Document Expired');
    expect((await bid(driver, shipmentId)).status).toBeGreaterThanOrEqual(400);
  });
});

describe('Matching, fleet and completion', () => {
  test('FT-10: only the eligible driver sees and is notified of a load; suspended and unavailable vehicles are excluded', async () => {
    const owner = await register('CARGO_OWNER', 'ft10o');
    const eligible = await verifiedDriver('ft10a');
    const suspended = await verifiedDriver('ft10s');
    const parked = await verifiedDriver('ft10u');
    await prisma.user.update({ where: { id: suspended.id }, data: { accountStatus: 'SUSPENDED' } });
    await prisma.vehicle.update({ where: { id: parked.vehicle.id }, data: { availabilityStatus: 'UNDER_MAINTENANCE' } });
    await retireOldTestVehicles([eligible.vehicle.id, suspended.vehicle.id, parked.vehicle.id]);
    const t0 = Date.now();
    const shipmentId = await newShipment(owner);
    const told = await until(async () => (await notes(eligible.token)).includes(shipmentId));
    expect(told).toBe(true);
    expect(Date.now() - t0).toBeLessThan(10000);
    const seen = async (d) => JSON.stringify((await request(app).get(`${API}/driver/matched-shipments`).set(auth(d.token))).body).includes(shipmentId);
    expect(await seen(eligible)).toBe(true);
    expect(await seen(parked)).toBe(false);
    expect(await notes(parked.token)).not.toContain(shipmentId);
    expect(await notes(suspended.token)).not.toContain(shipmentId);
  });

  test('FT-14: fleet register; duplicate and out-of-range vehicles and repeat invitations are refused; an assigned vehicle cannot be removed', async () => {
    const fleet = await register('FLEET_OWNER', 'ft14');
    await verify(fleet);
    const reg = `SRS-${rnd()}`;
    const v = { registrationNumber: reg, vehicleType: 'OPEN_BODY', ratedCapacity: 2.5, model: 'Hino', year: 2020 };
    const add = await request(app).post(`${API}/fleet/vehicles`).set(auth(fleet.token)).send(v);
    expect(add.status).toBeLessThan(300);
    const dup = await request(app).post(`${API}/fleet/vehicles`).set(auth(fleet.token)).send(v);
    expect(dup.status).toBeGreaterThanOrEqual(400);
    expect(dup.status).toBeLessThan(500);
    const big = await request(app).post(`${API}/fleet/vehicles`).set(auth(fleet.token)).send({ ...v, registrationNumber: `SRS-${rnd()}`, ratedCapacity: 500 });
    expect(big.status).toBe(422);

    const driver = await verifiedDriver('ft14d');
    const invite = (id) => request(app).post(`${API}/fleet/drivers`).set(auth(fleet.token)).send({ driverId: id });
    expect(['unverified', (await invite((await register('DRIVER', 'ft14u')).id)).status]).toEqual(['unverified', 422]);
    expect((await invite(driver.id)).status).toBeLessThan(300);
    expect((await invite(driver.id)).status).toBe(409);
    const link = await prisma.driverFleetLink.findFirst({ where: { fleetOwnerId: fleet.id, driverId: driver.id } });
    const acc = await request(app).post(`${API}/driver/fleet-invitations/${link.id}/accept`).set(auth(driver.token));
    expect(acc.status).toBeLessThan(300);
    const mine = await request(app).get(`${API}/fleet/drivers`).set(auth(fleet.token));
    expect(JSON.stringify(mine.body)).toContain(driver.id);

    const vehicleId = (await prisma.vehicle.findFirst({ where: { ownerId: fleet.id } })).id;
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { availabilityStatus: 'ASSIGNED' } });
    const del = await request(app).delete(`${API}/fleet/vehicles/${vehicleId}`).set(auth(fleet.token));
    expect(del.status).toBe(400);
  });

  test('FT-21: a delivered shipment untouched for 72 hours is completed automatically and flagged', async () => {
    const job = await bookedJob();
    await deliver(job);
    await prisma.shipment.update({ where: { id: job.shipmentId }, data: { deliveredAt: hoursAgo(80) } });
    await runAutoCompleteShipments();
    const s = await prisma.shipment.findUnique({ where: { id: job.shipmentId } });
    expect(s.status).toBe('COMPLETED');
    expect(s.autoCompletedAt).not.toBeNull();
  });

  test('BRT-07: with an open complaint the same shipment is not completed; once resolved the job completes it', async () => {
    const job = await bookedJob();
    await deliver(job);
    const c = await complaint(job.owner, job.shipmentId);
    expect(c.status).toBe(201);
    await prisma.shipment.update({ where: { id: job.shipmentId }, data: { deliveredAt: hoursAgo(80) } });
    await runAutoCompleteShipments();
    expect((await prisma.shipment.findUnique({ where: { id: job.shipmentId } })).status).toBe('DELIVERED');
    await request(app).post(`${API}/admin/complaints/${c.body.data.id}/resolve`).set(auth(adminToken))
      .send({ decision: 'RESOLVED', adminRemarks: 'Resolved in the SRS test' });
    await runAutoCompleteShipments();
    expect((await prisma.shipment.findUnique({ where: { id: job.shipmentId } })).status).toBe('COMPLETED');
  });

  test('FT-27: a second identical complaint on the same shipment is refused', async () => {
    const job = await bookedJob();
    await deliver(job);
    expect((await complaint(job.owner, job.shipmentId)).status).toBe(201);
    const again = await complaint(job.owner, job.shipmentId);
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(again.status).toBeLessThan(500);
  });

  test('FT-34: messaging works while the shipment is active and is closed once it is Completed', async () => {
    const job = await bookedJob();
    const send = (who, content) => request(app).post(`${API}/messages/shipment/${job.shipmentId}`).set(auth(who.token)).send({ content });
    expect((await send(job.owner, 'Before delivery')).status).toBeLessThan(300);
    await deliver(job);
    await confirm(job.owner, job.shipmentId);
    const late = await send(job.owner, 'After completion');
    expect(late.status).toBe(400);
    const read = await request(app).get(`${API}/messages/shipment/${job.shipmentId}`).set(auth(job.driver.token));
    expect(JSON.stringify(read.body)).toContain('Before delivery');
  });

  test('FT-35: a notification marked read stays read when the list is opened again', async () => {
    const job = await bookedJob();
    const list = await request(app).get(`${API}/notifications`).set(auth(job.driver.token));
    const first = items(list)[0];
    expect(first.isRead).toBe(false);
    expect((await request(app).put(`${API}/notifications/${first.id}/read`).set(auth(job.driver.token))).status).toBe(200);
    const again = items(await request(app).get(`${API}/notifications`).set(auth(job.driver.token))).find((n) => n.id === first.id);
    expect(again.isRead).toBe(true);
  });

  test('FT-41: the shipment history filter returns only shipments in the requested status', async () => {
    const job = await bookedJob();
    const pendingId = await newShipment(job.owner);
    const get = (q) => request(app).get(`${API}/shipments?${q}`).set(auth(job.owner.token));
    const booked = items(await get('status=BOOKED'));
    expect(booked.map((s) => s.id)).toContain(job.shipmentId);
    expect(booked.every((s) => s.status === 'BOOKED')).toBe(true);
    const pending = items(await get('status=PENDING'));
    expect(pending.map((s) => s.id)).toContain(pendingId);
    expect(pending.every((s) => s.status === 'PENDING')).toBe(true);
  });
});

describe('Tracking retention and interruption', () => {
  const positions = (job, n = 5) =>
    prisma.tripPosition.createMany({
      data: Array.from({ length: n }, (_, i) => ({
        tripId: job.trip.id, driverId: job.driver.id, latitude: 31.47 + i * 0.1, longitude: 74.24 - i * 0.1,
        accuracy: 10, recordedAt: new Date(Date.now() - (n - i) * 60000),
      })),
    });

  test('FT-22 and BRT-12: after 91 days the position detail is deleted and the route summary is kept; history is supplied before that', async () => {
    const job = await bookedJob();
    await deliver(job);
    await confirm(job.owner, job.shipmentId);
    await positions(job);
    const hist = await request(app).get(`${API}/tracking/trip/${job.trip.id}/history`).set(auth(job.owner.token));
    expect(hist.status).toBe(200);
    await prisma.shipment.update({ where: { id: job.shipmentId }, data: { updatedAt: days(91) } });
    await runTrackingRetentionCleanup();
    expect(await prisma.tripPosition.count({ where: { tripId: job.trip.id } })).toBe(0);
    expect(await prisma.routeSummary.findUnique({ where: { tripId: job.trip.id } })).not.toBeNull();
  });

  test('BRT-12: position detail is kept at 91 days while a complaint is open (BR-17)', async () => {
    const job = await bookedJob();
    await deliver(job);
    await confirm(job.owner, job.shipmentId);
    await positions(job);
    expect((await complaint(job.owner, job.shipmentId)).status).toBe(201);
    await prisma.shipment.update({ where: { id: job.shipmentId }, data: { updatedAt: days(91) } });
    await runTrackingRetentionCleanup();
    expect(await prisma.tripPosition.count({ where: { tripId: job.trip.id } })).toBe(5);
  });

  test('BRT-12: a position reported after the trip finished is discarded, not stored (BR-16)', async () => {
    const job = await bookedJob();
    await deliver(job);
    const res = await request(app)
      .post(`${API}/driver/trips/${job.trip.id}/positions/batch-sync`)
      .set(auth(job.driver.token))
      .send({ positions: [{ latitude: 33.6, longitude: 73.0, accuracy: 10, timestamp: new Date().toISOString() }] });
    expect(res.status).toBe(200);
    expect(res.body.data.syncedCount).toBe(0);
    expect(await prisma.tripPosition.count({ where: { tripId: job.trip.id } })).toBe(0);
  });

  test('IT-04: a trip in transit with no position for 3 minutes is flagged once and the cargo owner gets one notice', async () => {
    const job = await bookedJob();
    for (const s of ['REACHED_PICKUP', 'CARGO_LOADED', 'IN_TRANSIT']) expect((await setStatus(job.driver, job.trip.id, s)).status).toBe(200);
    await prisma.trip.update({ where: { id: job.trip.id }, data: { lastPositionAt: new Date(Date.now() - 180000) } });
    await runTrackingInterruptionCheck();
    await runTrackingInterruptionCheck();
    expect((await prisma.trip.findUnique({ where: { id: job.trip.id } })).isInterrupted).toBe(true);
    const text = await notes(job.owner.token);
    expect(text.split('Live Tracking Interrupted').length - 1).toBe(1);
  });
});

describe('Reports, export and integration', () => {
  test('FT-36: the administrator summary counts equal the database counts', async () => {
    const res = await request(app).get(`${API}/analytics/platform-summary`).set(auth(adminToken));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.users.cargoOwners).toBe(await prisma.user.count({ where: { role: 'CARGO_OWNER' } }));
    expect(d.users.drivers).toBe(await prisma.user.count({ where: { role: 'DRIVER' } }));
    expect(d.users.fleetOwners).toBe(await prisma.user.count({ where: { role: 'FLEET_OWNER' } }));
    expect(d.vehicles.total).toBe(await prisma.vehicle.count());
    expect(d.shipments.completedDeliveries).toBe(await prisma.shipment.count({ where: { status: 'COMPLETED' } }));
    expect(d.complaints.open).toBe(await prisma.complaint.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }));
  });

  test('FT-29: the administrator shipment filter returns only the requested status and includes a known delivered shipment', async () => {
    const job = await bookedJob();
    await deliver(job);
    const res = await request(app).get(`${API}/admin/shipments?status=DELIVERED&limit=100`).set(auth(adminToken));
    expect(res.status).toBe(200);
    const list = items(res);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.status === 'DELIVERED')).toBe(true);
    expect(list.map((s) => s.id)).toContain(job.shipmentId);
  });

  test('FT-38: the administrator export returns a CSV of shipments; other roles and unknown report types are refused', async () => {
    const ok = await request(app).get(`${API}/analytics/export?reportType=shipments`).set(auth(adminToken));
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('text/csv');
    expect(ok.text).toContain('Shipment Number');
    expect((await request(app).get(`${API}/analytics/export?reportType=nothing`).set(auth(adminToken))).status).toBe(400);
    const fleet = await register('FLEET_OWNER', 'ft38');
    expect((await request(app).get(`${API}/analytics/export?reportType=shipments`).set(auth(fleet.token))).status).toBe(403);
  });

  test('FT-39: a fleet owner sees only their own utilisation and driver reports', async () => {
    const fleet = await register('FLEET_OWNER', 'ft39');
    await verify(fleet);
    const v = await giveVehicle(fleet.id);
    const other = await verifiedDriver('ft39o');
    const util = await request(app).get(`${API}/fleet/reports/vehicle-utilization`).set(auth(fleet.token));
    expect(util.status).toBe(200);
    const text = JSON.stringify(util.body);
    expect(text).toContain(v.id);
    expect(text).not.toContain(other.vehicle.id);
    expect((await request(app).get(`${API}/fleet/reports/driver-performance`).set(auth(fleet.token))).status).toBe(200);
  });

  test('IT-01: a shipment with ten eligible drivers reaches all ten (matched list and notice) within 10 seconds', async () => {
    const owner = await register('CARGO_OWNER', 'it01');
    const drivers = [];
    for (let i = 0; i < 10; i += 1) drivers.push(await verifiedDriver(`it01d${i}`));
    await retireOldTestVehicles(drivers.map((d) => d.vehicle.id));
    const t0 = Date.now();
    const shipmentId = await newShipment(owner);
    const all = await until(async () => {
      const r = await Promise.all(drivers.map(async (d) => (await notes(d.token)).includes(shipmentId)));
      return r.every(Boolean);
    });
    expect(all).toBe(true);
    expect(Date.now() - t0).toBeLessThan(10000);
    for (const d of drivers) {
      const m = await request(app).get(`${API}/driver/matched-shipments`).set(auth(d.token));
      expect(JSON.stringify(m.body)).toContain(shipmentId);
    }
  });

  test('IT-02: a failure part-way through bid acceptance leaves no partial state', async () => {
    const owner = await register('CARGO_OWNER', 'it02');
    const driver = await verifiedDriver('it02');
    const shipmentId = await newShipment(owner);
    const b = (await bid(driver, shipmentId)).body.data;
    // A payment record already exists, so the insert inside the acceptance transaction fails after earlier steps ran
    await prisma.paymentRecord.create({ data: { shipmentId, cargoOwnerId: owner.id, agreedFare: 1 } });
    const res = await accept(owner, shipmentId, b);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await prisma.shipment.findUnique({ where: { id: shipmentId } })).status).toBe('PENDING');
    expect((await prisma.bid.findUnique({ where: { id: b.id } })).status).not.toBe('ACCEPTED');
    expect(await prisma.trip.findUnique({ where: { shipmentId } })).toBeNull();
  });
});
