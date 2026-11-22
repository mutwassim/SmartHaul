const prisma = require('../config/db');
const { TIMING } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Error log pruning: entries are kept well beyond the 30-day minimum
 * Requirement: REL-12
 */
async function runErrorLogRetention() {
  try {
    const threshold = new Date(Date.now() - TIMING.ERROR_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.errorLog.deleteMany({ where: { occurredAt: { lt: threshold } } });

    if (result.count > 0) {
      logger.info(`[JOB] Removed ${result.count} error log entries older than ${TIMING.ERROR_LOG_RETENTION_DAYS} days (REL-12)`);
    }
  } catch (error) {
    logger.error('[JOB] Error in runErrorLogRetention:', error);
  }
}

module.exports = {
  runErrorLogRetention,
};
