jest.setTimeout(30000);

const mockPrisma = {
  bid: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  shipment: { findUnique: jest.fn(), updateMany: jest.fn() },
  paymentRecord: { delete: jest.fn() },
  trip: { delete: jest.fn() },
  vehicle: { update: jest.fn() },
  user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  driverPenalty: { create: jest.fn(), count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  complaint: { findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../../src/config/db', () => mockPrisma);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/services/fcm.service', () => ({ dispatchNotification: jest.fn() }));
jest.mock('../../src/services/audit.service', () => ({ logAdminAction: jest.fn() }));
jest.mock('../../src/services/storage.service', () => ({ uploadComplaintAttachment: jest.fn(), generateSignedReadUrl: jest.fn(), getAbsolutePath: jest.fn() }));
jest.mock('../../src/utils/reference', () => ({ nextReference: jest.fn().mockResolvedValue('CMP-2026-0001'), createWithReference: jest.fn() }));
jest.mock('../../src/modules/matching/matching.service', () => ({ computeRecommendationsForShipment: jest.fn(), isCargoCompatibleWithVehicle: jest.fn() }));

const cargo = require('../../src/modules/cargo-owner/cargoOwner.controller');
const driver = require('../../src/modules/driver/driver.controller');
const complaints = require('../../src/modules/complaints/complaint.controller');
const admin = require('../../src/modules/admin/admin.controller');
const { runBidExpiry } = require('../../src/jobs/bidExpiry.job');
const { isBidExpired, bidCutoff } = require('../../src/utils/bids');
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
const code = (res) => res.body && res.body.error && res.body.error.code;
const hoursAgo = (h) => new Date(Date.now() - h * 3600e3);
const co = { id: 'co', role: 'CARGO_OWNER', name: 'Cargo' };
const drv = { id: 'd1', role: 'DRIVER', name: 'Drv' };
const adm = { id: 'adm', role: 'ADMIN', name: 'Admin' };

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(async (arg) => (typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg)));
});

describe('bid expiry (24 hours)', () => {
  test('a bid is expired from exactly 24 hours after it was placed', () => {
    expect(isBidExpired({ createdAt: hoursAgo(23) })).toBe(false);
    expect(isBidExpired({ createdAt: hoursAgo(25) })).toBe(true);
    expect(isBidExpired({})).toBe(false);
    expect(Math.abs(bidCutoff().getTime() - (Date.now() - 24 * 3600e3))).toBeLessThan(2000);
  });

  test('the job expires stale active bids, notifies each bidder, and skips one accepted a moment ago', async () => {
    mockPrisma.bid.findMany.mockResolvedValue([
      { id: 'b1', bidderId: 'u1', shipmentId: 's1', shipment: { shipmentNumber: 'SH-1' } },
      { id: 'b2', bidderId: 'u2', shipmentId: 's2', shipment: { shipmentNumber: 'SH-2' } },
    ]);
    mockPrisma.bid.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await runBidExpiry();
    expect(mockPrisma.bid.findMany.mock.calls[0][0].where.status).toBe('ACTIVE');
    expect(mockPrisma.bid.updateMany.mock.calls[0][0].data).toEqual({ status: 'EXPIRED' });
    expect(dispatchNotification).toHaveBeenCalledTimes(1);
    expect(dispatchNotification.mock.calls[0][0]).toMatchObject({ recipientId: 'u1', type: 'BID_EXPIRED' });
  });

  test('a bidder cannot revise an expired bid', async () => {
    mockPrisma.bid.findUnique.mockResolvedValue({ id: 'b1', bidderId: 'd1', status: 'ACTIVE', createdAt: hoursAgo(30) });
    const res = await run(driver.updateBid, { user: drv, params: { id: 'b1' }, body: { proposedFare: 5000 } });
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('BID_EXPIRED');
  });
});

