const http = require('http');
const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/db');
const { setupWebSocketServer } = require('./websocket/server');
const { initScheduledJobs } = require('./jobs');
const logger = require('./utils/logger');

const server = http.createServer(app);

// Mount WebSocket Live Tracking Engine (CI-2, MOD-7)
setupWebSocketServer(server);

// Initialize Background Cron Jobs (BR-17, BR-20, BR-29)
if (env.NODE_ENV !== 'test') {
  initScheduledJobs();
}

const PORT = env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`=================================================`);
  logger.info(`🚚 SmartHaul Backend API running on port ${PORT}`);
  logger.info(`🌍 Environment: ${env.NODE_ENV}`);
  logger.info(`📡 WebSocket tracking ready at ws://localhost:${PORT}/ws/tracking`);
  logger.info(`=================================================`);
});

// Graceful Shutdown
function handleShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    logger.info('HTTP & WebSocket servers closed.');
    await prisma.$disconnect();
    logger.info('PostgreSQL connection closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = server;
