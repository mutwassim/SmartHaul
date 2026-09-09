const cron = require('node-cron');
const { runAutoCompleteShipments } = require('./autoCompleteShipments.job');
const { runDocumentExpiryCheck } = require('./documentExpiry.job');
const { runTrackingRetentionCleanup } = require('./trackingRetention.job');
const { runTrackingInterruptionCheck } = require('./trackingInterruption.job');
const { runNotificationRetryJob } = require('./notificationRetry.job');
const logger = require('../utils/logger');

function initScheduledJobs() {
  logger.info('⏰ Initializing SmartHaul background scheduled jobs...');

  // 1. 72-Hour Automatic Delivery Confirmation - Runs every hour
  cron.schedule('0 * * * *', () => {
    runAutoCompleteShipments();
  });

  // 2. Document Expiry Validation - Runs every day at 00:00
  cron.schedule('0 0 * * *', () => {
    runDocumentExpiryCheck();
  });

  // 3. 90-Day GPS Tracking Retention Pruner - Runs every day at 03:00
  cron.schedule('0 3 * * *', () => {
    runTrackingRetentionCleanup();
  });

  // 4. 120-Second Tracking Interruption Watchdog - Runs every 30 seconds
  cron.schedule('*/30 * * * * *', () => {
    runTrackingInterruptionCheck();
  });

  // 5. In-App Notification Fallback Worker - Runs every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    runNotificationRetryJob();
  });

  logger.info('✅ All 5 background scheduled jobs active');
}

module.exports = {
  initScheduledJobs,
};
