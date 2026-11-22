const { WebSocketServer } = require('ws');
const { extractToken, loadActiveUser } = require('./auth');
const { handleTrackingMessage, handleClientDisconnect } = require('./tracking.handler');
const logger = require('../utils/logger');

// Connection limits (C-29)
const WS_LIMITS = {
  MAX_PAYLOAD_BYTES: 16 * 1024, // a position report is well under 1 KiB
  RATE_WINDOW_MS: 10 * 1000,
  RATE_MAX_MESSAGES: 60, // per socket per window
  HEARTBEAT_MS: 30 * 1000, // ping interval; a socket that misses one pong is dropped
  REVALIDATE_MS: 60 * 1000, // re-check token and account status on open sockets
  MAX_PENDING_MESSAGES: 20, // messages buffered while the first auth lookup runs
};

function setupWebSocketServer(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/tracking',
    maxPayload: WS_LIMITS.MAX_PAYLOAD_BYTES,
  });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Register handlers before the auth lookup so early messages are queued, not lost
    let user = null;
    const pending = [];
    let windowStart = Date.now();
    let windowCount = 0;

    const process = (message) => {
      const now = Date.now();
      if (now - windowStart > WS_LIMITS.RATE_WINDOW_MS) {
        windowStart = now;
        windowCount = 0;
      }
      windowCount += 1;
      if (windowCount > WS_LIMITS.RATE_MAX_MESSAGES) {
        ws.close(4008, 'Rate limit exceeded');
        return;
      }
      handleTrackingMessage(ws, message, user);
    };

    ws.on('message', (message) => {
      if (!user) {
        if (pending.length < WS_LIMITS.MAX_PENDING_MESSAGES) pending.push(message);
        return;
      }
      process(message);
    });

    ws.on('close', () => {
      if (user) logger.info(`[WS] Connection closed for user ${user.id}`);
      handleClientDisconnect(ws);
    });

    ws.on('error', (err) => {
      logger.error(`[WS] Socket error${user ? ` for user ${user.id}` : ''}:`, err);
      handleClientDisconnect(ws);
    });

    (async () => {
      const token = extractToken(req);
      const authed = await loadActiveUser(token);
      if (!authed) {
        ws.close(4001, 'Authentication failed');
        return;
      }
      if (ws.readyState !== 1) return;

      user = authed;
      ws.authToken = token;
      logger.info(`[WS] Connection established for user ${user.id} (${user.name}, role: ${user.role})`);

      ws.send(
        JSON.stringify({
          event: 'CONNECTED',
          userId: user.id,
          role: user.role,
          timestamp: new Date().toISOString(),
        })
      );

      while (pending.length) process(pending.shift());
    })();
  });

  // Heartbeat: drop dead connections so rooms do not fill with ghosts
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, WS_LIMITS.HEARTBEAT_MS);

  // Re-check sessions: logout, suspension and token expiry end the socket (C-29)
  const revalidate = setInterval(async () => {
    for (const ws of wss.clients) {
      if (!ws.authToken) continue;
      const stillValid = await loadActiveUser(ws.authToken);
      if (!stillValid && ws.readyState === 1) ws.close(4001, 'Session no longer valid');
    }
  }, WS_LIMITS.REVALIDATE_MS);

  heartbeat.unref();
  revalidate.unref();
  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(revalidate);
  });

  logger.info('🚀 Real-Time Tracking WebSocket server mounted on /ws/tracking (CI-2)');
  return wss;
}

module.exports = { setupWebSocketServer, WS_LIMITS };
