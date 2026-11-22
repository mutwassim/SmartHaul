jest.setTimeout(30000);

const mockPrisma = {
  shipment: { findUnique: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  bid: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  vehicle: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  trip: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  tripStatusLog: { create: jest.fn() },
  paymentRecord: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  proofOfDelivery: { findUnique: jest.fn(), upsert: jest.fn() },
  user: { update: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../../src/config/db', () => mockPrisma);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/services/fcm.service', () => ({ dispatchNotification: jest.fn() }));
jest.mock('../../src/services/osrm.service', () => ({ getRoute: jest.fn() }));
jest.mock('../../src/modules/matching/matching.service', () => ({
  computeRecommendationsForShipment: jest.fn(),
  getMatchedShipmentsForUser: jest.fn(),
  isCargoCompatibleWithVehicle: (type, cargo) =>
    require('../../src/config/constants').VEHICLE_TYPES[type]?.compatibleCargos.includes(cargo) ?? false,
}));
jest.mock('../../src/services/storage.service', () => ({
  uploadProofOfDelivery: jest.fn().mockResolvedValue({ storageKey: 'k' }),
  generateSignedReadUrl: jest.fn(),
}));

const driverController = require('../../src/modules/driver/driver.controller');
const cargoController = require('../../src/modules/cargo-owner/cargoOwner.controller');
const { createWithReference, nextReference } = require('../../src/utils/reference');
const { submitBidSchema } = require('../../src/modules/driver/driver.validation');
const { acceptBidSchema } = require('../../src/modules/cargo-owner/cargoOwner.validation');
const { computeRecommendationsForShipment } = require('../../src/modules/matching/matching.service');
const { dispatchNotification } = require('../../src/services/fcm.service');

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const day = 24 * 60 * 60 * 1000;
const shipment = (o = {}) => ({
  id: 's1', shipmentNumber: 'SH-2026-00001', cargoOwnerId: 'co', status: 'PENDING', isDraft: false,
  requiredVehicleType: 'OPEN_BODY', cargoType: 'CONSTRUCTION_MATERIAL', cargoWeight: 2.5, expectedDeliveryDate: new Date(Date.now() + 2 * day), ...o,
});
const vehicle = (o = {}) => ({ id: 'v1', ownerId: 'd1', vehicleType: 'OPEN_BODY', ratedCapacity: 10, availabilityStatus: 'AVAILABLE', ...o });
const bidReq = (o = {}) => ({
  user: { id: 'd1', name: 'Driver' },
  body: { shipmentId: 's1', proposedFare: 40000, estimatedDeliveryTime: new Date(Date.now() + day).toISOString(), ...o },
});
const run = async (fn, req) => { const res = fakeRes(); const next = jest.fn(); await fn(req, res, next); expect(next).not.toHaveBeenCalled(); return res; };

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(async (arg) => (typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg)));
  mockPrisma.shipment.findUnique.mockResolvedValue(shipment());
  mockPrisma.vehicle.findMany.mockResolvedValue([vehicle()]);
  mockPrisma.bid.findFirst.mockResolvedValue(null);
  mockPrisma.bid.create.mockImplementation(async ({ data }) => ({ id: 'b1', ...data }));
});

