const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/db');

// Set generous timeout for remote database operations
jest.setTimeout(30000);

// A minimal valid PNG header: the upload check compares file content with the declared type (SI-4.3)
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('test-image')]);

// An administrator can only decide on a request that has documents (FR-AD-3, FR-AD-4)
async function submitDocument(token) {
  const res = await request(app)
    .post('/api/v1/users/me/documents')
    .set('Authorization', `Bearer ${token}`)
    .field('documentType', 'CNIC_FRONT')
    .attach('document', PNG_BYTES, 'cnic.png');
  expect(res.status).toBe(201);
}

describe('SmartHaul Core E2E & Business Rule Integration Tests', () => {
  let cargoToken;
  let cargoUser;
  let driverToken;
  let driverUser;
  let adminToken;
  let testShipmentId;
  let testBidId;
  let lockoutFreeDriver; // verified driver registered by the concurrent-accept test

  beforeAll(async () => {
    // Clean up test data if necessary
    await prisma.notification.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.tripPosition.deleteMany();
    await prisma.tripStatusLog.deleteMany();
    await prisma.trip.deleteMany();
    await prisma.paymentStatusLog.deleteMany();
    await prisma.paymentRecord.deleteMany();
    // Rows other suites (the SRS API suites) leave against shipments; they would block the shipment delete
    await prisma.complaint.deleteMany();
    await prisma.rating.deleteMany();
    await prisma.shipmentMessage.deleteMany();
    await prisma.proofOfDelivery.deleteMany();
    await prisma.routeSummary.deleteMany();
    await prisma.recommendationLog.deleteMany();
    await prisma.driverPenalty.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.verificationDocument.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.driverFleetLink.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { in: ['testcargo@haul.pk', 'testdriver@haul.pk', 'testdriver2@haul.pk', 'testdriver3@haul.pk', 'testdriver4@haul.pk'] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('GET /api/health returns the same healthy response (public proxy path)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  test('GET /health should return 200 OK with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  test('POST /api/v1/auth/register should REJECT Admin self-registration (FR-AD-1)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      role: 'ADMIN',
      name: 'Hacker Admin',
      email: 'hacker@admin.com',
      phone: '+923000000000',
      password: 'StrongPass@2026',
    });

    expect(res.status).toBe(422); // Schema rejection for prohibited admin registration
  });

  test('POST /api/v1/auth/register should register a Cargo Owner as ACTIVE (BR-1)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      role: 'CARGO_OWNER',
      name: 'Ahmad Khan Cargo',
      email: 'testcargo@haul.pk',
      phone: '+923001112233',
      password: 'CargoPass@2026!',
      businessName: 'Khan Logistics Hub',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.accountStatus).toBe('ACTIVE');
    expect(res.body.data.token).toBeDefined();

    cargoToken = res.body.data.token;
    cargoUser = res.body.data.user;
  });

  test('POST /api/v1/auth/register should register a Driver as PENDING verification (BR-1)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      role: 'DRIVER',
      name: 'Tariq Mehmood Driver',
      email: 'testdriver@haul.pk',
      phone: '+923004445566',
      password: 'DriverPass@2026!',
      cnicNumber: '37405-9988776-1',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.accountStatus).toBe('PENDING');

    driverToken = res.body.data.token;
    driverUser = res.body.data.user;
  });

  test('POST /api/v1/auth/login should authenticate Admin successfully', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      identifier: 'admin@smarthaul.pk',
      password: 'SmartHaul@Admin2026!',
      role: 'ADMIN',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();

    adminToken = res.body.data.token;
  });

  test('RBAC: Non-admin users should receive 403 FORBIDDEN on Admin endpoints (SEC-9)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/verification-queue')
      .set('Authorization', `Bearer ${cargoToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  test('POST /api/v1/admin/verification/:id/decision should verify Driver account (FR-AD-4, BR-3)', async () => {
    // Without submitted documents the decision is refused
    const early = await request(app)
      .post(`/api/v1/admin/verification/${driverUser.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVED' });
    expect(early.status).toBe(409);

    await submitDocument(driverToken);

    const res = await request(app)
      .post(`/api/v1/admin/verification/${driverUser.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        decision: 'APPROVED',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.accountStatus).toBe('VERIFIED');
  });

  test('POST /api/v1/shipments/preview-route should compute distance and duration (FR-CO-4, SI-2.1)', async () => {
    const res = await request(app)
      .post('/api/v1/shipments/preview-route')
      .set('Authorization', `Bearer ${cargoToken}`)
      .send({
        pickupLat: 31.5204,
        pickupLng: 74.3587, // Lahore
        dropoffLat: 33.6844,
        dropoffLng: 73.0479, // Islamabad
      });

    expect(res.status).toBe(200);
    expect(res.body.data.distanceKm).toBeGreaterThan(0);
    expect(res.body.data.durationMinutes).toBeGreaterThan(0);
  });

  test('POST /api/v1/shipments should create a shipment request (FR-CO-2, BR-4, BR-6)', async () => {
    const res = await request(app)
      .post('/api/v1/shipments')
      .set('Authorization', `Bearer ${cargoToken}`)
      .send({
        pickupAddress: 'Lahore Dry Port, Thokar Niaz Baig',
        pickupLat: 31.47,
        pickupLng: 74.24,
        dropoffAddress: 'I-9 Industrial Area, Islamabad',
        dropoffLat: 33.66,
        dropoffLng: 73.06,
        cargoType: 'CONSTRUCTION_MATERIAL',
        cargoWeight: 2.5, // 2.5 tonnes
        requiredVehicleType: 'OPEN_BODY',
        expectedDeliveryDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe('PENDING');

    testShipmentId = res.body.data.id;
  });

  test('POST /api/v1/driver/bids should submit bid for verified driver (FR-DR-6, BR-7)', async () => {
    const vehicle = await giveVehicle(driverUser.id, 'd1');
    const res = await request(app)
      .post('/api/v1/driver/bids')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        shipmentId: testShipmentId,
        proposedFare: 45000, // PKR 45,000
        estimatedDeliveryTime: new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.vehicleId).toBe(vehicle.id);

    testBidId = res.body.data.id;
  });

  test('POST /api/v1/shipments/:id/accept-bid should atomically book shipment and initialize payment (FR-CO-7, REL-4)', async () => {
    const res = await request(app)
      .post(`/api/v1/shipments/${testShipmentId}/accept-bid`)
      .set('Authorization', `Bearer ${cargoToken}`)
      .send({
        bidId: testBidId,
        expectedFare: 45000,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.shipment.status).toBe('BOOKED');
    expect(res.body.data.paymentRecord).toBeDefined();
    expect(res.body.data.paymentRecord.agreedFare).toBe(45000);
    expect(res.body.data.paymentRecord.status).toBe('PENDING');
  });

  test('Double acceptance rejection: cannot accept another bid once booked (BR-10, REL-5)', async () => {
    const res = await request(app)
      .post(`/api/v1/shipments/${testShipmentId}/accept-bid`)
      .set('Authorization', `Bearer ${cargoToken}`)
      .send({
        bidId: testBidId,
        expectedFare: 45000,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SHIPMENT_ALREADY_BOOKED');
  });

  test('Immutable audit logs: Admin audit trail recorded the verification (FR-AD-13, BR-28, SEC-15)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const verifyLog = res.body.data.find((l) => l.action === 'APPROVE_VERIFICATION');
    expect(verifyLog).toBeDefined();
  });

  // ---- Backend defect fixes: concurrent booking, loser notices, lifecycle, recovery ----

  async function registerVerifiedDriver(email, phone, cnic) {
    const reg = await request(app).post('/api/v1/auth/register').send({
      role: 'DRIVER',
      name: `Driver ${email}`,
      email,
      phone,
      password: 'DriverPass@2026!',
      cnicNumber: cnic,
    });
    await submitDocument(reg.body.data.token);
    await request(app)
      .post(`/api/v1/admin/verification/${reg.body.data.user.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVED' });
    return { token: reg.body.data.token, id: reg.body.data.user.id };
  }

  function giveVehicle(ownerId, tag, overrides = {}) {
    return prisma.vehicle.create({
      data: {
        ownerId,
        registrationNumberEncrypted: 'test',
        registrationNumberIv: 'test',
        registrationNumberTag: 'test',
        registrationNumberHash: `b3-${tag}-${Date.now()}-${Math.random()}`,
        vehicleType: 'OPEN_BODY',
        ratedCapacity: 10,
        model: 'Hino',
        year: 2020,
        ...overrides,
      },
    });
  }

  async function createPendingShipment() {
    const res = await request(app)
      .post('/api/v1/shipments')
      .set('Authorization', `Bearer ${cargoToken}`)
      .send({
        pickupAddress: 'Lahore Dry Port, Thokar Niaz Baig',
        pickupLat: 31.47,
        pickupLng: 74.24,
        dropoffAddress: 'I-9 Industrial Area, Islamabad',
        dropoffLat: 33.66,
        dropoffLng: 73.06,
        cargoType: 'CONSTRUCTION_MATERIAL',
        cargoWeight: 2.5,
        requiredVehicleType: 'OPEN_BODY',
        expectedDeliveryDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      });
    return res.body.data.id;
  }

  function placeBid(token, shipmentId, fare) {
    return request(app)
      .post('/api/v1/driver/bids')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shipmentId,
        proposedFare: fare,
        estimatedDeliveryTime: new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(),
      });
  }

  test('Concurrent accept of two different bids books exactly one (DEF-04, BR-10, REL-5) and notifies the loser', async () => {
    const d2 = await registerVerifiedDriver('testdriver2@haul.pk', '+923007778899', '37405-5551234-1');
    const d3 = await registerVerifiedDriver('testdriver3@haul.pk', '+923007778800', '37405-5554321-1');
    lockoutFreeDriver = d3;
    await giveVehicle(d2.id, 'd2');
    await giveVehicle(d3.id, 'd3');
    const shipmentId = await createPendingShipment();

    const bid2 = (await placeBid(d2.token, shipmentId, 41000)).body.data;
    const bid3 = (await placeBid(d3.token, shipmentId, 43000)).body.data;
    expect(bid2.id).toBeDefined();
    expect(bid3.id).toBeDefined();

    const accept = (bid) =>
      request(app)
        .post(`/api/v1/shipments/${shipmentId}/accept-bid`)
        .set('Authorization', `Bearer ${cargoToken}`)
        .send({ bidId: bid.id, expectedFare: bid.proposedFare });

    const results = await Promise.all([accept(bid2), accept(bid3)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);

    expect(await prisma.paymentRecord.count({ where: { shipmentId } })).toBe(1);
    expect(await prisma.bid.count({ where: { shipmentId, status: 'ACCEPTED' } })).toBe(1);

    const winnerId = results[0].status === 200 ? d2.id : d3.id;
    const loserId = winnerId === d2.id ? d3.id : d2.id;
    const loserNotices = await prisma.notification.count({
      where: { recipientId: loserId, type: 'SHIPMENT_BOOKED_BY_ANOTHER', relatedShipmentId: shipmentId },
    });
    expect(loserNotices).toBe(1);
  });

  describe('Offline status batch sync and cancellation rules (DEF-05, DEF-08, DEF-28)', () => {
    let driver;
    let tripId;
    let shipmentId;

    beforeAll(async () => {
      // testdriver3 was registered and verified by the concurrent-accept test above
      driver = lockoutFreeDriver;

      // The concurrent-accept test may have left this driver's vehicle ASSIGNED
      await prisma.vehicle.updateMany({ where: { ownerId: driver.id }, data: { availabilityStatus: 'AVAILABLE' } });

      shipmentId = await createPendingShipment();
      const bid = (await placeBid(driver.token, shipmentId, 40000)).body.data;
      await request(app)
        .post(`/api/v1/shipments/${shipmentId}/accept-bid`)
        .set('Authorization', `Bearer ${cargoToken}`)
        .send({ bidId: bid.id, expectedFare: bid.proposedFare });

      tripId = (await prisma.trip.findUnique({ where: { shipmentId } })).id;
    });

    const sync = (statusUpdates) =>
      request(app)
        .post(`/api/v1/driver/trips/${tripId}/status/batch-sync`)
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ statusUpdates });

    test('rejects a queue that skips a status and applies nothing', async () => {
      const res = await sync([{ status: 'IN_TRANSIT', timestamp: new Date().toISOString() }]);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');

      const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
      expect(shipment.status).toBe('BOOKED');
    });

    test('replays out-of-order updates by timestamp and is safe to retry', async () => {
      const t1 = new Date(Date.now() - 60000).toISOString();
      const t2 = new Date(Date.now() - 30000).toISOString();
      const queue = [
        { status: 'CARGO_LOADED', timestamp: t2 },
        { status: 'REACHED_PICKUP', timestamp: t1 },
      ];

      const first = await sync(queue);
      expect(first.status).toBe(200);
      expect((await prisma.shipment.findUnique({ where: { id: shipmentId } })).status).toBe('CARGO_LOADED');

      const logsAfterFirst = await prisma.tripStatusLog.count({ where: { tripId } });

      const retry = await sync(queue);
      expect(retry.status).toBe(200);
      expect(await prisma.tripStatusLog.count({ where: { tripId } })).toBe(logsAfterFirst);
    });

    test('cannot cancel once cargo is loaded, online or via batch sync (DEF-05)', async () => {
      const online = await request(app)
        .post(`/api/v1/driver/trips/${tripId}/status`)
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ status: 'CANCELLED', note: 'Changed my mind' });
      expect(online.status).toBe(422);

      const batch = await sync([{ status: 'CANCELLED', timestamp: new Date().toISOString(), note: 'Changed my mind' }]);
      expect(batch.status).toBe(422);
      expect((await prisma.shipment.findUnique({ where: { id: shipmentId } })).status).toBe('CARGO_LOADED');
    });

    test('cancellation without a reason is rejected by validation (DEF-08)', async () => {
      const res = await request(app)
        .post(`/api/v1/driver/trips/${tripId}/status`)
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ status: 'CANCELLED' });
      expect(res.status).toBe(422);
    });

    test('DELIVERED via batch sync requires proof of delivery (BR-15)', async () => {
      const res = await sync([
        { status: 'IN_TRANSIT', timestamp: new Date(Date.now() - 20000).toISOString() },
        { status: 'REACHED_DESTINATION', timestamp: new Date(Date.now() - 10000).toISOString() },
        { status: 'DELIVERED', timestamp: new Date().toISOString() },
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PROOF_OF_DELIVERY_REQUIRED');
      expect((await prisma.shipment.findUnique({ where: { id: shipmentId } })).status).toBe('CARGO_LOADED');
    });
  });

  describe('Password recovery and admin user directory (DEF-01, DEF-21)', () => {
    test('recovery request never returns a token; admin issues one that works once', async () => {
      const request1 = await request(app).post('/api/v1/auth/password-recovery/request').send({
        identifier: 'testcargo@haul.pk',
        role: 'CARGO_OWNER',
      });
      expect(request1.status).toBe(200);
      expect(JSON.stringify(request1.body)).not.toContain('resetToken');

      const unknown = await request(app).post('/api/v1/auth/password-recovery/request').send({
        identifier: 'nobody@haul.pk',
        role: 'CARGO_OWNER',
      });
      expect(unknown.body.message).toBe(request1.body.message);

      const issued = await request(app)
        .post(`/api/v1/admin/users/${cargoUser.id}/reset-token`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Identity confirmed by phone call' });
      expect(issued.status).toBe(200);
      expect(typeof issued.body.data.resetToken).toBe('string');

      const reset = await request(app).post('/api/v1/auth/password-recovery/reset').send({
        token: issued.body.data.resetToken,
        newPassword: 'CargoPass@2027!',
      });
      expect(reset.status).toBe(200);

      const reuse = await request(app).post('/api/v1/auth/password-recovery/reset').send({
        token: issued.body.data.resetToken,
        newPassword: 'CargoPass@2028!',
      });
      expect(reuse.status).not.toBe(200);

      // A password reset ends every earlier session (FR-SV-4, SEC-4)
      const stale = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${cargoToken}`);
      expect(stale.status).toBe(401);
      expect(stale.body.error.code).toBe('AUTH_TOKEN_REVOKED');

      const relogin = await request(app).post('/api/v1/auth/login').send({
        identifier: 'testcargo@haul.pk',
        password: 'CargoPass@2027!',
        role: 'CARGO_OWNER',
      });
      expect(relogin.status).toBe(200);
      cargoToken = relogin.body.data.token;

      // Non-admins cannot issue tokens
      const denied = await request(app)
        .post(`/api/v1/admin/users/${cargoUser.id}/reset-token`)
        .set('Authorization', `Bearer ${cargoToken}`)
        .send({ reason: 'trying it on' });
      expect(denied.status).toBe(403);
    });

    test('GET /admin/users lists and filters users for admins only (DEF-21)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users?role=DRIVER&accountStatus=VERIFIED')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((u) => u.role === 'DRIVER' && u.accountStatus === 'VERIFIED')).toBe(true);
      expect(res.body.data[0]).not.toHaveProperty('passwordHash');

      const denied = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${cargoToken}`);
      expect(denied.status).toBe(403);
    });
  });

  describe('Bidding and booking integrity (batch 3: C-05, C-08, C-11, C-16, C-17, C-20, C-31, C-47)', () => {
    let d4;
    let vehicle4;
    const auth = (token) => ({ Authorization: `Bearer ${token}` });
    const accept = (shipmentId, bid, fare = bid.proposedFare) =>
      request(app)
        .post(`/api/v1/shipments/${shipmentId}/accept-bid`)
        .set(auth(cargoToken))
        .send({ bidId: bid.id, expectedFare: fare });

    beforeAll(async () => {
      d4 = await registerVerifiedDriver('testdriver4@haul.pk', '+923007778811', '37405-5559999-1');
    });

    test('a bidder with no vehicle is refused (C-05)', async () => {
      const shipmentId = await createPendingShipment();
      const res = await placeBid(d4.token, shipmentId, 40000);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('NO_VEHICLE');
      vehicle4 = await giveVehicle(d4.id, 'd4');
    });

    test('the bid records the vehicle; a second active bid and a late ETA are refused (C-05, C-20)', async () => {
      const shipmentId = await createPendingShipment();
      const first = await placeBid(d4.token, shipmentId, 40000);
      expect(first.status).toBe(201);
      expect(first.body.data.vehicleId).toBe(vehicle4.id);

      const second = await placeBid(d4.token, shipmentId, 39000);
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('DUPLICATE_ACTIVE_BID');

      const other = await createPendingShipment();
      const late = await request(app)
        .post('/api/v1/driver/bids')
        .set(auth(d4.token))
        .send({
          shipmentId: other,
          proposedFare: 40000,
          estimatedDeliveryTime: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(late.status).toBe(422);
      expect(late.body.error.code).toBe('ETA_AFTER_DELIVERY_DATE');
    });

    test('accepting a bid whose fare changed since it was viewed is refused (C-08)', async () => {
      const shipmentId = await createPendingShipment();
      const bid = (await placeBid(d4.token, shipmentId, 40000)).body.data;
      await request(app).put(`/api/v1/driver/bids/${bid.id}`).set(auth(d4.token)).send({ proposedFare: 48000 });

      const stale = await accept(shipmentId, bid, 40000);
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('BID_CHANGED');
      expect((await prisma.shipment.findUnique({ where: { id: shipmentId } })).status).toBe('PENDING');

      const fresh = await accept(shipmentId, bid, 48000);
      expect(fresh.status).toBe(200);
      expect((await prisma.vehicle.findUnique({ where: { id: vehicle4.id } })).availabilityStatus).toBe('ASSIGNED');

      // Proof of delivery is not accepted before Reached Destination (C-16)
      const trip = await prisma.trip.findUnique({ where: { shipmentId } });
      const early = await request(app)
        .post(`/api/v1/driver/trips/${trip.id}/proof-of-delivery`)
        .set(auth(d4.token))
        .attach('podImages', Buffer.from('89504e470d0a1a0a', 'hex'), { filename: 'a.png', contentType: 'image/png' });
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe('POD_NOT_ALLOWED_YET');

      // Cargo owner cancels the booking: vehicle released, empty payment record removed (C-11, C-17)
      const cancel = await request(app)
        .put(`/api/v1/shipments/${shipmentId}/cancel`)
        .set(auth(cargoToken))
        .send({ reason: 'Plans changed' });
      expect(cancel.status).toBe(200);
      expect((await prisma.shipment.findUnique({ where: { id: shipmentId } })).status).toBe('CANCELLED');
      expect((await prisma.vehicle.findUnique({ where: { id: vehicle4.id } })).availabilityStatus).toBe('AVAILABLE');
      expect(await prisma.paymentRecord.count({ where: { shipmentId } })).toBe(0);
    });

    test('a driver cancelling reopens the shipment and is recorded against them (C-47)', async () => {
      const shipmentId = await createPendingShipment();
      const bid = (await placeBid(d4.token, shipmentId, 41000)).body.data;
      expect((await accept(shipmentId, bid)).status).toBe(200);
      const trip = await prisma.trip.findUnique({ where: { shipmentId } });
      const before = (await prisma.user.findUnique({ where: { id: d4.id } })).cancelledTripsCount;

      const noReason = await request(app).post(`/api/v1/driver/trips/${trip.id}/status`).set(auth(d4.token)).send({ status: 'CANCELLED' });
      expect(noReason.status).toBe(422);

      const res = await request(app)
        .post(`/api/v1/driver/trips/${trip.id}/status`)
        .set(auth(d4.token))
        .send({ status: 'CANCELLED', note: 'Truck broke down' });
      expect(res.status).toBe(200);

      const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
      expect(shipment.status).toBe('PENDING');
      expect(await prisma.trip.count({ where: { shipmentId } })).toBe(0);
      expect(await prisma.paymentRecord.count({ where: { shipmentId } })).toBe(0);
      expect((await prisma.vehicle.findUnique({ where: { id: vehicle4.id } })).availabilityStatus).toBe('AVAILABLE');
      expect((await prisma.user.findUnique({ where: { id: d4.id } })).cancelledTripsCount).toBe(before + 1);
      expect((await prisma.bid.findUnique({ where: { id: bid.id } })).status).toBe('WITHDRAWN');

      // The cargo owner can take a fresh bid on the reopened shipment
      const rebid = (await placeBid(d4.token, shipmentId, 41500)).body.data;
      expect((await accept(shipmentId, rebid)).status).toBe(200);
    });

    test('drafts take no bids until published; repeat and publish reuse the create path (C-20, C-32)', async () => {
      const draft = await request(app)
        .post('/api/v1/shipments')
        .set(auth(cargoToken))
        .send({
          pickupAddress: 'Lahore Dry Port, Thokar Niaz Baig',
          pickupLat: 31.47,
          pickupLng: 74.24,
          dropoffAddress: 'I-9 Industrial Area, Islamabad',
          dropoffLat: 33.66,
          dropoffLng: 73.06,
          cargoType: 'CONSTRUCTION_MATERIAL',
          cargoWeight: 2.5,
          requiredVehicleType: 'OPEN_BODY',
          expectedDeliveryDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          isDraft: true,
        });
      expect(draft.status).toBe(201);
      const id = draft.body.data.id;

      // The previous test leaves the vehicle ASSIGNED; free it so only the draft state can block the bid
      await prisma.vehicle.update({ where: { id: vehicle4.id }, data: { availabilityStatus: 'AVAILABLE' } });
      const onDraft = await placeBid(d4.token, id, 40000);
      expect(onDraft.status).toBe(409);
      expect(onDraft.body.error.code).toBe('SHIPMENT_NOT_OPEN');

      const published = await request(app).post(`/api/v1/shipments/${id}/publish`).set(auth(cargoToken));
      expect(published.status).toBe(200);
      expect(published.body.data.isDraft).toBe(false);
      expect((await request(app).post(`/api/v1/shipments/${id}/publish`).set(auth(cargoToken))).status).toBe(409);
      expect((await placeBid(d4.token, id, 40000)).status).toBe(201);

      const repeated = await request(app).post(`/api/v1/shipments/${id}/repeat`).set(auth(cargoToken));
      expect(repeated.status).toBe(201);
      expect(repeated.body.data.isDraft).toBe(false);
    });

    test('simultaneous shipment creation yields unique numbers (C-31)', async () => {
      const ids = await Promise.all(Array.from({ length: 6 }, () => createPendingShipment()));
      expect(ids.every(Boolean)).toBe(true);
      const rows = await prisma.shipment.findMany({ where: { id: { in: ids } }, select: { shipmentNumber: true } });
      expect(new Set(rows.map((r) => r.shipmentNumber)).size).toBe(6);
    });
  });

  describe('Matching and analytics (batch 4: C-01, C-12, C-13)', () => {
    const auth = (token) => ({ Authorization: `Bearer ${token}` });
    const body = (o = {}) => ({
      pickupAddress: 'Lahore Dry Port, Thokar Niaz Baig',
      pickupLat: 31.47,
      pickupLng: 74.24,
      dropoffAddress: 'I-9 Industrial Area, Islamabad',
      dropoffLat: 33.66,
      dropoffLng: 73.06,
      cargoType: 'CONSTRUCTION_MATERIAL',
      cargoWeight: 2.5,
      requiredVehicleType: 'OPEN_BODY',
      expectedDeliveryDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      ...o,
    });

    test('free-text cargo types and a body that cannot carry the cargo are refused (C-13)', async () => {
      const free = await request(app).post('/api/v1/shipments').set(auth(cargoToken)).send(body({ cargoType: 'Industrial Machinery' }));
      expect(free.status).toBe(422);

      const wrongBody = await request(app).post('/api/v1/shipments').set(auth(cargoToken)).send(body({ cargoType: 'PERISHABLE_GOODS' }));
      expect(wrongBody.status).toBe(422);
      expect(wrongBody.body.error.code).toBe('CARGO_VEHICLE_INCOMPATIBLE');
    });

    test('publishing notifies eligible drivers and the feed returns the ranked list (C-01)', async () => {
      const driver = (await prisma.user.findFirst({ where: { email: 'testdriver4@haul.pk' } }));
      await prisma.vehicle.updateMany({ where: { ownerId: driver.id }, data: { availabilityStatus: 'AVAILABLE' } });
      const login = await request(app).post('/api/v1/auth/login').send({ identifier: 'testdriver4@haul.pk', password: 'DriverPass@2026!', role: 'DRIVER' });
      const token = login.body.data.token;

      const created = await request(app).post('/api/v1/shipments').set(auth(cargoToken)).send(body());
      expect(created.status).toBe(201);
      const shipmentId = created.body.data.id;

      expect(await prisma.notification.count({ where: { recipientId: driver.id, type: 'NEW_MATCHING_SHIPMENT', relatedShipmentId: shipmentId } })).toBe(1);
      expect(await prisma.recommendationLog.count({ where: { shipmentId, candidateId: driver.id } })).toBe(1);

      const feed = await request(app).get('/api/v1/driver/matched-shipments').set(auth(token));
      expect(feed.status).toBe(200);
      const mine = feed.body.data.find((s) => s.id === shipmentId);
      expect(mine).toBeDefined();
      expect(typeof mine.recommendation.score).toBe('number');
      expect(mine.recommendation.reasons.length).toBeGreaterThan(0);

      const scores = feed.body.data.filter((s) => s.recommendation).map((s) => s.recommendation.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    });

    test('empty-running report is measured and scoped (C-12)', async () => {
      const res = await request(app).get('/api/v1/analytics/empty-running').set(auth(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.emptyRunningPercentage).toBeGreaterThanOrEqual(0);
      expect(res.body.data.emptyRunningPercentage).toBeLessThan(100);
      expect(res.body.data).toHaveProperty('measuredLegs');
      expect(res.body.data.basis).toMatch(/lower bound/i);

      const denied = await request(app).get('/api/v1/analytics/empty-running').set(auth(cargoToken));
      expect(denied.status).toBe(403);
    });
  });
});
