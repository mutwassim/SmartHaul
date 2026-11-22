/**
 * Shared helpers for the SRS API suites. Each call goes through the real Express app and the real database.
 * Accounts created here have an email starting "srs_" so test data is easy to find.
 */
const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/db');

const ctx = { adminToken: null };

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('srs-image')]);
const API = '/api/v1';
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const rnd = () => Math.floor(1000000 + Math.random() * 8999999);
const hoursAhead = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();

let seq = 0;

async function register(role, tag, extra = {}) {
  seq += 1;
  const body = {
    role,
    name: `SRS ${tag} ${seq}`,
    email: `srs_${tag}_${Date.now()}_${seq}@haul.pk`,
    phone: `+92300${rnd()}`,
    password: 'SrsPass@2026!',
    ...extra,
  };
  if ((role === 'DRIVER' || role === 'FLEET_OWNER') && !extra.cnicNumber) {
    body.cnicNumber = `${String(rnd()).padStart(5, '0').slice(0, 5)}-${rnd()}-${seq % 10}`;
  }
  if (role === 'CARGO_OWNER') body.businessName = `SRS Business ${seq}`;
  const res = await request(app).post(`${API}/auth/register`).send(body);
  return { res, body, token: res.body?.data?.token, id: res.body?.data?.user?.id };
}

function uploadDoc(token, type = 'CNIC_FRONT') {
  return request(app)
    .post(`${API}/users/me/documents`)
    .set(auth(token))
    .field('documentType', type)
    .attach('document', PNG, 'doc.png');
}

async function verify(user) {
  await uploadDoc(user.token);
  const res = await request(app)
    .post(`${API}/admin/verification/${user.id}/decision`)
    .set(auth(ctx.adminToken))
    .send({ decision: 'APPROVED' });
  expect(res.status).toBe(200);
}

function giveVehicle(ownerId, overrides = {}) {
  seq += 1;
  return prisma.vehicle.create({
    data: {
      ownerId,
      registrationNumberEncrypted: 'srs',
      registrationNumberIv: 'srs',
      registrationNumberTag: 'srs',
      registrationNumberHash: `srs-${Date.now()}-${seq}-${Math.random()}`,
      vehicleType: 'OPEN_BODY',
      ratedCapacity: 10,
      model: 'Hino',
      year: 2020,
      ...overrides,
    },
  });
}

async function verifiedDriver(tag = 'driver') {
  const d = await register('DRIVER', tag);
  await verify(d);
  d.vehicle = await giveVehicle(d.id);
  return d;
}

const shipmentBody = (over = {}) => ({
  pickupAddress: 'Lahore Dry Port, Thokar Niaz Baig',
  pickupLat: 31.47,
  pickupLng: 74.24,
  dropoffAddress: 'I-9 Industrial Area, Islamabad',
  dropoffLat: 33.66,
  dropoffLng: 73.06,
  cargoType: 'CONSTRUCTION_MATERIAL',
  cargoWeight: 2.5,
  requiredVehicleType: 'OPEN_BODY',
  expectedDeliveryDate: hoursAhead(48),
  ...over,
});

async function newShipment(owner, over) {
  const res = await request(app).post(`${API}/shipments`).set(auth(owner.token)).send(shipmentBody(over));
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function bid(driver, shipmentId, fare = 40000) {
  return request(app)
    .post(`${API}/driver/bids`)
    .set(auth(driver.token))
    .send({ shipmentId, proposedFare: fare, estimatedDeliveryTime: hoursAhead(36) });
}

function accept(owner, shipmentId, b) {
  return request(app)
    .post(`${API}/shipments/${shipmentId}/accept-bid`)
    .set(auth(owner.token))
    .send({ bidId: b.id, expectedFare: b.proposedFare });
}

/** Owner + verified driver + booked shipment with its trip and payment record. */
async function bookedJob() {
  const owner = await register('CARGO_OWNER', 'owner');
  const driver = await verifiedDriver();
  const shipmentId = await newShipment(owner);
  const b = (await bid(driver, shipmentId)).body.data;
  const acc = await accept(owner, shipmentId, b);
  expect(acc.status).toBe(200);
  const trip = await prisma.trip.findUnique({ where: { shipmentId } });
  return { owner, driver, shipmentId, bid: b, trip, payment: acc.body.data.paymentRecord };
}

const setStatus = (driver, tripId, status, extra = {}) =>
  request(app).post(`${API}/driver/trips/${tripId}/status`).set(auth(driver.token)).send({ status, ...extra });

async function deliver(job) {
  for (const s of ['REACHED_PICKUP', 'CARGO_LOADED', 'IN_TRANSIT', 'REACHED_DESTINATION']) {
    const r = await setStatus(job.driver, job.trip.id, s);
    expect(r.status).toBe(200);
  }
  const pod = await request(app)
    .post(`${API}/driver/trips/${job.trip.id}/proof-of-delivery`)
    .set(auth(job.driver.token))
    .field('note', 'Delivered')
    .attach('podImages', PNG, 'pod.png');
  expect(pod.status).toBeLessThan(300);
  const done = await setStatus(job.driver, job.trip.id, 'DELIVERED');
  expect(done.status).toBe(200);
}

const confirm = (owner, shipmentId) =>
  request(app).post(`${API}/shipments/${shipmentId}/confirm-delivery`).set(auth(owner.token)).send({});


module.exports = { ctx, app, prisma, request, PNG, API, auth, rnd, hoursAhead, register, uploadDoc, verify, giveVehicle, verifiedDriver, shipmentBody, newShipment, bid, accept, bookedJob, setStatus, deliver, confirm };
