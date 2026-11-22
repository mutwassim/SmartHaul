jest.setTimeout(30000); // bcrypt work is slow when suites run in parallel
process.env.UPLOAD_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'sh2-'));

const mockPrisma = {
  user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  revokedToken: { upsert: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
  verificationDocument: { count: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  bid: { updateMany: jest.fn() },
  passwordResetToken: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../../src/config/db', () => mockPrisma);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/services/audit.service', () => ({ logAuthEvent: jest.fn(), logAdminAction: jest.fn() }));
jest.mock('../../src/services/fcm.service', () => ({
  dispatchNotification: jest.fn(),
  registerDeviceToken: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');
const { generateToken, verifyToken, revokeToken, isTokenRevoked, hashToken } = require('../../src/utils/token');
const { authenticate } = require('../../src/middleware/auth.middleware');
const { normalizePhone, normalizeIdentifier, registerSchema } = require('../../src/modules/auth/auth.validation');
const authController = require('../../src/modules/auth/auth.controller');
const adminController = require('../../src/modules/admin/admin.controller');
const { dispatchNotification } = require('../../src/services/fcm.service');
const { uploadDocumentSchema } = require('../../src/modules/users/user.validation');
const userController = require('../../src/modules/users/user.controller');

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (arg) => (typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg)));
});

describe('C-06 revocation is persisted and per-user versioned', () => {
  const user = { id: 'u1', role: 'DRIVER', accountStatus: 'VERIFIED', tokenVersion: 2 };

  test('token carries the user token version', () => {
    expect(verifyToken(generateToken(user)).tv).toBe(2);
  });

  test('logout stores a hash of the token, never the token itself', async () => {
    const token = generateToken(user);
    await revokeToken(token);
    const arg = mockPrisma.revokedToken.upsert.mock.calls[0][0];
    expect(arg.create.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(arg)).not.toContain(token);
  });

  test('isTokenRevoked reads the database', async () => {
    mockPrisma.revokedToken.findUnique.mockResolvedValueOnce({ tokenHash: 'x' });
    expect(await isTokenRevoked('abc')).toBe(true);
    mockPrisma.revokedToken.findUnique.mockResolvedValueOnce(null);
    expect(await isTokenRevoked('abc')).toBe(false);
  });

  test('authenticate rejects a revoked token', async () => {
    mockPrisma.revokedToken.findUnique.mockResolvedValueOnce({ tokenHash: 'x' });
    const res = fakeRes();
    const next = jest.fn();
    await authenticate({ headers: { authorization: `Bearer ${generateToken(user)}` } }, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_REVOKED');
    expect(next).not.toHaveBeenCalled();
  });

  test('authenticate rejects a token issued before the version was bumped (reset / suspension)', async () => {
    mockPrisma.revokedToken.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ ...user, tokenVersion: 3 });
    const res = fakeRes();
    await authenticate({ headers: { authorization: `Bearer ${generateToken(user)}` } }, res, jest.fn());
    expect(res.statusCode).toBe(401);
  });

  test('authenticate accepts a current token', async () => {
    mockPrisma.revokedToken.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ ...user });
    const next = jest.fn();
    await authenticate({ headers: { authorization: `Bearer ${generateToken(user)}` } }, fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('C-22 refresh keeps the original sign-in time', () => {
  test('a refreshed token has a new expiry but the same createdAt', async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 3600;
    const user = { id: 'u1', role: 'DRIVER', accountStatus: 'VERIFIED', tokenVersion: 0 };
    const old = generateToken(user, { issuedAt });
    const res = fakeRes();
    await authController.refreshSession({ token: old, user }, res, jest.fn());
    const fresh = jwt.verify(res.body.data.token, env.JWT_SECRET);
    expect(fresh.createdAt).toBe(issuedAt);
  });
});

describe('C-24 normalisation', () => {
  test('phone formats map to one canonical form', () => {
    expect(normalizePhone('0300 1234567')).toBe('+923001234567');
    expect(normalizePhone('923001234567')).toBe('+923001234567');
    expect(normalizePhone('+92-300-1234567')).toBe('+923001234567');
  });
  test('email identifiers are lower-cased, phone identifiers normalised', () => {
    expect(normalizeIdentifier(' Test@X.com ')).toBe('test@x.com');
    expect(normalizeIdentifier('03001234567')).toBe('+923001234567');
  });
  test('registerSchema stores the canonical email and phone', () => {
    const r = registerSchema.parse({ role: 'DRIVER', name: 'Ali Khan', phone: '03001234567', email: 'Ali@X.com', password: 'Str0ng#Pass' });
    expect(r.email).toBe('ali@x.com');
    expect(r.phone).toBe('+923001234567');
  });
  test('a nonsense phone number is rejected', () => {
    expect(registerSchema.safeParse({ role: 'DRIVER', name: 'Ali Khan', phone: 'abc', email: 'a@x.com', password: 'Str0ng#Pass' }).success).toBe(false);
  });
});

describe('C-23 failed logins are counted in a window, atomically', () => {
  const base = { id: 'u1', role: 'DRIVER', email: 'a@x.com', passwordHash: require('bcryptjs').hashSync('Right#Pass1', 4), lockoutUntil: null, failedLoginAttempts: 0 };
  const req = { body: { identifier: 'a@x.com', password: 'wrong', role: 'DRIVER' }, ip: '::1', headers: {} };

  test('the 5th failure inside the window locks the account and notifies the holder', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(base);
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 }); // window still open
    mockPrisma.user.update.mockResolvedValueOnce({ failedLoginAttempts: 5 }).mockResolvedValue({});
    const res = fakeRes();
    await authController.login(req, res, jest.fn());
    expect(res.statusCode).toBe(401);
    expect(mockPrisma.user.update.mock.calls[0][0].data.failedLoginAttempts).toEqual({ increment: 1 });
    expect(mockPrisma.user.update.mock.calls[1][0].data.lockoutUntil).toBeInstanceOf(Date);
    expect(dispatchNotification).toHaveBeenCalledTimes(1);
  });

  test('a failure after the window has passed starts the count again at 1', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...base, failedLoginAttempts: 4 });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    const res = fakeRes();
    await authController.login(req, res, jest.fn());
    expect(mockPrisma.user.updateMany.mock.calls[0][0].data.failedLoginAttempts).toBe(1);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  test('an unknown account gets the same response as a wrong password', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = fakeRes();
    await authController.login(req, res, jest.fn());
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('C-27 password reset', () => {
  test('the stored token is a hash, and a reset ends every session', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'r1', userId: 'u1', isUsed: false, expiresAt: new Date(Date.now() + 60000), user: { email: 'a@x.com' },
    });
    const res = fakeRes();
    await authController.resetPassword({ body: { token: 'plain-token', newPassword: 'Str0ng#Pass' }, ip: '::1', headers: {} }, res, jest.fn());
    expect(mockPrisma.passwordResetToken.findUnique.mock.calls[0][0].where.token).toBe(hashToken('plain-token'));
    expect(mockPrisma.user.update.mock.calls[0][0].data.tokenVersion).toEqual({ increment: 1 });
  });

  test('issuing a token stores only its hash and voids older tokens', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u2', role: 'DRIVER' });
    const res = fakeRes();
    await adminController.issuePasswordResetToken({ params: { id: 'u2' }, body: { reason: 'identity checked' }, user: { id: 'a1' }, ip: '::1' }, res, jest.fn());
    const issued = res.body.data.resetToken;
    expect(mockPrisma.passwordResetToken.create.mock.calls[0][0].data.token).toBe(hashToken(issued));
    expect(mockPrisma.passwordResetToken.updateMany.mock.calls[0][0].data).toEqual({ isUsed: true });
  });
});

