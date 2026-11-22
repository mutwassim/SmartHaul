/**
 * SRS Chapter 6 plan, fourth API suite: the Accepting bids switch and the live position a driver shares while it is on
 * (FR-DR-19, FR-RM-4, SEC-18). Real Express app, real PostgreSQL database.
 */
jest.mock('../../src/middleware/rateLimiter.middleware', () => {
  const pass = (req, res, next) => next();
  return { apiLimiter: pass, authLimiter: pass };
});

const { ctx, app, prisma, request, API, auth, register, verifiedDriver, newShipment } = require('./srsHelpers');
const { computeRecommendationsForShipment } = require('../../src/modules/matching/matching.service');

jest.setTimeout(120000);

const setAccepting = (d, accepting) => request(app).put(`${API}/driver/availability`).set(auth(d.token)).send({ accepting });
const share = (d, latitude = 31.47, longitude = 74.24) =>
  request(app).post(`${API}/driver/location`).set(auth(d.token)).send({ latitude, longitude });
const scoreOf = async (shipmentId, driver) =>
  (await prisma.recommendationLog.findFirst({ where: { shipmentId, candidateId: driver.id } }))?.matchScore;

beforeAll(async () => {
  const res = await request(app).post(`${API}/auth/login`).send({ identifier: 'admin@smarthaul.pk', password: 'SmartHaul@Admin2026!', role: 'ADMIN' });
  ctx.adminToken = res.body.data.token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Accepting bids switch (FR-DR-19)', () => {
  test('FT-43: a driver who switches Accepting bids off sees no loads and is not ranked; switching on restores both', async () => {
    const owner = await register('CARGO_OWNER', 'ft43o');
    const driver = await verifiedDriver('ft43d');
    const id = await newShipment(owner);

    const on = await request(app).get(`${API}/driver/matched-shipments`).set(auth(driver.token));
    expect(JSON.stringify(on.body)).toContain(id);

    expect((await setAccepting(driver, false)).status).toBe(200);
    const off = await request(app).get(`${API}/driver/matched-shipments`).set(auth(driver.token));
    expect(off.status).toBe(200);
    expect(JSON.stringify(off.body)).not.toContain(id);
    await computeRecommendationsForShipment(id);
    expect(await scoreOf(id, driver)).toBeUndefined();

    expect((await setAccepting(driver, true)).status).toBe(200);
    await computeRecommendationsForShipment(id);
    expect(await scoreOf(id, driver)).toBeDefined();
  });

  test('FT-43: a position is refused while the switch is off, accepted while on, and deleted when it is switched off', async () => {
    const driver = await verifiedDriver('ft43p');
    expect((await setAccepting(driver, false)).status).toBe(200);
    expect((await share(driver)).status).toBe(409);

    expect((await setAccepting(driver, true)).status).toBe(200);
    expect((await share(driver)).status).toBe(200);
    let row = await prisma.user.findUnique({ where: { id: driver.id } });
    expect(row.lastLat).toBeCloseTo(31.47);
    expect(row.lastLocationAt).not.toBeNull();

    expect((await setAccepting(driver, false)).status).toBe(200);
    row = await prisma.user.findUnique({ where: { id: driver.id } });
    expect(row.lastLat).toBeNull();
    expect(row.lastLng).toBeNull();
    expect(row.lastLocationAt).toBeNull();
  });

  test('FT-43: invalid coordinates are refused, and a cargo owner cannot use either route', async () => {
    const driver = await verifiedDriver('ft43v');
    expect((await share(driver, 91, 74)).status).toBe(400);
    expect((await share(driver, 31, 181)).status).toBe(400);
    const owner = await register('CARGO_OWNER', 'ft43r');
    expect((await request(app).put(`${API}/driver/availability`).set(auth(owner.token)).send({ accepting: false })).status).toBe(403);
    expect((await request(app).post(`${API}/driver/location`).set(auth(owner.token)).send({ latitude: 31, longitude: 74 })).status).toBe(403);
  });
});

describe('Live position in matching (FR-RM-4)', () => {
  test('FT-44: a driver sharing a position at the pickup outranks an identical driver who shares none', async () => {
    const owner = await register('CARGO_OWNER', 'ft44o');
    const near = await verifiedDriver('ft44n');
    const none = await verifiedDriver('ft44x');
    const id = await newShipment(owner);
    expect((await share(near, 31.47, 74.24)).status).toBe(200);
    await computeRecommendationsForShipment(id);
    expect(await scoreOf(id, near)).toBeGreaterThan(await scoreOf(id, none));
  });

  test('FT-44: a position older than 10 minutes is ignored', async () => {
    const owner = await register('CARGO_OWNER', 'ft44so');
    const stale = await verifiedDriver('ft44s');
    const none = await verifiedDriver('ft44y');
    const id = await newShipment(owner);
    expect((await share(stale, 31.47, 74.24)).status).toBe(200);
    await prisma.user.update({ where: { id: stale.id }, data: { lastLocationAt: new Date(Date.now() - 11 * 60 * 1000) } });
    await computeRecommendationsForShipment(id);
    expect(await scoreOf(id, stale)).toBe(await scoreOf(id, none));
  });

  test('FT-44: a driver 150 km away scores lower than one at the pickup', async () => {
    const owner = await register('CARGO_OWNER', 'ft44fo');
    const at = await verifiedDriver('ft44a');
    const far = await verifiedDriver('ft44f');
    const id = await newShipment(owner);
    await share(at, 31.47, 74.24);
    await share(far, 32.8, 74.24);
    await computeRecommendationsForShipment(id);
    expect(await scoreOf(id, at)).toBeGreaterThan(await scoreOf(id, far));
  });
});
