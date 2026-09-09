const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/db');

// Set generous timeout for remote database operations
jest.setTimeout(30000);

describe('SmartHaul Core E2E & Business Rule Integration Tests', () => {
  let cargoToken;
  let cargoUser;
  let driverToken;
  let driverUser;
  let adminToken;
  let testShipmentId;
  let testBidId;

  beforeAll(async () => {
    // Clean up test data if necessary
    await prisma.notification.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.tripPosition.deleteMany();
    await prisma.tripStatusLog.deleteMany();
    await prisma.trip.deleteMany();
    await prisma.paymentStatusLog.deleteMany();
    await prisma.paymentRecord.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.verificationDocument.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.driverFleetLink.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { in: ['testcargo@haul.pk', 'testdriver@haul.pk'] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('GET /health should return 200 OK with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  test('POST /api/v1/auth/register should REJECT Admin self-registration (FR-AD-4)', async () => {
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

  test('POST /api/v1/admin/verification/:id/decision should verify Driver account (FR-AD-7, BR-3)', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/verification/${driverUser.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        decision: 'APPROVED',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.accountStatus).toBe('VERIFIED');
  });

  test('POST /api/v1/shipments/preview-route should compute distance and duration (FR-CO-5, SI-2.1)', async () => {
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

  test('POST /api/v1/shipments should create a shipment request (FR-CO-3, BR-4, BR-6)', async () => {
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

  test('POST /api/v1/driver/bids should submit bid for verified driver (FR-DR-7, BR-7)', async () => {
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

    testBidId = res.body.data.id;
  });

  test('POST /api/v1/shipments/:id/accept-bid should atomically book shipment and initialize payment (FR-CO-13, REL-4)', async () => {
    const res = await request(app)
      .post(`/api/v1/shipments/${testShipmentId}/accept-bid`)
      .set('Authorization', `Bearer ${cargoToken}`)
      .send({
        bidId: testBidId,
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
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SHIPMENT_ALREADY_BOOKED');
  });

  test('Immutable audit logs: Admin audit trail recorded the verification (FR-AD-19, BR-28, SEC-15)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const verifyLog = res.body.data.find((l) => l.action === 'APPROVE_VERIFICATION');
    expect(verifyLog).toBeDefined();
  });
});
