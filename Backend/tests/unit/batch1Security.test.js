const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-up-'));

const mockPrisma = { errorLog: { create: jest.fn() }, deviceToken: { deleteMany: jest.fn() } };
jest.mock('../../src/config/db', () => mockPrisma);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const storage = require('../../src/services/storage.service');
const { errorHandler } = require('../../src/middleware/error.middleware');
const { getPaginationParams } = require('../../src/utils/pagination');
const { blockSuspended } = require('../../src/middleware/verification.middleware');
const { provisionAdminSchema } = require('../../src/modules/admin/admin.validation');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('data')]);

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

describe('C-02 upload file name cannot escape the uploads folder', () => {
  test('traversal in documentType stays inside verifications/<user>', async () => {
    const file = { mimetype: 'image/png', size: 10, buffer: PNG, originalname: 'a.png' };
    const out = await storage.uploadVerificationDocument(file, 'user1', '../../../../etc/cron.d/x');
    expect(out.storageKey).toMatch(/^verifications\/user1\/[a-z0-9_]+_\d+_[0-9a-f]{8}\.png$/);
    expect(out.storageKey).not.toContain('..');
    expect(fs.existsSync(storage.getAbsolutePath(out.storageKey))).toBe(true);
  });

  test('getAbsolutePath rejects keys that resolve outside the uploads root', () => {
    expect(() => storage.getAbsolutePath('../../etc/passwd')).toThrow('Invalid storage key');
    expect(() => storage.getAbsolutePath('verifications/../../x')).toThrow();
  });
});

describe('C-28 signed URL and file validation', () => {
  test('a wrong-length signature is rejected, not thrown', () => {
    const exp = String(Math.floor(Date.now() / 1000) + 100);
    expect(storage.verifySignedUrl('pod/x/a.jpg', exp, 'abc')).toBe(false);
  });

  test('a genuine signature still verifies', () => {
    const url = new URL('http://x' + storage.generateSignedReadUrl('pod/x/a.jpg', 60));
    expect(
      storage.verifySignedUrl('pod/x/a.jpg', url.searchParams.get('expires'), url.searchParams.get('sig'))
    ).toBe(true);
  });

  test('an invalid file type is a 400 client error', () => {
    try {
      storage.validateFile({ mimetype: 'application/pdf', size: 10 });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.statusCode).toBe(400);
      expect(e.code).toBe('INVALID_FILE');
    }
  });

  test('client errors are returned without writing an error-log row', async () => {
    const res = fakeRes();
    const err = Object.assign(new Error('bad file'), { statusCode: 400, code: 'INVALID_FILE' });
    await errorHandler(err, { method: 'POST', originalUrl: '/x', ip: '::1' }, res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE');
    expect(mockPrisma.errorLog.create).not.toHaveBeenCalled();
  });

  test('server faults are still logged, and Prisma codes are not leaked', async () => {
    const res = fakeRes();
    const err = Object.assign(new Error('unique'), { code: 'P2002' });
    await errorHandler(err, { method: 'GET', originalUrl: '/x', ip: '::1' }, res, jest.fn());
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(mockPrisma.errorLog.create).toHaveBeenCalledTimes(1);
  });
});

describe('SI-4.3 file content must match declared type', () => {
  test('text renamed as .png is rejected', () => {
    expect(() =>
      storage.validateFile({ mimetype: 'image/png', size: 5, buffer: Buffer.from('<?php echo 1;') })
    ).toThrow('does not match');
  });
  test('a real JPEG header passes', () => {
    expect(() =>
      storage.validateFile({ mimetype: 'image/jpeg', size: 5, buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) })
    ).not.toThrow();
  });
});

describe('C-50 pagination cap', () => {
  test('a huge page number is capped so skip cannot overflow', () => {
    const { page, skip } = getPaginationParams({ page: '99999999999999', limit: '100' });
    expect(page).toBe(100000);
    expect(Number.isSafeInteger(skip)).toBe(true);
  });
});

describe('C-07 suspended accounts are blocked', () => {
  test('blockSuspended returns 403 for SUSPENDED and passes others', () => {
    const res = fakeRes();
    const next = jest.fn();
    blockSuspended({ user: { accountStatus: 'SUSPENDED' } }, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    blockSuspended({ user: { accountStatus: 'ACTIVE' } }, fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('C-45 administrator password policy', () => {
  const base = { name: 'Ad Min', email: 'a@b.com', phone: '03001234567' };
  test('a weak 8-character password is rejected', () => {
    expect(provisionAdminSchema.safeParse({ ...base, password: 'password' }).success).toBe(false);
  });
  test('a policy-compliant password is accepted', () => {
    expect(provisionAdminSchema.safeParse({ ...base, password: 'Str0ng#Pass' }).success).toBe(true);
  });
});

describe('C-43 CSV export escapes quotes and formulas', () => {
  test('exportReport neutralises =, + and embedded quotes', async () => {
    const prisma = require('../../src/config/db');
    prisma.shipment = {
      findMany: jest.fn().mockResolvedValue([
        {
          shipmentNumber: 'SH-1', status: 'PENDING', cargoType: '=cmd|"x"', cargoWeight: 1,
          requiredVehicleType: 'MAZDA', distanceKm: 5, pickupAddress: 'A "quoted" road',
          dropoffAddress: '+1', createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]),
    };
    const { exportReport } = require('../../src/modules/analytics/analytics.controller');
    const res = fakeRes();
    res.setHeader = jest.fn();
    res.send = (b) => { res.body = b; return res; };
    await exportReport({ query: { reportType: 'shipments' } }, res, jest.fn());
    expect(res.body.startsWith('﻿')).toBe(true);
    expect(res.body).toContain(`"'=cmd|""x"""`);
    expect(res.body).toContain('"A ""quoted"" road"');
    expect(res.body).toContain(`"'+1"`);
  });
});
