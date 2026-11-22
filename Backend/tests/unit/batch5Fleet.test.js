jest.setTimeout(30000);

const mockPrisma = {
  paymentRecord: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  paymentStatusLog: { create: jest.fn() },
  complaint: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  shipment: { findUnique: jest.fn() },
  shipmentMessage: { create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  rating: { findUnique: jest.fn(), create: jest.fn(), aggregate: jest.fn() },
  user: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  driverFleetLink: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
  vehicle: { findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
  trip: { findFirst: jest.fn(), count: jest.fn(), upsert: jest.fn() },
  bid: { count: jest.fn() },
  tripStatusLog: { create: jest.fn() },
  driverPenalty: { findFirst: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};
jest.mock('../../src/config/db', () => mockPrisma);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/services/fcm.service', () => ({ dispatchNotification: jest.fn() }));
jest.mock('../../src/services/audit.service', () => ({ logAdminAction: jest.fn() }));
jest.mock('../../src/services/storage.service', () => ({
  uploadComplaintAttachment: jest.fn(),
  generateSignedReadUrl: jest.fn(),
  getAbsolutePath: jest.fn(),
}));
jest.mock('../../src/utils/reference', () => ({ nextReference: jest.fn(), createWithReference: jest.fn() }));

const fs = require('fs');
const path = require('path');
const payments = require('../../src/modules/payments/payment.controller');
const chat = require('../../src/modules/messages/chat.controller');
const ratings = require('../../src/modules/ratings/rating.controller');
const complaints = require('../../src/modules/complaints/complaint.controller');
const admin = require('../../src/modules/admin/admin.controller');
const fleet = require('../../src/modules/fleet/fleet.controller');
const driver = require('../../src/modules/driver/driver.controller');
const storage = require('../../src/services/storage.service');
const { dispatchNotification } = require('../../src/services/fcm.service');
const { nextReference } = require('../../src/utils/reference');

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
const code = (res) => res.body && res.body.error && res.body.error.code;

const co = { id: 'co', role: 'CARGO_OWNER', name: 'Cargo' };
const fl = { id: 'fl', role: 'FLEET_OWNER', name: 'Fleet' };
const emp = { id: 'emp', role: 'DRIVER', name: 'Employee' };
const adm = { id: 'adm', role: 'ADMIN', name: 'Admin' };
const record = (o = {}) => ({
  id: 'p1', shipmentId: 's1', cargoOwnerId: 'co', driverId: 'emp', fleetOwnerId: 'fl', payeeId: 'fl',
  agreedFare: 50000, amountReceived: 0, status: 'PENDING', isFrozen: false,
  shipment: { id: 's1', shipmentNumber: 'SH-1', status: 'IN_TRANSIT' }, ...o,
});

beforeEach(() => {
  jest.resetAllMocks();
  nextReference.mockResolvedValue('CMP-2026-0001');
  storage.uploadComplaintAttachment.mockResolvedValue('complaints/x/a.jpg');
  storage.getAbsolutePath.mockImplementation((k) => `/tmp/none/${k}`);
  mockPrisma.$transaction.mockImplementation(async (arg) => (typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg)));
  mockPrisma.paymentRecord.findUnique.mockResolvedValue(record());
  mockPrisma.paymentRecord.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.complaint.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.complaint.count.mockResolvedValue(0);
  mockPrisma.complaint.create.mockImplementation(async ({ data }) => ({ id: 'c1', ...data }));
  mockPrisma.user.findMany.mockResolvedValue([]);
});

describe('payments (C-09, C-21)', () => {
  test('the cargo owner cannot mark a payment received', async () => {
    const res = await run(payments.updatePaymentStatus, { user: co, params: { id: 'p1' }, body: { status: 'PAID' } });
    expect(res.statusCode).toBe(403);
    expect(code(res)).toBe('ONLY_PAYEE_CONFIRMS');
    expect(mockPrisma.paymentRecord.updateMany).not.toHaveBeenCalled();
  });

  test('the employee driver is not a party: no update, no view', async () => {
    const u = await run(payments.updatePaymentStatus, { user: emp, params: { id: 'p1' }, body: { status: 'PAID' } });
    expect(u.statusCode).toBe(403);
    const g = await run(payments.getPaymentRecordById, { user: emp, params: { id: 'p1' } });
    expect(g.statusCode).toBe(403);
  });

  test('the payee records Paid at the full fare and the cargo owner is told', async () => {
    const res = await run(payments.updatePaymentStatus, { user: fl, params: { id: 'p1' }, body: { status: 'PAID' } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.paymentRecord.updateMany.mock.calls[0][0].data).toEqual({ status: 'PAID', amountReceived: 50000 });
    expect(dispatchNotification.mock.calls.map((c) => c[0].recipientId)).toEqual(['co']);
  });

  test.each([
    ['Paid is final', record({ status: 'PAID', amountReceived: 50000 }), { status: 'PARTIAL', amountReceived: 100 }, 409, 'PAYMENT_ALREADY_PAID'],
    ['Partial with no amount', record(), { status: 'PARTIAL' }, 400, 'AMOUNT_REQUIRED'],
    ['Partial of zero', record(), { status: 'PARTIAL', amountReceived: 0 }, 400, 'INVALID_PARTIAL_AMOUNT'],
    ['Partial equal to the fare', record(), { status: 'PARTIAL', amountReceived: 50000 }, 400, 'INVALID_PARTIAL_AMOUNT'],
    ['Partial above the fare', record(), { status: 'PARTIAL', amountReceived: 60000 }, 400, 'AMOUNT_EXCEEDS_AGREED_FARE'],
    ['Partial that goes down', record({ status: 'PARTIAL', amountReceived: 20000 }), { status: 'PARTIAL', amountReceived: 10000 }, 400, 'AMOUNT_NOT_INCREASED'],
    ['Paid with a smaller amount', record(), { status: 'PAID', amountReceived: 10 }, 400, 'AMOUNT_MISMATCH_FOR_PAID'],
  ])('%s', async (_n, rec, body, status, errCode) => {
    mockPrisma.paymentRecord.findUnique.mockResolvedValue(rec);
    const res = await run(payments.updatePaymentStatus, { user: fl, params: { id: 'p1' }, body });
    expect(res.statusCode).toBe(status);
    expect(code(res)).toBe(errCode);
  });

  test('a record changed by someone else in the meantime is refused, not overwritten', async () => {
    mockPrisma.paymentRecord.updateMany.mockResolvedValue({ count: 0 });
    const res = await run(payments.updatePaymentStatus, { user: fl, params: { id: 'p1' }, body: { status: 'PAID' } });
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('PAYMENT_CHANGED');
    expect(mockPrisma.paymentStatusLog.create).not.toHaveBeenCalled();
  });

  test('listing is scoped by payee for drivers and fleets, and the status filter is checked', async () => {
    mockPrisma.paymentRecord.count.mockResolvedValue(0);
    mockPrisma.paymentRecord.findMany.mockResolvedValue([]);
    await run(payments.listPaymentRecords, { user: emp });
    expect(mockPrisma.paymentRecord.findMany.mock.calls[0][0].where).toEqual({ payeeId: 'emp' });
    const bad = await run(payments.listPaymentRecords, { user: co, query: { status: 'NOPE' } });
    expect(bad.statusCode).toBe(400);
  });

  test('a payment dispute freezes the record once: the second one is refused (C-39)', async () => {
    const first = await run(payments.raisePaymentDispute, { user: co, params: { id: 'p1' }, body: { description: 'Not paid yet' } });
    expect(first.statusCode).toBe(201);
    expect(mockPrisma.complaint.create.mock.calls[0][0].data.counterpartyId).toBe('fl');

    mockPrisma.paymentRecord.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.complaint.create.mockClear();
    const second = await run(payments.raisePaymentDispute, { user: fl, params: { id: 'p1' }, body: { description: 'Again please' } });
    expect(second.statusCode).toBe(409);
    expect(code(second)).toBe('DISPUTE_ALREADY_OPEN');
    expect(mockPrisma.complaint.create).not.toHaveBeenCalled();
  });

  test('an employee driver cannot raise a payment dispute', async () => {
    const res = await run(payments.raisePaymentDispute, { user: emp, params: { id: 'p1' }, body: { description: 'Not paid yet' } });
    expect(res.statusCode).toBe(403);
  });
});

describe('chat (C-37)', () => {
  const shipment = (o = {}) => ({ id: 's1', cargoOwnerId: 'co', status: 'BOOKED', trip: null, bids: [{ bidderId: 'fl' }], ...o });

  test('before a fleet assigns a driver there is no trip, and the thread still works', async () => {
    mockPrisma.shipment.findUnique.mockResolvedValue(shipment());
    mockPrisma.shipmentMessage.create.mockImplementation(async ({ data }) => ({ id: 'm1', ...data }));
    const res = await run(chat.sendShipmentMessage, { user: co, params: { shipmentId: 's1' }, body: { content: ' hello ' } });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.shipmentMessage.create.mock.calls[0][0].data).toMatchObject({ recipientId: 'fl', content: 'hello' });
    expect(dispatchNotification.mock.calls[0][0].type).toBe('NEW_MESSAGE');
  });

  test('the fleet owner can write to the cargo owner, and an outsider cannot', async () => {
    mockPrisma.shipment.findUnique.mockResolvedValue(shipment());
    mockPrisma.shipmentMessage.create.mockImplementation(async ({ data }) => ({ id: 'm1', ...data }));
    const ok = await run(chat.sendShipmentMessage, { user: fl, params: { shipmentId: 's1' }, body: { content: 'on it' } });
    expect(ok.statusCode).toBe(201);
    expect(mockPrisma.shipmentMessage.create.mock.calls[0][0].data.recipientId).toBe('co');
    const no = await run(chat.sendShipmentMessage, { user: emp, params: { shipmentId: 's1' }, body: { content: 'hi' } });
    expect(no.statusCode).toBe(403);
  });

  test('once a driver is assigned the cargo owner writes to the driver', async () => {
    mockPrisma.shipment.findUnique.mockResolvedValue(shipment({ trip: { driverId: 'emp', fleetOwnerId: 'fl' } }));
    mockPrisma.shipmentMessage.create.mockImplementation(async ({ data }) => ({ id: 'm1', ...data }));
    await run(chat.sendShipmentMessage, { user: co, params: { shipmentId: 's1' }, body: { content: 'hi' } });
    expect(mockPrisma.shipmentMessage.create.mock.calls[0][0].data.recipientId).toBe('emp');
  });

  test.each([
    ['empty', '   ', 'EMPTY_MESSAGE'],
    ['not text', 42, 'EMPTY_MESSAGE'],
    ['too long', 'x'.repeat(1001), 'MESSAGE_TOO_LONG'],
  ])('%s content is a 400, never a 500', async (_n, content, errCode) => {
    const res = await run(chat.sendShipmentMessage, { user: co, params: { shipmentId: 's1' }, body: { content } });
    expect(res.statusCode).toBe(400);
    expect(code(res)).toBe(errCode);
  });
});

describe('ratings (C-38)', () => {
  const completed = (o = {}) => ({
    id: 's1', cargoOwnerId: 'co', status: 'COMPLETED',
    trip: { driverId: 'emp', fleetOwnerId: 'fl' }, paymentRecord: record(), ...o,
  });
  beforeEach(() => {
    mockPrisma.shipment.findUnique.mockResolvedValue(completed());
    mockPrisma.rating.findUnique.mockResolvedValue(null);
    mockPrisma.rating.aggregate.mockResolvedValue({ _avg: { score: 4.25 }, _count: { _all: 4 } });
  });

  test.each([[4.5], [0], [6], ['5'], [undefined]])('score %p is refused', async (score) => {
    const res = await run(ratings.submitRating, { user: co, body: { shipmentId: 's1', score } });
    expect(res.statusCode).toBe(400);
    expect(code(res)).toBe('INVALID_SCORE');
  });

  test('a fleet booking rates the fleet owner, not the employee driver; the user row is locked first', async () => {
    const res = await run(ratings.submitRating, { user: co, body: { shipmentId: 's1', score: 5 } });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.rating.create.mock.calls[0][0].data.toUserId).toBe('fl');
    expect(mockPrisma.user.update.mock.calls[0][0]).toEqual({ where: { id: 'fl' }, data: { avgRating: 4.3, totalRatings: 4 } });
    expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mockPrisma.rating.create.mock.invocationCallOrder[0]);
  });

  test('the fleet owner rates the cargo owner; the employee driver cannot rate', async () => {
    const ok = await run(ratings.submitRating, { user: fl, body: { shipmentId: 's1', score: 4 } });
    expect(ok.statusCode).toBe(201);
    expect(mockPrisma.rating.create.mock.calls[0][0].data.toUserId).toBe('co');
    const no = await run(ratings.submitRating, { user: emp, body: { shipmentId: 's1', score: 4 } });
    expect(no.statusCode).toBe(403);
  });

  test('a double submit that races past the check becomes a 409, not a 500', async () => {
    mockPrisma.rating.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const res = await run(ratings.submitRating, { user: co, body: { shipmentId: 's1', score: 5 } });
    expect(res.statusCode).toBe(409);
  });
});

