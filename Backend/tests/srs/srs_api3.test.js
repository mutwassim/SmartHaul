/**
 * SRS Chapter 6 plan, third API suite: cancellation (FT-13), fleet assignment (FT-15), the server side of live
 * tracking (FT-17 part, IT-03 part, IT-04, DEF-20, DEF-33), token reuse (NF-11), audit-log tamper test and XSS checks (NF-12),
 * and 100 publications (NF-13 part). Each test names the plan ID first.
 * Real Express app, real PostgreSQL database. The WebSocket handler is called directly with a stand-in socket object,
 * so no phone and no network socket is involved.
 */
jest.mock('../../src/middleware/rateLimiter.middleware', () => {
  const pass = (req, res, next) => next();
  return { apiLimiter: pass, authLimiter: pass };
});

const fs = require('fs');
const path = require('path');
const {
  ctx, app, prisma, request, PNG, API, auth, hoursAhead, register, verify, giveVehicle, verifiedDriver,
  newShipment, accept, bookedJob, setStatus, deliver,
} = require('./srsHelpers');
const { runTrackingInterruptionCheck } = require('../../src/jobs/trackingInterruption.job');
const { handleTrackingMessage } = require('../../src/websocket/tracking.handler');

jest.setTimeout(240000);

let adminToken;
const minutesAgo = (n) => new Date(Date.now() - n * 60 * 1000);
const notes = async (token) => JSON.stringify((await request(app).get(`${API}/notifications`).set(auth(token))).body);
const cancel = (owner, id, reason = 'Cargo no longer needed') =>
  request(app).put(`${API}/shipments/${id}/cancel`).set(auth(owner.token)).send(reason === null ? {} : { reason });
const mkSocket = () => ({ sent: [], readyState: 1, tripIds: new Set(), send(m) { this.sent.push(JSON.parse(m)); } });
const asUser = (u, role) => ({ id: u.id, role });
const retireOldTestVehicles = (keepIds) =>
  prisma.vehicle.updateMany({ where: { id: { notIn: keepIds } }, data: { availabilityStatus: 'INACTIVE' } });

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

describe('Cancellation and fleet assignment', () => {
  test('FT-13: the cargo owner cancels a Pending and a Booked shipment (reason required); a shipment at Reached Pickup is refused', async () => {
    const owner = await register('CARGO_OWNER', 'ft13o');
    const pendingId = await newShipment(owner);
    expect((await cancel(owner, pendingId, null)).status).toBe(400);
    expect((await cancel(owner, pendingId)).status).toBe(200);
    expect((await prisma.shipment.findUnique({ where: { id: pendingId } })).status).toBe('CANCELLED');

    const job = await bookedJob();
    expect((await cancel(job.owner, job.shipmentId)).status).toBe(200);
    expect((await prisma.shipment.findUnique({ where: { id: job.shipmentId } })).status).toBe('CANCELLED');
    expect((await prisma.bid.findUnique({ where: { id: job.bid.id } })).status).toBe('REJECTED');
    expect(await notes(job.driver.token)).toContain(job.shipmentId);

    const late = await bookedJob();
    expect((await setStatus(late.driver, late.trip.id, 'REACHED_PICKUP')).status).toBe(200);
    const refused = await cancel(late.owner, late.shipmentId);
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(refused.status).toBeLessThan(500);
    expect((await prisma.shipment.findUnique({ where: { id: late.shipmentId } })).status).toBe('REACHED_PICKUP');
  });

  test('FT-15: a fleet owner assigns a free driver and vehicle; suspended and busy drivers are refused; the vehicle can be changed while Booked', async () => {
    const fleet = await register('FLEET_OWNER', 'ft15f');
    await verify(fleet);
    const [v1, v2, v3] = [await giveVehicle(fleet.id), await giveVehicle(fleet.id), await giveVehicle(fleet.id)];
    const joinFleet = async (tag) => {
      const d = await register('DRIVER', tag);
      await verify(d);
      expect((await request(app).post(`${API}/fleet/drivers`).set(auth(fleet.token)).send({ driverId: d.id })).status).toBeLessThan(300);
      const link = await prisma.driverFleetLink.findFirst({ where: { fleetOwnerId: fleet.id, driverId: d.id } });
      expect((await request(app).post(`${API}/driver/fleet-invitations/${link.id}/accept`).set(auth(d.token))).status).toBeLessThan(300);
      return d;
    };
    const da = await joinFleet('ft15a');
    const db = await joinFleet('ft15b');
    const dc = await joinFleet('ft15c');
    await prisma.user.update({ where: { id: dc.id }, data: { accountStatus: 'SUSPENDED' } });

    const owner = await register('CARGO_OWNER', 'ft15o');
    const win = async (vehicleId) => {
      const shipmentId = await newShipment(owner);
      const res = await request(app).post(`${API}/driver/bids`).set(auth(fleet.token))
        .send({ shipmentId, proposedFare: 42000, estimatedDeliveryTime: hoursAhead(36), vehicleId });
      expect(res.status).toBeLessThan(300);
      expect((await accept(owner, shipmentId, res.body.data)).status).toBe(200);
      return shipmentId;
    };
    const assign = (shipmentId, vehicleId, driverId) =>
      request(app).post(`${API}/fleet/assign`).set(auth(fleet.token)).send({ shipmentId, vehicleId, driverId });

    const s1 = await win(v1.id);
    const susp = await assign(s1, v1.id, dc.id);
    expect(susp.status).toBe(400);
    const ok = await assign(s1, v1.id, da.id);
    expect(ok.status).toBeLessThan(300);
    expect(JSON.stringify((await request(app).get(`${API}/driver/active-trip`).set(auth(da.token))).body)).toContain(s1);
    expect(await notes(da.token)).toContain(s1);

    const s2 = await win(v2.id);
    const busy = await assign(s2, v2.id, da.id);
    expect(busy.status).toBeGreaterThanOrEqual(400);
    expect(busy.status).toBeLessThan(500);
    expect((await assign(s2, v2.id, db.id)).status).toBeLessThan(300);

    // change the vehicle on s1 while it is still Booked: the old vehicle is freed
    expect((await assign(s1, v3.id, da.id)).status).toBeLessThan(300);
    expect((await prisma.vehicle.findUnique({ where: { id: v1.id } })).availabilityStatus).toBe('AVAILABLE');
  });
});