describe('no-show (flagNoShow)', () => {
  const booked = (o = {}) => ({
    id: 's1', shipmentNumber: 'SH-1', cargoOwnerId: 'co', status: 'BOOKED',
    trip: { id: 't1', driverId: 'd1', vehicleId: 'v1' },
    paymentRecord: { id: 'p1', status: 'PENDING', amountReceived: 0, isFrozen: false, payeeId: 'd1' },
    ...o,
  });
  const flag = (shipment, body = {}) => {
    mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
    return run(cargo.flagNoShow, { user: co, params: { id: 's1' }, body });
  };
  const ok = () => {
    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.driverPenalty.create.mockResolvedValue({});
  };

  test('only the cargo owner of that shipment can flag', async () => {
    const res = await flag(booked({ cargoOwnerId: 'someone-else' }));
    expect(res.statusCode).toBe(404);
  });

  test('only while Booked: once the driver is on the way it is not a no-show', async () => {
    const res = await flag(booked({ status: 'REACHED_PICKUP' }));
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('NOT_BOOKED');
    expect(mockPrisma.driverPenalty.create).not.toHaveBeenCalled();
  });

  test('a recorded payment blocks it and points to a complaint', async () => {
    const res = await flag(booked({ paymentRecord: { id: 'p1', status: 'PARTIAL', amountReceived: 100, isFrozen: false } }));
    expect(code(res)).toBe('PAYMENT_ACTIVITY');
  });

  test('first penalty: shipment reopened, booking undone, vehicle freed, penalty recorded, no suspension', async () => {
    ok();
    mockPrisma.driverPenalty.count.mockResolvedValue(1);
    const res = await flag(booked(), { reason: 'Never came' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ penaltiesThisMonth: 1, accountSuspended: false });
    expect(mockPrisma.shipment.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 's1', status: 'BOOKED' }, data: { status: 'PENDING' } });
    expect(mockPrisma.paymentRecord.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(mockPrisma.bid.updateMany.mock.calls[0][0]).toMatchObject({ where: { shipmentId: 's1', status: 'ACCEPTED' }, data: { status: 'WITHDRAWN' } });
    expect(mockPrisma.vehicle.update).toHaveBeenCalled();
    expect(mockPrisma.trip.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(mockPrisma.driverPenalty.create.mock.calls[0][0].data).toEqual({ userId: 'd1', shipmentId: 's1', flaggedById: 'co', reason: 'Never came' });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(dispatchNotification.mock.calls[0][0]).toMatchObject({ recipientId: 'd1', type: 'DRIVER_PENALTY' });
  });

  test('the count is of active penalties in the current calendar month', async () => {
    ok();
    mockPrisma.driverPenalty.count.mockResolvedValue(1);
    await flag(booked());
    const where = mockPrisma.driverPenalty.count.mock.calls[0][0].where;
    const now = new Date();
    expect(where.status).toBe('ACTIVE');
    expect(where.createdAt.gte).toEqual(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  });

  test('the third penalty suspends the account, ends its sessions, withdraws its bids and tells the admins', async () => {
    ok();
    mockPrisma.driverPenalty.count.mockResolvedValue(3);
    mockPrisma.user.findUnique.mockResolvedValue({ accountStatus: 'VERIFIED' });
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    const res = await flag(booked());
    expect(res.body.data).toEqual({ penaltiesThisMonth: 3, accountSuspended: true });
    expect(mockPrisma.user.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'd1' },
      data: { accountStatus: 'SUSPENDED', statusBeforeSuspension: 'VERIFIED', tokenVersion: { increment: 1 } },
    });
    expect(mockPrisma.bid.updateMany.mock.calls.some((c) => c[0].where.bidderId === 'd1' && c[0].data.status === 'WITHDRAWN')).toBe(true);
    const recipients = dispatchNotification.mock.calls.map((c) => c[0].recipientId);
    expect(recipients).toEqual(expect.arrayContaining(['d1', 'a1', 'a2']));
  });

  test('a fleet booking with no trip yet is penalised on the fleet owner and nothing is deleted that is not there', async () => {
    ok();
    mockPrisma.driverPenalty.count.mockResolvedValue(1);
    const res = await flag(booked({ trip: null, paymentRecord: { id: 'p1', status: 'PENDING', amountReceived: 0, isFrozen: false, payeeId: 'fl' } }));
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.driverPenalty.create.mock.calls[0][0].data.userId).toBe('fl');
    expect(mockPrisma.trip.delete).not.toHaveBeenCalled();
    expect(mockPrisma.vehicle.update).not.toHaveBeenCalled();
  });

  test('flagging twice or racing a status change is refused', async () => {
    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 0 });
    let res = await flag(booked());
    expect(code(res)).toBe('STATUS_CHANGED');

    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.driverPenalty.create.mockRejectedValue({ code: 'P2002' });
    res = await flag(booked());
    expect(code(res)).toBe('ALREADY_FLAGGED');
  });

  test('a penalised party can list their penalties and the month count', async () => {
    mockPrisma.driverPenalty.findMany.mockResolvedValue([
      { id: 'x1', status: 'ACTIVE', createdAt: new Date() },
      { id: 'x2', status: 'WAIVED', createdAt: new Date() },
    ]);
    const res = await run(driver.listMyPenalties, { user: drv });
    expect(res.body.data.activeThisMonth).toBe(1);
    expect(res.body.data.limit).toBe(3);
  });
});