describe('submitBid (C-05, C-20)', () => {
  test('records the vehicle and its type, ignoring any client-supplied type', async () => {
    const res = await run(driverController.submitBid, bidReq({ offeredVehicleType: 'REEFER' }));
    expect(res.statusCode).toBe(201);
    const data = mockPrisma.bid.create.mock.calls[0][0].data;
    expect(data.vehicleId).toBe('v1');
    expect(data.offeredVehicleType).toBe('OPEN_BODY');
  });

  test.each([
    ['no vehicle', () => mockPrisma.vehicle.findMany.mockResolvedValue([]), 422, 'NO_VEHICLE'],
    ['several vehicles and no choice', () => mockPrisma.vehicle.findMany.mockResolvedValue([vehicle(), vehicle({ id: 'v2' })]), 422, 'VEHICLE_REQUIRED'],
    ['vehicle busy', () => mockPrisma.vehicle.findMany.mockResolvedValue([vehicle({ availabilityStatus: 'ASSIGNED' })]), 409, 'VEHICLE_UNAVAILABLE'],
    ['wrong type', () => mockPrisma.vehicle.findMany.mockResolvedValue([vehicle({ vehicleType: 'REFRIGERATED' })]), 422, 'VEHICLE_TYPE_MISMATCH'],
    ['too small', () => mockPrisma.vehicle.findMany.mockResolvedValue([vehicle({ ratedCapacity: 1 })]), 422, 'VEHICLE_CAPACITY_EXCEEDED'],
    ['draft shipment', () => mockPrisma.shipment.findUnique.mockResolvedValue(shipment({ isDraft: true })), 409, 'SHIPMENT_NOT_OPEN'],
    ['booked shipment', () => mockPrisma.shipment.findUnique.mockResolvedValue(shipment({ status: 'BOOKED' })), 409, 'SHIPMENT_NOT_OPEN'],
    ['existing active bid', () => mockPrisma.bid.findFirst.mockResolvedValue({ id: 'x' }), 409, 'DUPLICATE_ACTIVE_BID'],
  ])('refuses: %s', async (_name, arrange, status, code) => {
    arrange();
    const res = await run(driverController.submitBid, bidReq());
    expect(res.statusCode).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(mockPrisma.bid.create).not.toHaveBeenCalled();
  });

  test('refuses an ETA after the expected delivery day', async () => {
    const res = await run(driverController.submitBid, bidReq({ estimatedDeliveryTime: new Date(Date.now() + 5 * day).toISOString() }));
    expect(res.body.error.code).toBe('ETA_AFTER_DELIVERY_DATE');
  });

  test('the unique-index race maps to DUPLICATE_ACTIVE_BID, not a 500', async () => {
    mockPrisma.bid.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const res = await run(driverController.submitBid, bidReq());
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_ACTIVE_BID');
  });

  test('schema takes vehicleId, not a free-text vehicle type', () => {
    const ok = submitBidSchema.safeParse({ shipmentId: '11111111-1111-4111-8111-111111111111', proposedFare: 1, estimatedDeliveryTime: new Date(Date.now() + day).toISOString(), vehicleId: '22222222-2222-4222-8222-222222222222' });
    expect(ok.success).toBe(true);
    expect('offeredVehicleType' in ok.data).toBe(false);
  });
});

describe('updateBid and withdrawBid (C-08)', () => {
  test('a bid that stopped being ACTIVE mid-update is refused', async () => {
    mockPrisma.bid.findUnique.mockResolvedValue({ id: 'b1', bidderId: 'd1', status: 'ACTIVE', shipment: shipment() });
    mockPrisma.bid.updateMany.mockResolvedValue({ count: 0 });
    const res = await run(driverController.updateBid, { user: { id: 'd1' }, params: { id: 'b1' }, body: { proposedFare: 1 } });
    expect(res.statusCode).toBe(409);
    expect(mockPrisma.bid.updateMany.mock.calls[0][0].where).toEqual({ id: 'b1', status: 'ACTIVE' });
  });

  test('revision after the shipment is booked is refused', async () => {
    mockPrisma.bid.findUnique.mockResolvedValue({ id: 'b1', bidderId: 'd1', status: 'ACTIVE', shipment: shipment({ status: 'BOOKED' }) });
    const res = await run(driverController.updateBid, { user: { id: 'd1' }, params: { id: 'b1' }, body: { proposedFare: 1 } });
    expect(res.body.error.code).toBe('SHIPMENT_NOT_OPEN');
  });
});

