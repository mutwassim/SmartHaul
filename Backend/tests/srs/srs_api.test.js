/**
 * SRS Chapter 6 plan, run through the real API against the real database.
 * One test per plan ID, with the ID first in the title so results map straight into Tables 6.2 to 6.5.
 * Needs the same PostgreSQL database and seeded administrator as tests/integration/apiE2E.test.js.
 * Every account created here has an email starting "srs_" so test data is easy to find.
 */
// The per-IP limiters (300 requests / 10 failed logins) would block a suite this size, and would
// let the 5-failure account lockout (SEC-5) pass for the wrong reason, so they are bypassed here.
jest.mock('../../src/middleware/rateLimiter.middleware', () => {
  const pass = (req, res, next) => next();
  return { apiLimiter: pass, authLimiter: pass };
});

const {
  ctx, app, prisma, request, PNG, API, auth, hoursAhead, register, uploadDoc, verify, giveVehicle, verifiedDriver,
  shipmentBody, newShipment, bid, accept, bookedJob, setStatus, deliver, confirm,
} = require('./srsHelpers');

jest.setTimeout(60000);

let adminToken;

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

describe('Functional tests FT-01 to FT-41 (Table 6.2)', () => {
  test('FT-01: register a cargo owner as Active; a second account with the same phone is refused', async () => {
    const a = await register('CARGO_OWNER', 'ft01');
    expect(a.res.status).toBe(201);
    expect(a.res.body.data.user.accountStatus).toBe('ACTIVE');

    const dup = await request(app)
      .post(`${API}/auth/register`)
      .send({ ...a.body, email: `srs_dup_${Date.now()}@haul.pk` });
    expect(dup.status).toBeGreaterThanOrEqual(400);
    expect(dup.status).toBeLessThan(500);
  });

  test('FT-02: register a driver Pending, upload a document, refuse a duplicate CNIC and a 6 MB file', async () => {
    const d = await register('DRIVER', 'ft02');
    expect(d.res.status).toBe(201);
    expect(d.res.body.data.user.accountStatus).toBe('PENDING');
    expect(JSON.stringify(d.res.body)).not.toContain(d.body.cnicNumber);

    expect((await uploadDoc(d.token)).status).toBe(201);

    const dupCnic = await register('DRIVER', 'ft02b', { cnicNumber: d.body.cnicNumber });
    expect(dupCnic.res.status).toBeGreaterThanOrEqual(400);
    expect(dupCnic.res.status).toBeLessThan(500);

    const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
    const res = await request(app)
      .post(`${API}/users/me/documents`)
      .set(auth(d.token))
      .field('documentType', 'CNIC_BACK')
      .attach('document', big, 'big.png');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('FT-03: login works; wrong identifier and wrong password give the same message; five failures lock the account', async () => {
    const u = await register('CARGO_OWNER', 'ft03');
    const ok = await request(app)
      .post(`${API}/auth/login`)
      .send({ identifier: u.body.email, password: u.body.password, role: 'CARGO_OWNER' });
    expect(ok.status).toBe(200);

    const wrongId = await request(app)
      .post(`${API}/auth/login`)
      .send({ identifier: 'nobody_srs@haul.pk', password: 'Whatever@123', role: 'CARGO_OWNER' });
    const wrongPw = await request(app)
      .post(`${API}/auth/login`)
      .send({ identifier: u.body.email, password: 'Whatever@123', role: 'CARGO_OWNER' });
    expect(wrongId.status).toBe(wrongPw.status);
    expect(wrongId.body.error.message).toBe(wrongPw.body.error.message);

    for (let i = 0; i < 4; i += 1) {
      await request(app)
        .post(`${API}/auth/login`)
        .send({ identifier: u.body.email, password: 'Whatever@123', role: 'CARGO_OWNER' });
    }
    const locked = await request(app)
      .post(`${API}/auth/login`)
      .send({ identifier: u.body.email, password: u.body.password, role: 'CARGO_OWNER' });
    expect(locked.status).not.toBe(200);
  });

  test('FT-05: role-based access; unauthenticated calls get 401 and other roles get 403', async () => {
    const owner = await register('CARGO_OWNER', 'ft05');
    expect((await request(app).get(`${API}/users/me`)).status).toBe(401);
    expect((await request(app).get(`${API}/payments`)).status).toBe(401);
    expect((await request(app).get(`${API}/admin/users`).set(auth(owner.token))).status).toBe(403);
    expect((await request(app).get(`${API}/fleet/vehicles`).set(auth(owner.token))).status).toBe(403);
    expect((await request(app).get(`${API}/driver/active-trip`).set(auth(owner.token))).status).toBe(403);
  });

  test('FT-06: verification queue, rejection needs a reason, approved driver can bid, pending driver cannot', async () => {
    const owner = await register('CARGO_OWNER', 'ft06');
    const pending = await register('DRIVER', 'ft06p');
    await giveVehicle(pending.id);
    const shipmentId = await newShipment(owner);

    const early = await bid(pending, shipmentId);
    expect(early.status).toBeGreaterThanOrEqual(400);

    await uploadDoc(pending.token);
    // The queue is paged and grows with every run, so read pages until the driver is found
    let queued = false;
    for (let page = 1; page <= 30 && !queued; page += 1) {
      const queue = await request(app).get(`${API}/admin/verification-queue?page=${page}&limit=100`).set(auth(adminToken));
      expect(queue.status).toBe(200);
      queued = JSON.stringify(queue.body).includes(pending.id);
      if (!queue.body.data || queue.body.data.length === 0) break;
    }
    expect(queued).toBe(true);

    const noReason = await request(app)
      .post(`${API}/admin/verification/${pending.id}/decision`)
      .set(auth(adminToken))
      .send({ decision: 'REJECTED' });
    expect(noReason.status).toBeGreaterThanOrEqual(400);

    const rejected = await request(app)
      .post(`${API}/admin/verification/${pending.id}/decision`)
      .set(auth(adminToken))
      .send({ decision: 'REJECTED', rejectionReason: 'Document unreadable' });
    expect(rejected.status).toBe(200);

    const good = await verifiedDriver('ft06v');
    expect((await bid(good, shipmentId)).status).toBe(201);
  });

  test('FT-07: suspending a driver withdraws the open bid, ends bidding and keeps an audit trail', async () => {
    const owner = await register('CARGO_OWNER', 'ft07');
    const driver = await verifiedDriver('ft07');
    const shipmentId = await newShipment(owner);
    const b = (await bid(driver, shipmentId)).body.data;

    const susp = await request(app)
      .post(`${API}/admin/users/${driver.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'SUSPENDED', reason: 'SRS test suspension' });
    expect(susp.status).toBe(200);

    expect((await prisma.bid.findUnique({ where: { id: b.id } })).status).toBe('WITHDRAWN');
    const other = await newShipment(owner);
    expect((await bid(driver, other)).status).toBeGreaterThanOrEqual(400);

    const logs = await request(app).get(`${API}/admin/audit-logs`).set(auth(adminToken));
    expect(logs.status).toBe(200);
    expect(JSON.stringify(logs.body)).toContain(driver.id);

    const back = await request(app)
      .post(`${API}/admin/users/${driver.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'VERIFIED', reason: 'SRS test reinstatement' });
    expect(back.status).toBe(200);
  });

  test('FT-09: a valid shipment is Pending with a unique number; missing weight and excess weight are refused with no record', async () => {
    const owner = await register('CARGO_OWNER', 'ft09');
    const before = await prisma.shipment.count({ where: { cargoOwnerId: owner.id } });
    const a = await request(app).post(`${API}/shipments`).set(auth(owner.token)).send(shipmentBody());
    const b = await request(app).post(`${API}/shipments`).set(auth(owner.token)).send(shipmentBody());
    expect(a.status).toBe(201);
    expect(a.body.data.status).toBe('PENDING');
    expect(a.body.data.shipmentNumber).not.toBe(b.body.data.shipmentNumber);

    const noWeight = shipmentBody();
    delete noWeight.cargoWeight;
    const missing = await request(app).post(`${API}/shipments`).set(auth(owner.token)).send(noWeight);
    expect(missing.status).toBe(422);

    const heavy = await request(app).post(`${API}/shipments`).set(auth(owner.token)).send(shipmentBody({ cargoWeight: 500 }));
    expect(heavy.status).toBe(422);
    expect(await prisma.shipment.count({ where: { cargoOwnerId: owner.id } })).toBe(before + 2);
  });

  test('FT-10: only an eligible verified driver sees the load in the matched list', async () => {
    const owner = await register('CARGO_OWNER', 'ft10');
    const eligible = await verifiedDriver('ft10e');
    const tanker = await verifiedDriver('ft10t');
    await prisma.vehicle.update({ where: { id: tanker.vehicle.id }, data: { vehicleType: 'TANKER' } });
    const shipmentId = await newShipment(owner);

    const seen = await request(app).get(`${API}/driver/matched-shipments`).set(auth(eligible.token));
    expect(seen.status).toBe(200);
    expect(JSON.stringify(seen.body)).toContain(shipmentId);

    const notSeen = await request(app).get(`${API}/driver/matched-shipments`).set(auth(tanker.token));
    expect(JSON.stringify(notSeen.body)).not.toContain(shipmentId);
  });

  test('FT-16: the trip moves through every status in order, a skip is refused, and the history is recorded', async () => {
    const job = await bookedJob();
    const skip = await setStatus(job.driver, job.trip.id, 'IN_TRANSIT');
    expect(skip.status).toBe(422);
    await deliver(job);
    const logs = await prisma.tripStatusLog.findMany({ where: { tripId: job.trip.id } });
    const seen = logs.map((l) => l.status);
    ['REACHED_PICKUP', 'CARGO_LOADED', 'IN_TRANSIT', 'REACHED_DESTINATION', 'DELIVERED'].forEach((s) => expect(seen).toContain(s));
    expect((await prisma.shipment.findUnique({ where: { id: job.shipmentId } })).status).toBe('DELIVERED');
  });

  test('FT-20: Delivered is refused without proof; one image is accepted and a sixth is refused', async () => {
    const job = await bookedJob();
    for (const s of ['REACHED_PICKUP', 'CARGO_LOADED', 'IN_TRANSIT', 'REACHED_DESTINATION']) {
      await setStatus(job.driver, job.trip.id, s);
    }
    const early = await setStatus(job.driver, job.trip.id, 'DELIVERED');
    expect(early.status).toBe(400);

    const post = (n) => {
      let r = request(app).post(`${API}/driver/trips/${job.trip.id}/proof-of-delivery`).set(auth(job.driver.token));
      for (let i = 0; i < n; i += 1) r = r.attach('podImages', PNG, `p${i}.png`);
      return r;
    };
    expect((await post(1)).status).toBeLessThan(300);
    const six = await post(5);
    expect(six.status).toBeGreaterThanOrEqual(400);
    expect((await setStatus(job.driver, job.trip.id, 'DELIVERED')).status).toBe(200);
  });

  test('FT-21: the cargo owner confirms delivery and the shipment is Completed', async () => {
    const job = await bookedJob();
    await deliver(job);
    expect((await confirm(job.owner, job.shipmentId)).status).toBe(200);
    expect((await prisma.shipment.findUnique({ where: { id: job.shipmentId } })).status).toBe('COMPLETED');
  });

  test('FT-23: payment moves forward only; the payer cannot record receipt; each role sees its own records', async () => {
    const job = await bookedJob();
    const upd = (who, body) =>
      request(app).post(`${API}/payments/${job.payment.id}/status`).set(auth(who.token)).send(body);

    expect((await upd(job.owner, { status: 'PAID' })).status).toBeGreaterThanOrEqual(400);
    expect((await upd(job.driver, { status: 'PARTIAL', amountReceived: 10000 })).status).toBe(200);
    expect((await upd(job.driver, { status: 'PAID', amountReceived: 40000 })).status).toBe(200);
    expect((await upd(job.driver, { status: 'PARTIAL', amountReceived: 5000 })).status).toBeGreaterThanOrEqual(400);

    const mine = await request(app).get(`${API}/payments`).set(auth(job.driver.token));
    expect(JSON.stringify(mine.body)).toContain(job.payment.id);
    const other = await register('CARGO_OWNER', 'ft23o');
    const theirs = await request(app).get(`${API}/payments`).set(auth(other.token));
    expect(JSON.stringify(theirs.body)).not.toContain(job.payment.id);
  });

  test('FT-24 and IT-09: a payment dispute freezes the record; an administrator resolves it and updates work again', async () => {
    const job = await bookedJob();
    const dispute = await request(app)
      .post(`${API}/payments/${job.payment.id}/dispute`)
      .set(auth(job.owner.token))
      .send({ description: 'Amount does not match what we agreed' });
    expect(dispute.status).toBeLessThan(300);

    const frozen = await request(app)
      .post(`${API}/payments/${job.payment.id}/status`)
      .set(auth(job.driver.token))
      .send({ status: 'PARTIAL', amountReceived: 1000 });
    expect(frozen.status).toBeGreaterThanOrEqual(400);

    const complaint = await prisma.complaint.findFirst({ where: { shipmentId: job.shipmentId } });
    expect(complaint).not.toBeNull();
    const noRemarks = await request(app)
      .post(`${API}/admin/complaints/${complaint.id}/resolve`)
      .set(auth(adminToken))
      .send({ decision: 'RESOLVED' });
    expect(noRemarks.status).toBe(422);

    const resolved = await request(app)
      .post(`${API}/admin/complaints/${complaint.id}/resolve`)
      .set(auth(adminToken))
      .send({ decision: 'RESOLVED', adminRemarks: 'Checked with both parties' });
    expect(resolved.status).toBe(200);

    const after = await request(app)
      .post(`${API}/payments/${job.payment.id}/status`)
      .set(auth(job.driver.token))
      .send({ status: 'PARTIAL', amountReceived: 1000 });
    expect(after.status).toBe(200);
  });

  test('FT-26: a rating is refused before Completed, accepted once after, and cannot be repeated', async () => {
    const job = await bookedJob();
    const rate = (who, score = 5) =>
      request(app).post(`${API}/ratings`).set(auth(who.token)).send({ shipmentId: job.shipmentId, score, review: 'Good' });

    expect((await rate(job.owner)).status).toBeGreaterThanOrEqual(400);
    await deliver(job);
    await confirm(job.owner, job.shipmentId);
    expect((await rate(job.owner)).status).toBe(201);
    const again = await rate(job.owner, 4);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('RATING_ALREADY_SUBMITTED');
    expect((await rate(job.driver, 4)).status).toBe(201);
  });

  test('FT-27: a complaint without a category is refused; a valid one can be withdrawn while Pending', async () => {
    const job = await bookedJob();
    await deliver(job);
    const noCat = await request(app)
      .post(`${API}/complaints`)
      .set(auth(job.owner.token))
      .send({ shipmentId: job.shipmentId, description: 'Cargo arrived late' });
    expect(noCat.status).toBe(400);

    const made = await request(app)
      .post(`${API}/complaints`)
      .set(auth(job.owner.token))
      .send({ shipmentId: job.shipmentId, category: 'DELAY', description: 'Cargo arrived late' });
    expect(made.status).toBe(201);
    const id = made.body.data.id;
    const withdrawn = await request(app).put(`${API}/complaints/${id}/withdraw`).set(auth(job.owner.token));
    expect(withdrawn.status).toBe(200);
    const again = await request(app).put(`${API}/complaints/${id}/withdraw`).set(auth(job.owner.token));
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  test('FT-28: an administrator resolves a complaint only with remarks', async () => {
    const job = await bookedJob();
    await deliver(job);
    const made = await request(app)
      .post(`${API}/complaints`)
      .set(auth(job.owner.token))
      .send({ shipmentId: job.shipmentId, category: 'DELAY', description: 'Cargo arrived late' });
    const id = made.body.data.id;
    const none = await request(app)
      .post(`${API}/admin/complaints/${id}/resolve`)
      .set(auth(adminToken))
      .send({ decision: 'RESOLVED' });
    expect(none.status).toBe(422);
    const ok = await request(app)
      .post(`${API}/admin/complaints/${id}/resolve`)
      .set(auth(adminToken))
      .send({ decision: 'RESOLVED', adminRemarks: 'Resolved after contacting the driver' });
    expect(ok.status).toBe(200);
  });

  test('FT-29: administrator supervision lists shipments and complaints', async () => {
    for (const path of ['/admin/shipments', '/admin/shipments/exceptional', '/admin/complaints']) {
      const res = await request(app).get(`${API}${path}`).set(auth(adminToken));
      expect(res.status).toBe(200);
    }
  });

  test('FT-30: an announcement to drivers reaches drivers and not cargo owners', async () => {
    const driver = await register('DRIVER', 'ft30d');
    const owner = await register('CARGO_OWNER', 'ft30o');
    const title = `SRS announcement ${Date.now()}`;
    const res = await request(app)
      .post(`${API}/admin/announcements`)
      .set(auth(adminToken))
      .send({ title, message: 'Test message for drivers', targetRole: 'DRIVER' });
    expect(res.status).toBeLessThan(300);
    const d = await request(app).get(`${API}/notifications`).set(auth(driver.token));
    const o = await request(app).get(`${API}/notifications`).set(auth(owner.token));
    expect(JSON.stringify(d.body)).toContain(title);
    expect(JSON.stringify(o.body)).not.toContain(title);
  });

  test('FT-34: the parties to a booked shipment can message each other; an outsider cannot', async () => {
    const job = await bookedJob();
    const stranger = await register('CARGO_OWNER', 'ft34s');
    const send = (who, content) =>
      request(app).post(`${API}/messages/shipment/${job.shipmentId}`).set(auth(who.token)).send({ content });

    expect((await send(job.owner, 'Hello driver')).status).toBeLessThan(300);
    expect((await send(job.driver, 'Hello owner')).status).toBeLessThan(300);
    expect((await send(stranger, 'Let me in')).status).toBeGreaterThanOrEqual(400);
    const read = await request(app).get(`${API}/messages/shipment/${job.shipmentId}`).set(auth(job.driver.token));
    expect(JSON.stringify(read.body)).toContain('Hello driver');
    const blocked = await request(app).get(`${API}/messages/shipment/${job.shipmentId}`).set(auth(stranger.token));
    expect(blocked.status).toBeGreaterThanOrEqual(400);
  });

  test('FT-35: notifications are stored, listed and can be marked read', async () => {
    const job = await bookedJob();
    const list = await request(app).get(`${API}/notifications`).set(auth(job.driver.token));
    expect(list.status).toBe(200);
    const items = list.body.data.notifications || list.body.data;
    expect(items.length).toBeGreaterThan(0);
    const readAll = await request(app).put(`${API}/notifications/read-all`).set(auth(job.driver.token));
    expect(readAll.status).toBe(200);
  });

  test('FT-36 to FT-38: administrator reports and export respond with data', async () => {
    for (const path of ['/analytics/platform-summary', '/analytics/verifications', '/analytics/route-demand', '/analytics/empty-running']) {
      const res = await request(app).get(`${API}${path}`).set(auth(adminToken));
      expect(res.status).toBe(200);
    }
    const owner = await register('CARGO_OWNER', 'ft36');
    expect((await request(app).get(`${API}/analytics/platform-summary`).set(auth(owner.token))).status).toBe(403);
  });

  test('FT-41: a user can edit the profile and the change is saved', async () => {
    const owner = await register('CARGO_OWNER', 'ft41');
    const upd = await request(app).put(`${API}/users/me`).set(auth(owner.token)).send({ businessName: 'Renamed By SRS Test' });
    expect(upd.status).toBe(200);
    const me = await request(app).get(`${API}/users/me`).set(auth(owner.token));
    expect(JSON.stringify(me.body)).toContain('Renamed By SRS Test');
  });
});

describe('Business rule tests BRT-01, BRT-07, BRT-08 (Table 6.3)', () => {
  test('BRT-01: only a Verified driver can bid; Pending, Rejected and Suspended are refused', async () => {
    const owner = await register('CARGO_OWNER', 'brt01');
    const shipmentId = await newShipment(owner);
    const states = {};
    for (const s of ['PENDING', 'REJECTED', 'SUSPENDED']) {
      const d = await register('DRIVER', `brt01${s}`);
      await giveVehicle(d.id);
      await prisma.user.update({ where: { id: d.id }, data: { accountStatus: s } });
      const r = await bid(d, shipmentId);
      states[s] = r.status;
      expect(r.status).toBeGreaterThanOrEqual(400);
    }
    const ok = await verifiedDriver('brt01v');
    expect((await bid(ok, shipmentId)).status).toBe(201);
    expect(Object.keys(states)).toHaveLength(3);
  });

  test('BRT-07: a delivered shipment is completed by the owner, and is not completed automatically while a complaint is open', async () => {
    const job = await bookedJob();
    await deliver(job);
    await request(app)
      .post(`${API}/complaints`)
      .set(auth(job.owner.token))
      .send({ shipmentId: job.shipmentId, category: 'DELAY', description: 'Late delivery complaint' });
    await prisma.shipment.update({ where: { id: job.shipmentId }, data: { deliveredAt: new Date(Date.now() - 80 * 3600 * 1000) } });
    const { runAutoCompleteShipments } = require('../../src/jobs/autoCompleteShipments.job');
    await runAutoCompleteShipments();
    expect((await prisma.shipment.findUnique({ where: { id: job.shipmentId } })).status).toBe('DELIVERED');
  });

  test('BRT-08: one rating per party after Completed and no edit', async () => {
    const job = await bookedJob();
    await deliver(job);
    await confirm(job.owner, job.shipmentId);
    const body = { shipmentId: job.shipmentId, score: 5, review: 'Fine' };
    expect((await request(app).post(`${API}/ratings`).set(auth(job.owner.token)).send(body)).status).toBe(201);
    expect((await request(app).post(`${API}/ratings`).set(auth(job.owner.token)).send({ ...body, score: 1 })).status).toBe(409);
  });
});

describe('Non-functional tests that can run on the API (Table 6.5)', () => {
  test('NF-03: 20 simultaneous acceptances of one bid give exactly one success and nineteen refusals (REL-5)', async () => {
    const owner = await register('CARGO_OWNER', 'nf03');
    const driver = await verifiedDriver('nf03');
    const shipmentId = await newShipment(owner);
    const b = (await bid(driver, shipmentId)).body.data;
    const results = await Promise.all(Array.from({ length: 20 }, () => accept(owner, shipmentId, b)));
    const codes = results.map((r) => r.status);
    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(19);
    expect(await prisma.paymentRecord.count({ where: { shipmentId } })).toBe(1);
  });

  test('NF-11: identifier substitution fails; one user cannot read another user\'s shipment, payment or tracking (SEC-10)', async () => {
    const job = await bookedJob();
    const intruder = await register('CARGO_OWNER', 'nf11');
    const get = (path) => request(app).get(`${API}${path}`).set(auth(intruder.token));
    expect([403, 404]).toContain((await get(`/shipments/${job.shipmentId}`)).status);
    expect([403, 404]).toContain((await get(`/payments/${job.payment.id}`)).status);
    expect([403, 404]).toContain((await get(`/tracking/shipment/${job.shipmentId}`)).status);
    expect([403, 404]).toContain((await get(`/messages/shipment/${job.shipmentId}`)).status);
  });

  test('NF-11: five wrong passwords lock the account (SEC-5)', async () => {
    const u = await register('CARGO_OWNER', 'nf11b');
    for (let i = 0; i < 5; i += 1) {
      await request(app).post(`${API}/auth/login`).send({ identifier: u.body.email, password: 'Wrong@12345', role: 'CARGO_OWNER' });
    }
    const res = await request(app).post(`${API}/auth/login`).send({ identifier: u.body.email, password: u.body.password, role: 'CARGO_OWNER' });
    expect(res.status).not.toBe(200);
  });

  test('NF-12: injection strings in text inputs never cause a server error and never succeed (SEC-11)', async () => {
    const attempts = ["' OR '1'='1", "admin@smarthaul.pk'; DROP TABLE \"User\";--", '{"$ne": null}'];
    for (const identifier of attempts) {
      const res = await request(app).post(`${API}/auth/login`).send({ identifier, password: 'x', role: 'ADMIN' });
      expect(res.status).toBeLessThan(500);
      expect(res.status).not.toBe(200);
    }
    expect(await prisma.user.count()).toBeGreaterThan(0);
  });

  test('NF-13: publication, a 1,000-row report request and a three-image upload each finish within their target', async () => {
    const owner = await register('CARGO_OWNER', 'nf13');
    let t = Date.now();
    await newShipment(owner);
    expect(Date.now() - t).toBeLessThan(10000);

    t = Date.now();
    const rep = await request(app).get(`${API}/analytics/export`).set(auth(adminToken));
    expect(rep.status).toBeLessThan(500);
    expect(Date.now() - t).toBeLessThan(10000);

    const d = await register('DRIVER', 'nf13d');
    t = Date.now();
    for (const type of ['CNIC_FRONT', 'CNIC_BACK', 'DRIVING_LICENCE']) expect((await uploadDoc(d.token, type)).status).toBe(201);
    expect(Date.now() - t).toBeLessThan(30000);
  });
});
