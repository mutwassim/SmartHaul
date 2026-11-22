const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/db');
const { ROLES, SHIPMENT_STATUS } = require('../../src/config/constants');
const matchingService = require('../../src/modules/matching/matching.service');

describe('SRS Section 6.8 Known Gaps & Specific Defects Verification', () => {
  let adminToken;
  let driverToken;
  let fleetToken;
  let testShipmentId;

  beforeAll(async () => {
    // 1. Authenticate Admin
    const adminRes = await request(app).post('/api/v1/auth/login').send({
      identifier: 'admin@smarthaul.pk',
      password: 'SmartHaul@Admin2026!',
      role: 'ADMIN',
    });
    adminToken = adminRes.body.data ? adminRes.body.data.token : null;

    // 2. Register/Login a Driver
    const driverRes = await request(app).post('/api/v1/auth/register').send({
      role: 'DRIVER',
      name: 'Audit Driver',
      email: 'audit_driver@haul.pk',
      phone: '+923110001122',
      password: 'DriverPass@2026!',
      cnicNumber: '37405-1111222-3',
    });
    driverToken = driverRes.body.data ? driverRes.body.data.token : null;

    // 3. Register/Login a Fleet Owner
    const fleetRes = await request(app).post('/api/v1/auth/register').send({
      role: 'FLEET_OWNER',
      name: 'Audit Fleet Logistics',
      email: 'audit_fleet@haul.pk',
      phone: '+923113334455',
      password: 'FleetPass@2026!',
      businessName: 'Audit Fleet Logistics Ltd',
    });
    fleetToken = fleetRes.body.data ? fleetRes.body.data.token : null;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: ['audit_driver@haul.pk', 'audit_fleet@haul.pk', 'audit_lockout@haul.pk'] } },
    });
    await prisma.$disconnect();
  });

  // Gap 1 (fixed, DEF-01): Password-reset token no longer returned in the API response
  test('GAP-1: Password-reset token is NOT returned in the API response body', async () => {
    const res = await request(app).post('/api/v1/auth/password-recovery/request').send({
      identifier: 'admin@smarthaul.pk',
      role: 'ADMIN',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The token must only be issued by an administrator, never leaked to the requester
    expect(JSON.stringify(res.body)).not.toContain('resetToken');
  });

  // Gap 2 (fixed, DEF-04): bid acceptance uses an atomic compare-and-set on the shipment status
  test('GAP-2: acceptBid books the shipment with a compare-and-set on PENDING status', async () => {
    const fs = require('fs');
    const controllerSource = fs.readFileSync('src/modules/cargo-owner/cargoOwner.controller.js', 'utf8');

    expect(controllerSource).toMatch(/shipment\.updateMany\(\{\s*where: \{ id: shipmentId, status: SHIPMENT_STATUS\.PENDING \}/);
    expect(controllerSource).toContain('booked.count !== 1');
    // The old comments claimed a lock that never existed
    expect(controllerSource).not.toContain('row lock');
    expect(controllerSource).not.toContain('serializable');
  });

  // Gap 3 (fixed, DEF-03): fleet owners may use the bidding routes (a pending account is stopped by verification, not by role)
  test('GAP-3: Fleet Owner is allowed through the role check on /api/v1/driver/matched-shipments', async () => {
    const res = await request(app)
      .get('/api/v1/driver/matched-shipments')
      .set('Authorization', `Bearer ${fleetToken}`);

    // The freshly registered fleet owner is unverified, so the verification gate answers, not the role gate
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_VERIFIED');
  });

  test('GAP-3b: Fleet Owner is still blocked from driver-only trip routes', async () => {
    const res = await request(app)
      .get('/api/v1/driver/active-trip')
      .set('Authorization', `Bearer ${fleetToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  // Gap 4 (fixed): losing bidders are told the shipment was booked by someone else
  test('GAP-4: acceptBid controller also notifies losing bidders', async () => {
    const fs = require('fs');
    const controllerSource = fs.readFileSync('src/modules/cargo-owner/cargoOwner.controller.js', 'utf8');
    
    // In acceptBid, dispatchNotification is called once for result.bid.bidderId
    const winningNotice = controllerSource.includes("type: 'BID_ACCEPTED'");
    const losingNotice = controllerSource.includes("type: 'SHIPMENT_BOOKED_BY_ANOTHER'");
    
    expect(winningNotice).toBe(true);
    expect(losingNotice).toBe(true);
  });

  // DEF-19: a lockout that has expired must not re-lock the account on the first wrong password
  test('DEF-19: expired lockout restarts the failed-login count', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({
      role: 'CARGO_OWNER',
      name: 'Audit Lockout',
      email: 'audit_lockout@haul.pk',
      phone: '+923115556677',
      password: 'LockPass@2026!',
      businessName: 'Audit Lockout Ltd',
    });
    const userId = reg.body.data.user.id;

    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 5, lockoutUntil: new Date(Date.now() - 60000) },
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      identifier: 'audit_lockout@haul.pk',
      password: 'WrongPass@2026!',
      role: 'CARGO_OWNER',
    });
    expect(res.status).toBe(401);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user.failedLoginAttempts).toBe(1);
    expect(user.lockoutUntil).toBeNull();
  });

  // Gap 5: Missing "Accepted" shipment status
  test('GAP-5: enum ShipmentStatus in schema.prisma and constants.js omits ACCEPTED', () => {
    const { SHIPMENT_STATUS } = require('../../src/config/constants');
    expect(SHIPMENT_STATUS).not.toHaveProperty('ACCEPTED');
    expect(Object.values(SHIPMENT_STATUS)).not.toContain('ACCEPTED');
  });

  // Gap 6: Shared-load matching not being implemented
  // Gap 6 (fixed, DEF-09/13/14): shared loads and remaining capacity are now computed
  test('GAP-6: matching.service.js computes shared loads and remaining capacity', async () => {
    const fs = require('fs');
    const matchingSource = fs.readFileSync('src/modules/matching/matching.service.js', 'utf8');
    
    expect(matchingSource).not.toContain('isSharedLoad: false');
    expect(matchingSource).toContain('computeRemainingCapacity');
    expect(matchingSource).toContain('evaluateSharedLoadEligibility');
  });

  // Gap 7 (resolved): the mobile app is connected to the backend
  test('GAP-7: App/pubspec.yaml declares the HTTP and WebSocket dependencies (backend connection)', () => {
    const fs = require('fs');
    const pubspec = fs.readFileSync('../App/pubspec.yaml', 'utf8');

    expect(pubspec).toMatch(/^\s+http:/m);
    expect(pubspec).toMatch(/^\s+web_socket_channel:/m);
  });
});
