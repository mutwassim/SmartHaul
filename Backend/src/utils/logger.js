const winston = require('winston');
const env = require('../config/env');

const sanitizeFormat = winston.format((info) => {
  // Prevent stack traces or raw database credentials in standard output logs (SEC-16)
  if (info.password) info.password = '***';
  if (info.token) info.token = '***';
  if (info.cnic) info.cnic = '***';
  return info;
});

const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    sanitizeFormat(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

module.exports = logger;
