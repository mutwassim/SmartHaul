const fs = require('fs');

const KEY_PATH = '/fake/service-account.json';

const mockPrisma = {
  notification: { create: jest.fn(), update: jest.fn() },
  deviceToken: { findMany: jest.fn(), deleteMany: jest.fn() },
};

// Loads a fresh copy of the service so its cached Firebase client does not leak between tests
function loadService({ keyPath }) {
  jest.resetModules();
  const sendEachForMulticast = jest.fn();

  jest.doMock('../../src/config/db', () => mockPrisma);
  jest.doMock('../../src/config/env', () => ({ FIREBASE_SERVICE_ACCOUNT_PATH: keyPath }));
  jest.doMock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
  jest.doMock('firebase-admin/app', () => ({
    initializeApp: jest.fn(() => ({})),
    cert: jest.fn((account) => account),
    getApps: jest.fn(() => []),
  }));
  jest.doMock('firebase-admin/messaging', () => ({
    getMessaging: jest.fn(() => ({ sendEachForMulticast })),
  }));

  return { service: require('../../src/services/fcm.service'), sendEachForMulticast };
}

const notice = {
  recipientId: 'user-1',
  type: 'BID_ACCEPTED',
  title: 'Bid Accepted!',
  message: 'Your bid was accepted.',
  relatedShipmentId: 'ship-1',
};

describe('FCM push delivery (dispatchNotification)', () => {
  const realReadFileSync = fs.readFileSync;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.notification.create.mockResolvedValue({ id: 'note-1' });
    mockPrisma.deviceToken.findMany.mockResolvedValue([{ token: 'tok-a' }, { token: 'tok-b' }]);
    jest.spyOn(fs, 'readFileSync').mockImplementation((file, ...rest) =>
      file === KEY_PATH ? JSON.stringify({ project_id: 'demo' }) : realReadFileSync(file, ...rest)
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('stores the notification and sends no push when no key path is configured', async () => {
    const { service, sendEachForMulticast } = loadService({ keyPath: undefined });

    const result = await service.dispatchNotification(notice);

    expect(result).toEqual({ id: 'note-1' });
    expect(sendEachForMulticast).not.toHaveBeenCalled();
    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
  });

  test('sends to every registered device and marks the notification as pushed', async () => {
    const { service, sendEachForMulticast } = loadService({ keyPath: KEY_PATH });
    sendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });

    await service.dispatchNotification(notice);

    const message = sendEachForMulticast.mock.calls[0][0];
    expect(message.tokens).toEqual(['tok-a', 'tok-b']);
    expect(message.notification).toEqual({ title: 'Bid Accepted!', body: 'Your bid was accepted.' });
    expect(message.data).toEqual({ type: 'BID_ACCEPTED', notificationId: 'note-1', shipmentId: 'ship-1' });
    expect(mockPrisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'note-1' },
      data: { isPushDelivered: true },
    });
  });

  test('removes tokens Firebase reports as unregistered and still marks the push as delivered', async () => {
    const { service, sendEachForMulticast } = loadService({ keyPath: KEY_PATH });
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });

    await service.dispatchNotification(notice);

    expect(mockPrisma.deviceToken.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { token: 'tok-b' } });
    expect(mockPrisma.notification.update).toHaveBeenCalledTimes(1);
  });

  test('does not mark the notification as pushed when every send fails, and keeps tokens on other errors', async () => {
    const { service, sendEachForMulticast } = loadService({ keyPath: KEY_PATH });
    sendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 2,
      responses: [
        { success: false, error: { code: 'messaging/internal-error' } },
        { success: false, error: { code: 'messaging/server-unavailable' } },
      ],
    });

    await service.dispatchNotification(notice);

    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
    expect(mockPrisma.deviceToken.deleteMany).not.toHaveBeenCalled();
  });

  test('falls back to the in-app inbox when the key file cannot be read', async () => {
    const { service, sendEachForMulticast } = loadService({ keyPath: '/missing/key.json' });

    const result = await service.dispatchNotification(notice);

    expect(result).toEqual({ id: 'note-1' });
    expect(sendEachForMulticast).not.toHaveBeenCalled();
    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
  });

  test('skips push when the user has no registered devices', async () => {
    const { service, sendEachForMulticast } = loadService({ keyPath: KEY_PATH });
    mockPrisma.deviceToken.findMany.mockResolvedValue([]);

    await service.dispatchNotification(notice);

    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });
});