describe('complaints (C-39)', () => {
  const shipment = (o = {}) => ({ id: 's1', shipmentNumber: 'SH-1', cargoOwnerId: 'co', trip: { driverId: 'emp', fleetOwnerId: 'fl' }, paymentRecord: record(), ...o });
  beforeEach(() => mockPrisma.shipment.findUnique.mockResolvedValue(shipment()));

  test.each([
    ['a prototype key as category', { shipmentId: 's1', category: 'constructor', description: 'long enough' }, 'INVALID_CATEGORY'],
    ['no description', { shipmentId: 's1', category: 'PAYMENT_DISPUTE' }, 'INVALID_DESCRIPTION'],
    ['a description that is too short', { shipmentId: 's1', category: 'PAYMENT_DISPUTE', description: 'no' }, 'INVALID_DESCRIPTION'],
  ])('%s is a 400', async (_n, body, errCode) => {
    const res = await run(complaints.createComplaint, { user: co, body });
    expect(res.statusCode).toBe(400);
    expect(code(res)).toBe(errCode);
  });

  test('a second payment dispute is refused and the files already written are removed', async () => {
    mockPrisma.paymentRecord.updateMany.mockResolvedValue({ count: 0 });
    const unlink = jest.spyOn(fs.promises, 'unlink').mockResolvedValue();
    const res = await run(complaints.createComplaint, {
      user: co, files: [{ buffer: Buffer.from('x'), mimetype: 'image/png' }],
      body: { shipmentId: 's1', category: 'PAYMENT_DISPUTE', description: 'Still unpaid' },
    });
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('DISPUTE_ALREADY_OPEN');
    expect(unlink).toHaveBeenCalledTimes(1);
    unlink.mockRestore();
  });

  test('the employee driver cannot dispute the payment', async () => {
    const dispute = await run(complaints.createComplaint, { user: emp, body: { shipmentId: 's1', category: 'PAYMENT_DISPUTE', description: 'Not paid yet' } });
    expect(dispute.statusCode).toBe(403);
  });

  test('withdrawing keeps the payment frozen while another dispute is open', async () => {
    mockPrisma.complaint.findUnique.mockResolvedValue({ id: 'c1', submitterId: 'co', status: 'PENDING', category: 'PAYMENT_DISPUTE', shipmentId: 's1', shipment: { paymentRecord: { id: 'p1' } } });
    mockPrisma.complaint.count.mockResolvedValue(1);
    const res = await run(complaints.withdrawComplaint, { user: co, params: { id: 'c1' } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.paymentRecord.update).not.toHaveBeenCalled();

    mockPrisma.complaint.count.mockResolvedValue(0);
    await run(complaints.withdrawComplaint, { user: co, params: { id: 'c1' } });
    expect(mockPrisma.paymentRecord.update.mock.calls[0][0].data).toEqual({ isFrozen: false });
  });
});

describe('admin complaints (C-40)', () => {
  const dispute = (o = {}) => ({
    id: 'c1', referenceCode: 'CMP-1', status: 'PENDING', category: 'PAYMENT_DISPUTE', shipmentId: 's1', submitterId: 'co', counterpartyId: 'fl',
    shipment: { paymentRecord: record({ isFrozen: true }) }, ...o,
  });
  const resolve = (body, c = dispute()) => {
    mockPrisma.complaint.findUnique.mockResolvedValue(c);
    return run(admin.resolveComplaint, { user: adm, params: { id: 'c1' }, body: { decision: 'RESOLVED', adminRemarks: 'Checked', ...body } });
  };

  test('a closed complaint cannot be resolved again, so the fare is not adjusted twice', async () => {
    const res = await resolve({ adjustedFare: 40000 }, dispute({ status: 'RESOLVED' }));
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('COMPLAINT_ALREADY_CLOSED');
    expect(mockPrisma.paymentRecord.update).not.toHaveBeenCalled();
  });

  test('losing the race to another administrator is a 409', async () => {
    mockPrisma.complaint.updateMany.mockResolvedValue({ count: 0 });
    const res = await resolve({ adjustedFare: 40000 });
    expect(res.statusCode).toBe(409);
    expect(mockPrisma.paymentRecord.update).not.toHaveBeenCalled();
  });

  test('a resolved dispute adjusts the fare and keeps the amounts consistent', async () => {
    const res = await resolve({ adjustedFare: 40000, adjustedPaymentStatus: 'PAID' });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.paymentRecord.update.mock.calls[0][0].data).toEqual({ isFrozen: false, agreedFare: 40000, amountReceived: 40000, status: 'PAID' });
  });

  test('a fare below what was already received is refused', async () => {
    const res = await resolve({ adjustedFare: 1000 }, dispute({ shipment: { paymentRecord: record({ isFrozen: true, status: 'PARTIAL', amountReceived: 20000 }) } }));
    expect(res.statusCode).toBe(400);
    expect(code(res)).toBe('AMOUNT_EXCEEDS_AGREED_FARE');
  });

  test('a rejected dispute cannot carry an adjustment', async () => {
    const res = await resolve({ decision: 'REJECTED', adjustedFare: 100 });
    expect(res.statusCode).toBe(400);
    expect(code(res)).toBe('ADJUSTMENT_NOT_ALLOWED');
  });

  test('a rejected dispute unfreezes and leaves the amounts alone', async () => {
    await resolve({ decision: 'REJECTED' });
    expect(mockPrisma.paymentRecord.update.mock.calls[0][0].data).toEqual({ isFrozen: false });
  });

  test('invalid list filters are a 400', async () => {
    expect((await run(admin.listComplaints, { user: adm, query: { status: 'BOGUS' } })).statusCode).toBe(400);
    expect((await run(admin.listComplaints, { user: adm, query: { category: 'toString' } })).statusCode).toBe(400);
  });
});

