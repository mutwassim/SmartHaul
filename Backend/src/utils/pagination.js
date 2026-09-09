const { LIMITS } = require('../config/constants');

/**
 * Parses and validates pagination parameters
 * Requirement: SI-1.5 (Max 100 records per list response)
 */
function getPaginationParams(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (isNaN(page) || page < 1) {
    page = 1;
  }

  if (isNaN(limit) || limit < 1) {
    limit = LIMITS.DEFAULT_LIST_PAGE_SIZE;
  } else if (limit > LIMITS.MAX_LIST_PAGE_SIZE) {
    limit = LIMITS.MAX_LIST_PAGE_SIZE;
  }

  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function buildPaginationMeta(totalRecords, page, limit) {
  const totalPages = Math.ceil(totalRecords / limit) || 1;
  return {
    currentPage: page,
    pageSize: limit,
    totalRecords,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

module.exports = {
  getPaginationParams,
  buildPaginationMeta,
};
