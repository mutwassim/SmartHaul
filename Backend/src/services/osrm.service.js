const axios = require('axios');
const env = require('../config/env');
const { TIMING, LIMITS } = require('../config/constants');
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

  return {
    distanceKm: Math.round(straightLineKm * 10) / 10,
    isDistanceApproximate: true,
  };
}

/**
 * Approximate road route used when OSRM is unavailable or for live ETA estimates (FR-RT-5).
 * Road geometry in Pakistan typically adds ~1.25x to 1.35x to the straight-line distance.
 */
function estimateRoadRoute(lat1, lon1, lat2, lon2) {
  const straightLineKm = calculateHaversineDistance(lat1, lon1, lat2, lon2).distanceKm;
  const estimatedRoadKm = Math.round(straightLineKm * LIMITS.ROAD_FACTOR * 10) / 10;
  const estimatedDurationMinutes = Math.round((estimatedRoadKm / LIMITS.AVERAGE_SPEED_KMH) * 60); // Same speed as the delivery-window checks (C-52)

  return {
    distanceKm: estimatedRoadKm,
    durationMinutes: estimatedDurationMinutes,
    polyline: null,
    isDistanceApproximate: true,
  };
}

/**
 * Retrieves driving route, road distance and duration from OSRM
 * Requirement: SI-2.1, SI-2.4 (5s timeout), SI-2.5 (no PII sent), FR-RT-5, FR-RT-5
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
      return estimateRoadRoute(pickupLat, pickupLng, dropoffLat, dropoffLng);
    }
  } catch (error) {
    logger.warn(`OSRM routing timed out or failed (${error.message}). Using approximate fallback (FR-RT-5).`);
    return estimateRoadRoute(pickupLat, pickupLng, dropoffLat, dropoffLng);
  }
}

module.exports = {
  getRoute,
  calculateHaversineDistance,
  estimateRoadRoute,
};