describe('fleet drivers (C-10)', () => {
  test('linking a driver sends an invitation; nobody joins without accepting', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'emp', name: 'Employee', accountStatus: 'VERIFIED' });
    mockPrisma.driverFleetLink.findUnique.mockResolvedValue(null);
    const res = await run(fleet.linkDriver, { user: fl, body: { driverId: 'emp' } });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.driverFleetLink.create.mock.calls[0][0].data.status).toBe('INVITED');
    expect(dispatchNotification.mock.calls[0][0]).toMatchObject({ recipientId: 'emp', type: 'FLEET_INVITATION' });
  });

  test('an unverified driver, or one already linked, cannot be invited', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'emp', accountStatus: 'PENDING' });
    expect((await run(fleet.linkDriver, { user: fl, body: { driverId: 'emp' } })).statusCode).toBe(422);
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'emp', accountStatus: 'VERIFIED' });
    mockPrisma.driverFleetLink.findUnique.mockResolvedValue({ fleetOwnerId: 'other', status: 'ACTIVE' });
    expect((await run(fleet.linkDriver, { user: fl, body: { driverId: 'emp' } })).statusCode).toBe(409);
  });

  test('the available-drivers list no longer shows phone or email', async () => {
    mockPrisma.driverFleetLink.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    await run(fleet.listAvailableDrivers, { user: fl });
    expect(Object.keys(mockPrisma.user.findMany.mock.calls[0][0].select).sort()).toEqual(['avgRating', 'completedTripsCount', 'id', 'name']);
  });
});

