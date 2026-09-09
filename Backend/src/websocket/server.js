const { WebSocketServer } = require('ws');
const { authenticateWsConnection } = require('./auth');
const { handleTrackingMessage, handleClientDisconnect } = require('./tracking.handler');
const logger = require('../utils/logger');

function setupWebSocketServer(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/tracking',
  });

  wss.on('connection', async (ws, req) => {
    const user = await authenticateWsConnection(req);

    if (!user) {
      ws.close(4001, 'Authentication failed');
      return;
    }

    logger.info(`[WS] Connection established for user ${user.id} (${user.name}, role: ${user.role})`);

    ws.on('message', (message) => {
      handleTrackingMessage(ws, message, user);
    });

    ws.on('close', () => {
      logger.info(`[WS] Connection closed for user ${user.id}`);
      handleClientDisconnect(ws);
    });

    ws.on('error', (err) => {
      logger.error(`[WS] Socket error for user ${user.id}:`, err);
      handleClientDisconnect(ws);
    });

    // Send connection established confirmation
    ws.send(
      JSON.stringify({
        event: 'CONNECTED',
        userId: user.id,
        role: user.role,
        timestamp: new Date().toISOString(),
      })
    );
  });

  logger.info('🚀 Real-Time Tracking WebSocket server mounted on /ws/tracking (CI-2)');
  return wss;
}

module.exports = {
  setupWebSocketServer,
};
