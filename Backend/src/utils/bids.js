const { TIMING } = require('../config/constants');

/** The moment before which a bid placed at createdAt has expired (24-hour validity) */
const bidCutoff = (now = new Date()) => new Date(now.getTime() - TIMING.BID_VALIDITY_HOURS * 60 * 60 * 1000);

const isBidExpired = (bid, now = new Date()) => new Date(bid.createdAt) <= bidCutoff(now);

module.exports = { bidCutoff, isBidExpired };