describe('assignTripResources (C-09, C-10)', () => {
  const body = { shipmentId: 's1', vehicleId: 'v1', driverId: 'emp' };
  beforeEach(() => {
    mockPrisma.shipment.findUnique.mockResolvedValue({ id: 's1', shipmentNumber: 'SH-1', status: 'BOOKED', cargoWeight: 5, trip: null, bids: [{ proposedFare: 50000 }] });
    mockPrisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', model: 'M', ratedCapacity: 10, availabilityStatus: 'AVAILABLE' });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'emp', name: 'Employee', accountStatus: 'VERIFIED' });
    mockPrisma.driverFleetLink.findFirst.mockResolvedValue({ id: 'l1' });
    mockPrisma.trip.findFirst.mockResolvedValue(null);
    mockPrisma.vehicle.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.trip.upsert.mockResolvedValue({ id: 't1' });
  });

  test('assigns a linked driver and leaves the payment record untouched', async () => {
    const res = await run(fleet.assignTripResources, { user: fl, body });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.paymentRecord.update).not.toHaveBeenCalled();
  });

  test('a driver outside the fleet, or one who has not accepted, is refused', async () => {
    mockPrisma.driverFleetLink.findFirst.mockResolvedValue(null);
    const res = await run(fleet.assignTripResources, { user: fl, body });
    expect(res.statusCode).toBe(403);
    expect(code(res)).toBe('DRIVER_NOT_IN_FLEET');
    expect(mockPrisma.driverFleetLink.findFirst.mock.calls[0][0].where).toMatchObject({ status: 'ACTIVE', fleetOwnerId: 'fl' });
  });

  test('a driver on another live trip is refused (FR-FO-11)', async () => {
    mockPrisma.trip.findFirst.mockResolvedValue({ id: 'other' });
    const res = await run(fleet.assignTripResources, { user: fl, body });
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('DRIVER_BUSY');
  });

  test('a vehicle taken by a parallel booking is a 409 and no trip is written', async () => {
    mockPrisma.vehicle.updateMany.mockResolvedValue({ count: 0 });
    const res = await run(fleet.assignTripResources, { user: fl, body });
    expect(res.statusCode).toBe(409);
    expect(mockPrisma.trip.upsert).not.toHaveBeenCalled();
  });

  test('changing vehicle on an existing trip frees the old one', async () => {
    mockPrisma.shipment.findUnique.mockResolvedValue({ id: 's1', shipmentNumber: 'SH-1', status: 'BOOKED', cargoWeight: 5, trip: { vehicleId: 'old' }, bids: [{ proposedFare: 1 }] });
    await run(fleet.assignTripResources, { user: fl, body });
    expect(mockPrisma.vehicle.updateMany.mock.calls[1][0]).toEqual({ where: { id: 'old', availabilityStatus: 'ASSIGNED' }, data: { availabilityStatus: 'AVAILABLE' } });
  });
});