describe('contesting a penalty', () => {
  const shipmentFor = { id: 's1', cargoOwnerId: 'co', trip: null, paymentRecord: null };

  test('a penalised party may raise a cancellation dispute, nothing else', async () => {
    mockPrisma.shipment.findUnique.mockResolvedValue(shipmentFor);
    mockPrisma.driverPenalty.findFirst.mockResolvedValue({ id: 'x1' });
    mockPrisma.complaint.create.mockResolvedValue({ id: 'c1', referenceCode: 'CMP-2026-0001' });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const wrong = await run(complaints.createComplaint, { user: drv, body: { shipmentId: 's1', category: 'CONDUCT', description: 'I was there on time' } });
    expect(wrong.statusCode).toBe(403);

    const right = await run(complaints.createComplaint, { user: drv, body: { shipmentId: 's1', category: 'CANCELLATION_DISPUTE', description: 'I was there on time' } });
    expect(right.statusCode).toBe(201);
    expect(mockPrisma.complaint.create.mock.calls[0][0].data).toMatchObject({ submitterId: 'd1', counterpartyId: 'co', category: 'CANCELLATION_DISPUTE' });
  });

  test('a stranger with no penalty is still refused', async () => {
    mockPrisma.shipment.findUnique.mockResolvedValue(shipmentFor);
    mockPrisma.driverPenalty.findFirst.mockResolvedValue(null);
    const res = await run(complaints.createComplaint, { user: drv, body: { shipmentId: 's1', category: 'CANCELLATION_DISPUTE', description: 'Not my shipment' } });
    expect(res.statusCode).toBe(403);
  });

  const dispute = (category) => ({
    id: 'c1', referenceCode: 'CMP-1', status: 'PENDING', category, shipmentId: 's1', submitterId: 'd1', counterpartyId: 'co', shipment: { paymentRecord: null },
  });

  test('resolving a cancellation dispute can waive the penalty', async () => {
    mockPrisma.complaint.findUnique.mockResolvedValue(dispute('CANCELLATION_DISPUTE'));
    mockPrisma.complaint.updateMany.mockResolvedValue({ count: 1 });
    const res = await run(admin.resolveComplaint, { user: adm, params: { id: 'c1' }, body: { decision: 'RESOLVED', adminRemarks: 'Driver was there', waivePenalty: true } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.driverPenalty.updateMany.mock.calls[0][0]).toMatchObject({
      where: { shipmentId: 's1', userId: 'd1', status: 'ACTIVE' },
      data: { status: 'WAIVED' },
    });
  });

  test('waiving is refused on any other kind of complaint or on rejection', async () => {
    mockPrisma.complaint.findUnique.mockResolvedValue(dispute('DELAY'));
    let res = await run(admin.resolveComplaint, { user: adm, params: { id: 'c1' }, body: { decision: 'RESOLVED', adminRemarks: 'Checked', waivePenalty: true } });
    expect(code(res)).toBe('PENALTY_WAIVER_NOT_ALLOWED');

    mockPrisma.complaint.findUnique.mockResolvedValue(dispute('CANCELLATION_DISPUTE'));
    res = await run(admin.resolveComplaint, { user: adm, params: { id: 'c1' }, body: { decision: 'REJECTED', adminRemarks: 'Checked', waivePenalty: true } });
    expect(code(res)).toBe('PENALTY_WAIVER_NOT_ALLOWED');
    expect(mockPrisma.driverPenalty.updateMany).not.toHaveBeenCalled();
  });
});

describe('active trip fare visibility (C-09)', () => {
  test('an employee driver does not receive the agreed fare; an owner-driver does', async () => {
    mockPrisma.trip = { ...mockPrisma.trip, findFirst: jest.fn() };
    mockPrisma.trip.findFirst.mockResolvedValue({ id: 't1', driverId: 'd1', fleetOwnerId: 'fl', agreedFare: 90000 });
    let res = await run(driver.getActiveTrip, { user: drv });
    expect(res.body.data).not.toHaveProperty('agreedFare');
    expect(res.body.data.id).toBe('t1');

    mockPrisma.trip.findFirst.mockResolvedValue({ id: 't2', driverId: 'd1', fleetOwnerId: null, agreedFare: 90000 });
    res = await run(driver.getActiveTrip, { user: drv });
    expect(res.body.data.agreedFare).toBe(90000);
    expect(mockPrisma.trip.findFirst.mock.calls[0][0].include.vehicle.select).not.toHaveProperty('registrationNumberHash');
  });
});