describe('acceptBid (C-05, C-08, C-11)', () => {
  const bid = (o = {}) => ({ id: 'b1', shipmentId: 's1', status: 'ACTIVE', proposedFare: 40000, vehicleId: 'v1', bidderId: 'd1', bidder: { role: 'DRIVER', accountStatus: 'VERIFIED' }, ...o });
  const req = (expectedFare = 40000) => ({ user: { id: 'co' }, params: { id: 's1' }, body: { bidId: 'b1', expectedFare } });
  beforeEach(() => {
    mockPrisma.bid.findUnique.mockResolvedValue(bid());
    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.bid.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.bid.findMany.mockResolvedValue([]);
    mockPrisma.paymentRecord.create.mockResolvedValue({ id: 'p1' });
    mockPrisma.vehicle.findUnique.mockResolvedValue(vehicle());
    mockPrisma.vehicle.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.trip.create.mockResolvedValue({ id: 't1' });
  });

  test('requires the fare the owner saw', () => {
    expect(acceptBidSchema.safeParse({ bidId: '11111111-1111-4111-8111-111111111111' }).success).toBe(false);
  });

  test('a revised fare is refused and nothing is written', async () => {
    const res = await run(cargoController.acceptBid, req(35000));
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('BID_CHANGED');
    expect(mockPrisma.shipment.updateMany).not.toHaveBeenCalled();
  });

  test('books the bid\'s own vehicle and marks it ASSIGNED', async () => {
    mockPrisma.shipment.findUnique.mockResolvedValue(shipment());
    const res = await run(cargoController.acceptBid, req());
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.vehicle.updateMany).toHaveBeenCalledWith({ where: { id: 'v1', availabilityStatus: 'AVAILABLE' }, data: { availabilityStatus: 'ASSIGNED' } });
    expect(mockPrisma.trip.create.mock.calls[0][0].data.vehicleId).toBe('v1');
  });

  test('a vehicle that is no longer available aborts the booking', async () => {
    mockPrisma.shipment.findUnique.mockResolvedValue(shipment());
    mockPrisma.vehicle.updateMany.mockResolvedValue({ count: 0 });
    const res = await run(cargoController.acceptBid, req());
    expect(res.body.error.code).toBe('VEHICLE_UNAVAILABLE');
    expect(mockPrisma.trip.create).not.toHaveBeenCalled();
  });

  test('a bid whose vehicle belongs to someone else is refused', async () => {
    mockPrisma.shipment.findUnique.mockResolvedValue(shipment());
    mockPrisma.vehicle.findUnique.mockResolvedValue(vehicle({ ownerId: 'other' }));
    const res = await run(cargoController.acceptBid, req());
    expect(res.body.error.code).toBe('BID_VEHICLE_MISSING');
  });
});

describe('cancelShipment (C-11, C-17)', () => {
  const req = { user: { id: 'co' }, params: { id: 's1' }, body: { reason: 'Plans changed' } };
  beforeEach(() => {
    mockPrisma.shipment.findUnique.mockResolvedValue({ ...shipment({ status: 'BOOKED' }), trip: { id: 't1', vehicleId: 'v1', driverId: 'd1', fleetOwnerId: null } });
    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.bid.findMany.mockResolvedValue([{ bidderId: 'x' }]);
    mockPrisma.paymentRecord.findUnique.mockResolvedValue({ id: 'p1', status: 'PENDING', amountReceived: 0, isFrozen: false });
  });

  test('cancels conditionally, frees the vehicle, drops the empty payment record, tells the driver', async () => {
    const res = await run(cargoController.cancelShipment, req);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.shipment.updateMany.mock.calls[0][0].where).toEqual({ id: 's1', status: 'BOOKED' });
    expect(mockPrisma.vehicle.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { availabilityStatus: 'AVAILABLE' } });
    expect(mockPrisma.paymentRecord.delete).toHaveBeenCalled();
    expect(dispatchNotification.mock.calls.map((c) => c[0].recipientId).sort()).toEqual(['d1', 'x']);
  });

  test('keeps a payment record that has activity', async () => {
    mockPrisma.paymentRecord.findUnique.mockResolvedValue({ id: 'p1', status: 'PARTIAL', amountReceived: 5, isFrozen: false });
    await run(cargoController.cancelShipment, req);
    expect(mockPrisma.paymentRecord.delete).not.toHaveBeenCalled();
  });

  test('loses cleanly if the status moved under it', async () => {
    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 0 });
    const res = await run(cargoController.cancelShipment, req);
    expect(res.statusCode).toBe(409);
    expect(mockPrisma.vehicle.update).not.toHaveBeenCalled();
  });
});