describe('vehicles (C-41)', () => {
  test('capacity outside the body type range is refused', async () => {
    const res = await run(fleet.addVehicle, { user: fl, body: { registrationNumber: 'ABC-123', vehicleType: 'OPEN_BODY', ratedCapacity: 20, model: 'Shehzore', year: 2020 } });
    expect(res.statusCode).toBe(422);
    expect(code(res)).toBe('CAPACITY_OUT_OF_RANGE');
  });

  test('a default driver must be an accepted driver of this fleet', async () => {
    mockPrisma.driverFleetLink.findFirst.mockResolvedValue(null);
    const res = await run(fleet.addVehicle, { user: fl, body: { registrationNumber: 'ABC-123', vehicleType: 'OPEN_BODY', ratedCapacity: 2, model: 'Shehzore', year: 2020, defaultDriverId: 'x' } });
    expect(res.statusCode).toBe(422);
    expect(code(res)).toBe('DRIVER_NOT_IN_FLEET');
  });

  test('availability cannot be set to Assigned by hand, nor changed while assigned', async () => {
    mockPrisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', availabilityStatus: 'AVAILABLE' });
    expect((await run(fleet.updateVehicle, { user: fl, params: { id: 'v1' }, body: { availabilityStatus: 'ASSIGNED' } })).statusCode).toBe(422);
    mockPrisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', availabilityStatus: 'ASSIGNED' });
    const res = await run(fleet.updateVehicle, { user: fl, params: { id: 'v1' }, body: { availabilityStatus: 'INACTIVE' } });
    expect(res.statusCode).toBe(409);
  });

  test('an update is conditional on the availability that was read, and the response hides ciphertext', async () => {
    mockPrisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', availabilityStatus: 'AVAILABLE' });
    mockPrisma.vehicle.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.vehicle.findUnique.mockResolvedValue({ id: 'v1', model: 'M', registrationNumberEncrypted: 'x', registrationNumberHash: 'h' });
    const res = await run(fleet.updateVehicle, { user: fl, params: { id: 'v1' }, body: { model: 'New' } });
    expect(mockPrisma.vehicle.updateMany.mock.calls[0][0].where).toEqual({ id: 'v1', ownerId: 'fl', availabilityStatus: 'AVAILABLE' });
    expect(res.body.data).toEqual({ id: 'v1', model: 'M' });
  });

  test('a vehicle with history is made Inactive, not deleted; a clean one is deleted', async () => {
    mockPrisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', availabilityStatus: 'AVAILABLE' });
    mockPrisma.trip.findFirst.mockResolvedValue(null);
    mockPrisma.trip.count.mockResolvedValue(3);
    mockPrisma.bid.count.mockResolvedValue(0);
    mockPrisma.vehicle.updateMany.mockResolvedValue({ count: 1 });
    const soft = await run(fleet.deleteVehicle, { user: fl, params: { id: 'v1' } });
    expect(soft.statusCode).toBe(200);
    expect(soft.body.data).toEqual({ deactivated: true });
    expect(mockPrisma.vehicle.deleteMany).not.toHaveBeenCalled();

    mockPrisma.trip.count.mockResolvedValue(0);
    mockPrisma.vehicle.deleteMany.mockResolvedValue({ count: 1 });
    const hard = await run(fleet.deleteVehicle, { user: fl, params: { id: 'v1' } });
    expect(hard.body.data).toEqual({ deactivated: false });
  });

  test("another owner's vehicle is a 404 before anything else", async () => {
    mockPrisma.vehicle.findFirst.mockResolvedValue(null);
    const res = await run(fleet.deleteVehicle, { user: fl, params: { id: 'v9' } });
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.trip.findFirst).not.toHaveBeenCalled();
  });
});

