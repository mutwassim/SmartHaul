const axios = require('axios');
const env = require('../config/env');
const { TIMING } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Calculates Haversine straight-line distance between two lat/lng pairs in kilometers
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLineKm = R * c;

  // Road geometry in Pakistan typically incurs ~1.25x to 1.35x winding factor
  const estimatedRoadKm = Math.round(straightLineKm * 1.3 * 10) / 10;
  const estimatedDurationMinutes = Math.round((estimatedRoadKm / 60) * 60); // Assuming average 60 km/h

  return {
    distanceKm: estimatedRoadKm,
    durationMinutes: estimatedDurationMinutes,
    polyline: null,
    isDistanceApproximate: true,
  };
}

/**
 * Retrieves driving route, road distance and duration from OSRM
 * Requirement: SI-2.1, SI-2.4 (5s timeout), SI-2.5 (no PII sent), FR-RM-6, FR-RM-7
 */
async function getRoute(pickupLat, pickupLng, dropoffLat, dropoffLng) {
  const url = `${env.OSRM_BASE_URL}/route/v1/driving/${pickupLng},${pickupLat};${dropoffLng},${dropoffLat}?overview=full&geometries=polyline`;

  try {
    const response = await axios.get(url, {
      timeout: TIMING.OSRM_TIMEOUT_MS, // 5000 ms timeout (SI-2.4)
    });

    if (
      response.data &&
      response.data.code === 'Ok' &&
      response.data.routes &&
      response.data.routes.length > 0
    ) {
      const route = response.data.routes[0];
      const distanceKm = Math.round((route.distance / 1000) * 10) / 10; // meters to km
      const durationMinutes = Math.round(route.duration / 60); // seconds to minutes

      return {
        distanceKm,
        durationMinutes,
        polyline: route.geometry,
        isDistanceApproximate: false,
      };
    } else {
      logger.warn('OSRM returned non-OK response code, falling back to Haversine');
      return calculateHaversineDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
    }
  } catch (error) {
    logger.warn(`OSRM routing timed out or failed (${error.message}). Using approximate fallback (FR-RM-7).`);
    return calculateHaversineDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
  }
}

module.exports = {
  getRoute,
  calculateHaversineDistance,
};