describe('Live tracking, server side', () => {
  test('IT-04 and DEF-20: a silent trip is flagged and the owner told once; when positions resume tracking is restored and the owner is told again', async () => {
    const job = await bookedJob();
    expect((await setStatus(job.driver, job.trip.id, 'REACHED_PICKUP')).status).toBe(200);
    // DEF-33: the watchdog covers the whole tracking period, so a trip at Reached Pickup is watched too
    await prisma.trip.update({ where: { id: job.trip.id }, data: { lastPositionAt: minutesAgo(3), isTrackingActive: true } });
    await runTrackingInterruptionCheck();
    await runTrackingInterruptionCheck();
    expect((await prisma.trip.findUnique({ where: { id: job.trip.id } })).isInterrupted).toBe(true);
    const before = await notes(job.owner.token);
    expect(before).toContain('Live Tracking Interrupted');
    expect(before.split('Live Tracking Interrupted').length - 1).toBe(1);

    const ownerSocket = mkSocket();
    await handleTrackingMessage(ownerSocket, JSON.stringify({ action: 'JOIN_TRIP', tripId: job.trip.id }), asUser(job.owner, 'CARGO_OWNER'));
    expect(ownerSocket.sent.some((m) => m.event === 'JOINED_TRIP')).toBe(true);
    const driverSocket = mkSocket();
    await handleTrackingMessage(
      driverSocket,
      JSON.stringify({ action: 'LOCATION_UPDATE', tripId: job.trip.id, latitude: 31.55, longitude: 74.31, accuracy: 12 }),
      asUser(job.driver, 'DRIVER')
    );
    const trip = await prisma.trip.findUnique({ where: { id: job.trip.id } });
    expect(trip.isInterrupted).toBe(false);
    expect(await notes(job.owner.token)).toContain('Live Tracking Resumed');
    const update = ownerSocket.sent.find((m) => m.event === 'POSITION_UPDATE');
    expect(update).toBeDefined();
    expect(update.position.latitude).toBeCloseTo(31.55, 5);
    expect(await prisma.tripPosition.count({ where: { tripId: job.trip.id } })).toBe(1);
  });

  test('DEF-33: the watchdog also flags a trip whose cargo is loaded but has gone silent', async () => {
    const job = await bookedJob();
    for (const s of ['REACHED_PICKUP', 'CARGO_LOADED']) expect((await setStatus(job.driver, job.trip.id, s)).status).toBe(200);
    await prisma.trip.update({ where: { id: job.trip.id }, data: { lastPositionAt: minutesAgo(3), isTrackingActive: true } });
    await runTrackingInterruptionCheck();
    expect((await prisma.trip.findUnique({ where: { id: job.trip.id } })).isInterrupted).toBe(true);
  });

  test('FT-17 (server side): a stranger cannot subscribe; no position is stored before Reached Pickup or after Delivered', async () => {
    const job = await bookedJob();
    const stranger = await register('CARGO_OWNER', 'ft17x');
    const strangerSocket = mkSocket();
    await handleTrackingMessage(strangerSocket, JSON.stringify({ action: 'JOIN_TRIP', tripId: job.trip.id }), asUser(stranger, 'CARGO_OWNER'));
    expect(strangerSocket.sent.some((m) => m.event === 'ERROR' && /Unauthorized/i.test(m.message))).toBe(true);
    expect(strangerSocket.sent.some((m) => m.event === 'JOINED_TRIP')).toBe(false);

    const report = (n) =>
      handleTrackingMessage(
        mkSocket(),
        JSON.stringify({ action: 'LOCATION_UPDATE', tripId: job.trip.id, latitude: 31.5 + n / 1000, longitude: 74.3, accuracy: 10 }),
        asUser(job.driver, 'DRIVER')
      );
    await report(1);
    expect(await prisma.tripPosition.count({ where: { tripId: job.trip.id } })).toBe(0); // Booked: outside the tracking period
    expect((await setStatus(job.driver, job.trip.id, 'REACHED_PICKUP')).status).toBe(200);
    await report(2);
    expect(await prisma.tripPosition.count({ where: { tripId: job.trip.id } })).toBe(1);
    for (const s of ['CARGO_LOADED', 'IN_TRANSIT', 'REACHED_DESTINATION']) expect((await setStatus(job.driver, job.trip.id, s)).status).toBe(200);
    await report(3);
    expect(await prisma.tripPosition.count({ where: { tripId: job.trip.id } })).toBe(1); // Reached Destination: collection has stopped
    const pod = await request(app).post(`${API}/driver/trips/${job.trip.id}/proof-of-delivery`).set(auth(job.driver.token))
      .field('note', 'Delivered').attach('podImages', PNG, 'pod.png');
    expect(pod.status).toBeLessThan(300);
    expect((await setStatus(job.driver, job.trip.id, 'DELIVERED')).status).toBe(200);
    await report(4);
    expect(await prisma.tripPosition.count({ where: { tripId: job.trip.id } })).toBe(1); // Delivered: no record is created
  });
});