describe('driver invitations (C-10)', () => {
  test('accepting activates the link and tells the fleet owner; a second tap finds nothing', async () => {
    mockPrisma.driverFleetLink.findFirst.mockResolvedValue({ id: 'l1', fleetOwnerId: 'fl' });
    mockPrisma.driverFleetLink.updateMany.mockResolvedValue({ count: 1 });
    const ok = await run(driver.acceptFleetInvitation, { user: emp, params: { id: 'l1' } });
    expect(ok.statusCode).toBe(200);
    expect(mockPrisma.driverFleetLink.updateMany.mock.calls[0][0].data).toEqual({ status: 'ACTIVE' });
    expect(dispatchNotification.mock.calls[0][0].recipientId).toBe('fl');

    mockPrisma.driverFleetLink.updateMany.mockResolvedValue({ count: 0 });
    expect((await run(driver.acceptFleetInvitation, { user: emp, params: { id: 'l1' } })).statusCode).toBe(404);
  });

  test('declining removes the invitation', async () => {
    mockPrisma.driverFleetLink.findFirst.mockResolvedValue({ id: 'l1', fleetOwnerId: 'fl' });
    mockPrisma.driverFleetLink.deleteMany.mockResolvedValue({ count: 1 });
    const res = await run(driver.declineFleetInvitation, { user: emp, params: { id: 'l1' } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.driverFleetLink.deleteMany).toHaveBeenCalled();
  });

  test('another driver cannot answer an invitation that is not theirs', async () => {
    mockPrisma.driverFleetLink.findFirst.mockResolvedValue(null);
    expect((await run(driver.acceptFleetInvitation, { user: { ...emp, id: 'x' }, params: { id: 'l1' } })).statusCode).toBe(404);
    expect(mockPrisma.driverFleetLink.findFirst.mock.calls[0][0].where).toEqual({ id: 'l1', driverId: 'x', status: 'INVITED' });
  });
});

describe('schema', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  test('the payee is stored on the payment record and links carry a status', () => {
    expect(schema).toMatch(/model PaymentRecord[\s\S]*?payeeId\s+String\?/);
    expect(schema).toMatch(/enum LinkStatus\s*{\s*INVITED\s+ACTIVE\s*}/);
    expect(schema).toMatch(/model DriverFleetLink[\s\S]*?status\s+LinkStatus\s+@default\(INVITED\)/);
  });
  test('the accept-bid transaction records the payee', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/modules/cargo-owner/cargoOwner.controller.js'), 'utf8');
    expect(src).toMatch(/payeeId: bid\.bidderId/);
  });
});