describe('C-15 administrator verification decisions are validated', () => {
  const run = async (user, body = { decision: 'APPROVED' }, docs = 1) => {
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.verificationDocument.count.mockResolvedValue(docs);
    const res = fakeRes();
    await adminController.processVerificationDecision({ params: { id: 'u1' }, body, user: { id: 'a1' }, ip: '::1' }, res, jest.fn());
    return res;
  };

  test('a cargo owner cannot be put through verification', async () => {
    expect((await run({ id: 'u1', role: 'CARGO_OWNER', accountStatus: 'ACTIVE' })).statusCode).toBe(400);
  });
  test('a suspended driver cannot be approved (that would silently unsuspend)', async () => {
    const res = await run({ id: 'u1', role: 'DRIVER', accountStatus: 'SUSPENDED' });
    expect(res.statusCode).toBe(409);
  });
  test('approval needs submitted documents', async () => {
    expect((await run({ id: 'u1', role: 'DRIVER', accountStatus: 'PENDING' }, { decision: 'APPROVED' }, 0)).statusCode).toBe(409);
  });
  test('a pending driver with documents is approved', async () => {
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await run({ id: 'u1', role: 'DRIVER', accountStatus: 'PENDING' });
    expect(res.statusCode).toBe(200);
  });
  test('a lost race between two administrators returns 409', async () => {
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });
    expect((await run({ id: 'u1', role: 'DRIVER', accountStatus: 'PENDING' })).statusCode).toBe(409);
  });
});

