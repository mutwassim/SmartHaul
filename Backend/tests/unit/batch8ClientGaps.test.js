jest.setTimeout(30000);

const mockPrisma = {
  shipment: { findMany: jest.fn() },
  vehicle: { findMany: jest.fn() },
};
jest.mock('../../src/config/db', () => mockPrisma);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/services/fcm.service', () => ({ dispatchNotification: jest.fn() }));

const fleet = require('../../src/modules/fleet/fleet.controller');
const driverRoutes = require('../../src/modules/driver/driver.routes');
const fleetRoutes = require('../../src/modules/fleet/fleet.routes');

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const routesOf = (router) =>
  router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));

beforeEach(() => jest.resetAllMocks());

describe('fleet bookings (FR-FO-11)', () => {
  test('lists only BOOKED shipments whose accepted bid belongs to the calling fleet', async () => {
    mockPrisma.shipment.findMany.mockResolvedValue([{ id: 's1', status: 'BOOKED' }]);
    const res = fakeRes();
    const next = jest.fn();
    await fleet.listBookedShipments({ user: { id: 'fl', role: 'FLEET_OWNER' } }, res, next);

    expect(next).not.toHaveBeenCalled();
    const args = mockPrisma.shipment.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('BOOKED');
    expect(args.where.bids).toEqual({ some: { bidderId: 'fl', status: 'ACCEPTED' } });
    expect(args.omit).toEqual({ routePolyline: true });
    expect(res.body.data).toEqual([{ id: 's1', status: 'BOOKED' }]);
  });

  test('a database error is passed to the error handler', async () => {
    const boom = new Error('db down');
    mockPrisma.shipment.findMany.mockRejectedValue(boom);
    const next = jest.fn();
    await fleet.listBookedShipments({ user: { id: 'fl' } }, fakeRes(), next);
    expect(next).toHaveBeenCalledWith(boom);
  });

  test('the route exists on the fleet router', () => {
    expect(routesOf(fleetRoutes)).toContainEqual({ path: '/bookings', methods: ['get'] });
  });
});

describe('owner-driver vehicle register (FR-DR-2)', () => {
  test('the driver router exposes the four vehicle routes', () => {
    const routes = routesOf(driverRoutes);
    expect(routes).toContainEqual({ path: '/vehicles', methods: ['get'] });
    expect(routes).toContainEqual({ path: '/vehicles', methods: ['post'] });
    expect(routes).toContainEqual({ path: '/vehicles/:id', methods: ['put'] });
    expect(routes).toContainEqual({ path: '/vehicles/:id', methods: ['delete'] });
  });

  test('the vehicle routes sit behind the driver-only gate', () => {
    const layers = driverRoutes.stack;
    const gate = layers.findIndex((l) => !l.route && l.name === '<anonymous>' && layers.indexOf(l) > layers.findIndex((x) => x.route && x.route.path === '/penalties'));
    const vehicles = layers.findIndex((l) => l.route && l.route.path === '/vehicles');
    expect(gate).toBeGreaterThan(-1);
    expect(vehicles).toBeGreaterThan(gate);
  });
});