describe('driver cancellation (C-47)', () => {
  const trip = { id: 't1', shipmentId: 's1', driverId: 'd1', vehicleId: 'v1', fleetOwnerId: null, shipment: shipment({ status: 'BOOKED' }) };
  const req = (body) => ({ user: { id: 'd1', name: 'Driver' }, params: { id: 't1' }, body });
  beforeEach(() => {
    mockPrisma.trip.findUnique = jest.fn().mockResolvedValue(trip);
    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.paymentRecord.findUnique.mockResolvedValue({ id: 'p1', status: 'PENDING', amountReceived: 0, isFrozen: false });
  });

  test('reopens the shipment, frees the vehicle, withdraws the bid, counts against the driver', async () => {
    const res = await run(driverController.updateTripStatus, req({ status: 'CANCELLED', note: 'Broke down' }));
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.shipment.updateMany).toHaveBeenCalledWith({ where: { id: 's1', status: 'BOOKED' }, data: { status: 'PENDING', cancellationReason: null, cancelledById: null } });
    expect(mockPrisma.bid.updateMany).toHaveBeenCalledWith({ where: { shipmentId: 's1', status: 'ACCEPTED' }, data: { status: 'WITHDRAWN' } });
    expect(mockPrisma.trip.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { cancelledTripsCount: { increment: 1 } } });
  });

  test('needs a reason', async () => {
    const res = await run(driverController.updateTripStatus, req({ status: 'CANCELLED' }));
    expect(res.body.error.code).toBe('CANCELLATION_REASON_REQUIRED');
    expect(mockPrisma.trip.delete).not.toHaveBeenCalled();
  });

  test('is blocked once money has moved', async () => {
    mockPrisma.paymentRecord.findUnique.mockResolvedValue({ id: 'p1', status: 'PARTIAL', amountReceived: 100, isFrozen: false });
    const res = await run(driverController.updateTripStatus, req({ status: 'CANCELLED', note: 'x' }));
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_ACTIVITY');
    expect(mockPrisma.trip.delete).not.toHaveBeenCalled();
  });
});

describe('uploadPOD (C-16)', () => {
  const file = { originalname: 'a.png', buffer: Buffer.alloc(1), mimetype: 'image/png' };
  const req = (n) => ({ user: { id: 'd1' }, params: { id: 't1' }, body: {}, files: Array.from({ length: n }, () => file) });
  const tripAt = (status) => mockPrisma.trip.findUnique = jest.fn().mockResolvedValue({ id: 't1', shipmentId: 's1', driverId: 'd1', shipment: shipment({ status }) });

  test('only at Reached Destination', async () => {
    tripAt('IN_TRANSIT');
    const res = await run(driverController.uploadPOD, req(1));
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('POD_NOT_ALLOWED_YET');
  });

  test('the five-image cap counts what is already stored', async () => {
    tripAt('REACHED_DESTINATION');
    mockPrisma.proofOfDelivery.findUnique.mockResolvedValue({ imageKeys: ['1', '2', '3', '4'] });
    const res = await run(driverController.uploadPOD, req(2));
    expect(res.body.error.code).toBe('TOO_MANY_IMAGES');
    expect(mockPrisma.proofOfDelivery.upsert).not.toHaveBeenCalled();
  });
});

describe('publishShipment (C-32) and reference numbers (C-31)', () => {
  test('publishing a draft opens it and runs matching; a non-draft is refused', async () => {
    mockPrisma.shipment.findUnique.mockResolvedValue(shipment({ isDraft: true }));
    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 1 });
    const ok = await run(cargoController.publishShipment, { user: { id: 'co' }, params: { id: 's1' } });
    expect(ok.statusCode).toBe(200);
    expect(computeRecommendationsForShipment).toHaveBeenCalledWith('s1');

    mockPrisma.shipment.findUnique.mockResolvedValue(shipment());
    const no = await run(cargoController.publishShipment, { user: { id: 'co' }, params: { id: 's1' } });
    expect(no.body.error.code).toBe('NOT_A_DRAFT');
  });

  test('numbers continue from the highest issued, not from a row count', async () => {
    const delegate = { findFirst: jest.fn().mockResolvedValue({ shipmentNumber: 'SH-2026-00041' }) };
    expect(await nextReference(delegate, 'shipmentNumber', 'SH-2026-', 5)).toBe('SH-2026-00042');
    delegate.findFirst.mockResolvedValue(null);
    expect(await nextReference(delegate, 'shipmentNumber', 'SH-2026-', 5)).toBe('SH-2026-00001');
  });

  test('a collision on the number is retried with the next one', async () => {
    const delegate = {
      findFirst: jest.fn().mockResolvedValue({ shipmentNumber: 'SH-2026-00009' }),
      create: jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002', meta: { target: ['shipmentNumber'] } }))
        .mockImplementation(async ({ data }) => data),
    };
    const out = await createWithReference(delegate, { field: 'shipmentNumber', prefix: 'SH-2026-', width: 5, data: { a: 1 } });
    expect(out.shipmentNumber).toBe('SH-2026-00011');
  });

  test('an unrelated unique violation is not swallowed', async () => {
    const delegate = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'P2002', meta: { target: ['other'] } })) };
    await expect(createWithReference(delegate, { field: 'shipmentNumber', prefix: 'P-', width: 3, data: {} })).rejects.toThrow('x');
  });
});