describe('C-15 suspension and reinstatement', () => {
  const run = async (user, status) => {
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.user.update.mockResolvedValue({ id: 'u1', accountStatus: 'X' });
    const res = fakeRes();
    await adminController.updateUserAccountStatus({ params: { id: 'u1' }, body: { status, reason: 'because' }, user: { id: 'a1' }, ip: '::1' }, res, jest.fn());
    return res;
  };

  test('suspending ends sessions and remembers the previous status', async () => {
    await run({ id: 'u1', role: 'DRIVER', accountStatus: 'VERIFIED' }, 'SUSPENDED');
    const data = mockPrisma.user.update.mock.calls[0][0].data;
    expect(data.tokenVersion).toEqual({ increment: 1 });
    expect(data.statusBeforeSuspension).toBe('VERIFIED');
    expect(mockPrisma.bid.updateMany).toHaveBeenCalled();
  });
  test('a never-verified user cannot be "reinstated" as VERIFIED', async () => {
    const res = await run({ id: 'u1', role: 'DRIVER', accountStatus: 'SUSPENDED', statusBeforeSuspension: 'PENDING' }, 'VERIFIED');
    expect(res.statusCode).toBe(409);
  });
  test('reinstating restores the earlier status', async () => {
    const res = await run({ id: 'u1', role: 'DRIVER', accountStatus: 'SUSPENDED', statusBeforeSuspension: 'VERIFIED' }, 'VERIFIED');
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.update.mock.calls[0][0].data.accountStatus).toBe('VERIFIED');
  });
  test('only a suspended account can be reinstated', async () => {
    expect((await run({ id: 'u1', role: 'DRIVER', accountStatus: 'VERIFIED' }, 'VERIFIED')).statusCode).toBe(409);
  });
});

describe('C-46 document upload validation', () => {
  test('free-text documentType and bad dates are rejected', () => {
    expect(uploadDocumentSchema.safeParse({ documentType: '../../x' }).success).toBe(false);
    expect(uploadDocumentSchema.safeParse({ documentType: 'DRIVING_LICENCE', expiryDate: 'not-a-date' }).success).toBe(false);
    expect(uploadDocumentSchema.safeParse({ documentType: 'DRIVING_LICENCE', expiryDate: '2001-01-01' }).success).toBe(false);
    expect(uploadDocumentSchema.safeParse({ documentType: 'DRIVING_LICENCE', expiryDate: '2099-01-01' }).success).toBe(true);
  });
});

describe('C-14 / C-46 user controller', () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('x')]);
  const upload = async (accountStatus, count = 0) => {
    mockPrisma.verificationDocument.count.mockResolvedValue(count);
    mockPrisma.verificationDocument.create.mockResolvedValue({ id: 'd1', documentType: 'CNIC_FRONT', verificationStatus: 'PENDING' });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.authLog = { create: jest.fn() };
    const res = fakeRes();
    await userController.uploadDocument(
      { file: { mimetype: 'image/png', size: 5, buffer: PNG, originalname: 'a.png' }, body: { documentType: 'CNIC_FRONT' },
        user: { id: 'u1', email: 'a@x.com', accountStatus }, ip: '::1', headers: {} },
      res, jest.fn()
    );
    return res;
  };

  test('a rejected user who uploads again goes back to Pending', async () => {
    const res = await upload('REJECTED');
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.user.updateMany.mock.calls[0][0].data.accountStatus).toBe('PENDING');
  });
  test('a pending user who uploads stays Pending without an extra update', async () => {
    await upload('PENDING');
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });
  test('the per-user document cap is enforced', async () => {
    expect((await upload('PENDING', 20)).statusCode).toBe(409);
  });
  test('a verified driver who changes their name must be verified again', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 'u1' });
    await userController.updateProfile(
      { body: { name: 'New Name' }, user: { id: 'u1', role: 'DRIVER', name: 'Old Name', phone: '+923001234567', email: 'a@x.com', accountStatus: 'VERIFIED' }, ip: '::1', headers: {} },
      fakeRes(), jest.fn()
    );
    expect(mockPrisma.user.update.mock.calls[0][0].data.accountStatus).toBe('PENDING');
  });
  test('changing only the language leaves a verified account verified', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 'u1' });
    await userController.updateProfile(
      { body: { preferredLanguage: 'UR' }, user: { id: 'u1', role: 'DRIVER', name: 'Old', phone: '+923001234567', email: 'a@x.com', accountStatus: 'VERIFIED' }, ip: '::1', headers: {} },
      fakeRes(), jest.fn()
    );
    expect(mockPrisma.user.update.mock.calls[0][0].data.accountStatus).toBeUndefined();
  });
});
