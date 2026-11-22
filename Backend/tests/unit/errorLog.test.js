const mockPrisma = { errorLog: { create: jest.fn(), deleteMany: jest.fn() } };
jest.mock('../../src/config/db', () => mockPrisma);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { errorHandler } = require('../../src/middleware/error.middleware');
const { runErrorLogRetention } = require('../../src/jobs/errorLogRetention.job');

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('Persistent error log (REL-12)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('stores role, operation, message and trace, and still hides details from the client', async () => {
    const res = fakeRes();
    const req = { method: 'POST', originalUrl: '/api/v1/shipments', user: { id: 'u1', role: 'CARGO_OWNER' }, ip: '::1' };

    await errorHandler(new Error('db exploded'), req, res, jest.fn());

    const data = mockPrisma.errorLog.create.mock.calls[0][0].data;
    expect(data.userRole).toBe('CARGO_OWNER');
    expect(data.operation).toBe('POST /api/v1/shipments');
    expect(data.message).toBe('db exploded');
    expect(data.trace).toContain('db exploded');
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('db exploded');
  });

  test('records unauthenticated errors with a null role', async () => {
    const req = { method: 'GET', originalUrl: '/api/v1/x', ip: '::1' };
    await errorHandler(new Error('boom'), req, fakeRes(), jest.fn());
    expect(mockPrisma.errorLog.create.mock.calls[0][0].data.userRole).toBeNull();
  });

  test('a failure to write the log does not break the response', async () => {
    mockPrisma.errorLog.create.mockRejectedValueOnce(new Error('db down'));
    const res = fakeRes();
    await errorHandler(new Error('boom'), { method: 'GET', originalUrl: '/x', ip: '::1' }, res, jest.fn());
    expect(res.statusCode).toBe(500);
  });

  test('retention job only deletes entries older than the retention window, never within 30 days', async () => {
    mockPrisma.errorLog.deleteMany.mockResolvedValue({ count: 2 });
    await runErrorLogRetention();

    const cutoff = mockPrisma.errorLog.deleteMany.mock.calls[0][0].where.occurredAt.lt;
    const ageDays = (Date.now() - cutoff.getTime()) / 86400000;
    expect(ageDays).toBeGreaterThanOrEqual(30);
  });
});