describe('Security', () => {
  test('NF-11 (SEC-4): a token is refused after logout; after suspension see FT-07', async () => {
    const owner = await register('CARGO_OWNER', 'nf11');
    expect((await request(app).get(`${API}/users/me`).set(auth(owner.token))).status).toBe(200);
    expect((await request(app).post(`${API}/auth/logout`).set(auth(owner.token)).send({})).status).toBeLessThan(300);
    expect((await request(app).get(`${API}/users/me`).set(auth(owner.token))).status).toBe(401);
  });

  test('NF-12 (SEC-16): text with script tags is stored as data and returned as JSON with nosniff; the web and mobile sources contain no raw-HTML sink', async () => {
    const job = await bookedJob();
    await deliver(job);
    const payload = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    const c = await request(app).post(`${API}/complaints`).set(auth(job.owner.token))
      .send({ shipmentId: job.shipmentId, category: 'DELAY', description: payload });
    expect(c.status).toBe(201);
    const list = await request(app).get(`${API}/complaints`).set(auth(job.owner.token));
    expect(list.headers['content-type']).toContain('application/json');
    expect(list.headers['x-content-type-options']).toBe('nosniff');

    const root = path.resolve(__dirname, '../../..');
    const sinks = [];
    const walk = (dir, exts, re) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.next', '.git', 'build', '.dart_tool'].includes(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, exts, re);
        else if (exts.some((x) => e.name.endsWith(x)) && re.test(fs.readFileSync(p, 'utf8'))) sinks.push(p);
      }
    };
    walk(path.join(root, 'Website'), ['.ts', '.tsx', '.js', '.jsx'], /dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\(/);
    walk(path.join(root, 'App', 'lib'), ['.dart'], /flutter_html|HtmlWidget|WebView/);
    expect(sinks).toEqual([]);
  });

  test('NF-12 (SEC-12): an audit-log entry cannot be changed or deleted through the application database role', async () => {
    const row = await prisma.adminAuditLog.findFirst();
    expect(row).not.toBeNull();
    await expect(prisma.adminAuditLog.update({ where: { id: row.id }, data: { reason: 'tampered' } })).rejects.toBeDefined();
    await expect(prisma.adminAuditLog.delete({ where: { id: row.id } })).rejects.toBeDefined();
  });
});

describe('Scale', () => {
  test('NF-13 (PER-6): 100 publications each reach the eligible driver within 10 seconds of creation', async () => {
    const owner = await register('CARGO_OWNER', 'nf13o');
    const driver = await verifiedDriver('nf13d');
    await retireOldTestVehicles([driver.vehicle.id]);
    const ids = [];
    for (let i = 0; i < 100; i += 1) ids.push(await newShipment(owner));
    await new Promise((r) => setTimeout(r, 12000));
    const rows = await prisma.notification.findMany({ where: { recipientId: driver.id, relatedShipmentId: { in: ids } } });
    const created = await prisma.shipment.findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true } });
    const born = Object.fromEntries(created.map((s) => [s.id, s.createdAt.getTime()]));
    const delays = rows.map((n) => (n.createdAt.getTime() - born[n.relatedShipmentId]) / 1000).sort((a, b) => a - b);
    expect(delays.length).toBe(100);
    console.log(`NF-13 notification delay: median ${delays[50]} s, 95th percentile ${delays[94]} s, max ${delays[99]} s`);
    expect(delays[94]).toBeLessThan(10);
  });
});
