const { calculateHaversineDistance } = require('./osrm.service');
const { LIMITS } = require('../config/constants');

/**
 * Empty running measured from real trips (FR-AR-6, replaces the fixed 30 per cent assumption, C-12).
 *
 * Empty distance is the road distance (straight line x road factor) from one trip's drop-off to the next
 * trip's pickup for the same vehicle, counted only when the next trip started within the return-load window
 * (48 h) of the previous one ending. Longer gaps are not attributed because the vehicle may have worked
 * off-platform. It is therefore a lower bound: the empty leg before a vehicle's first trip and after its last
 * are not observed.
 *
 * trips: [{ vehicleId, startedAt, completedAt, loadedDistanceKm, createdAt,
 *           shipment: { pickupLat, pickupLng, dropoffLat, dropoffLng, distanceKm, completedAt } }]
 */
function computeEmptyRunning(trips) {
  const windowMs = LIMITS.RETURN_LOAD_WINDOW_HOURS * 60 * 60 * 1000;
  let loadedKm = 0;
  let emptyKm = 0;
  let measuredLegs = 0;

  const byVehicle = new Map();
  for (const trip of trips) {
    loadedKm += trip.loadedDistanceKm ?? trip.shipment.distanceKm ?? 0;
    if (!byVehicle.has(trip.vehicleId)) byVehicle.set(trip.vehicleId, []);
    byVehicle.get(trip.vehicleId).push(trip);
  }

  const startOf = (t) => new Date(t.startedAt || t.createdAt).getTime();
  for (const list of byVehicle.values()) {
    list.sort((a, b) => startOf(a) - startOf(b));
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1];
      const next = list[i];
      const endedAt = prev.completedAt || prev.shipment.completedAt;
      if (!endedAt || !next.startedAt) continue;

      const gap = new Date(next.startedAt).getTime() - new Date(endedAt).getTime();
      if (gap < 0 || gap > windowMs) continue;

      const straight = calculateHaversineDistance(
        prev.shipment.dropoffLat,
        prev.shipment.dropoffLng,
        next.shipment.pickupLat,
        next.shipment.pickupLng
      ).distanceKm;
      emptyKm += straight * LIMITS.ROAD_FACTOR;
      measuredLegs += 1;
    }
  }

  const totalKm = loadedKm + emptyKm;
  return {
    tripCount: trips.length,
    loadedDistanceKm: Math.round(loadedKm),
    emptyDistanceKm: Math.round(emptyKm),
    totalDistanceKm: Math.round(totalKm),
    emptyRunningPercentage: totalKm > 0 ? Math.round((emptyKm / totalKm) * 1000) / 10 : 0,
    measuredLegs,
  };
}

const EMPTY_RUNNING_BASIS =
  'Lower bound. Empty distance is counted between consecutive trips of the same vehicle that start within 48 hours of each other; empty legs before a first trip or after a last trip are not observed.';

module.exports = { computeEmptyRunning, EMPTY_RUNNING_BASIS };
