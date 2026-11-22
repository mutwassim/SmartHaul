const prisma = require('../config/db');
const { estimateRoadRoute } = require('../services/osrm.service');
const { LIMITS, SHIPMENT_STATUS, ROLES } = require('../config/constants');
const { dispatchNotification } = require('../services/fcm.service');
const logger = require('../utils/logger');

// Trip rooms map: tripId -> Set of ws clients
const tripRooms = new Map();

const MAX_REPORT_AGE_MS = 10 * 60 * 1000; // a live report older than this belongs to the offline sync (CI-5)
const MAX_FUTURE_SKEW_MS = 60 * 1000;

/**
 * Validates a live position report. Accuracy is required and must be positive, so a
 * missing or zero accuracy cannot slip past the 100 m filter (C-29, HI-3).
 */
function validateLocation(payload, now = new Date()) {
  const { latitude, longitude, accuracy, timestamp } = payload;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!isNum(latitude) || latitude < -90 || latitude > 90) return { ok: false, reason: 'Invalid latitude' };
  if (!isNum(longitude) || longitude < -180 || longitude > 180) return { ok: false, reason: 'Invalid longitude' };
  if (!isNum(accuracy) || accuracy <= 0) return { ok: false, reason: 'Accuracy is required and must be positive' };
  let recordedAt = now;
  if (timestamp !== undefined && timestamp !== null) {
    const parsed = new Date(timestamp);
    if (typeof timestamp !== 'string' && typeof timestamp !== 'number') return { ok: false, reason: 'Invalid timestamp' };
    if (Number.isNaN(parsed.getTime())) return { ok: false, reason: 'Invalid timestamp' };
    if (parsed.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) return { ok: false, reason: 'Timestamp is in the future' };
    if (parsed.getTime() < now.getTime() - MAX_REPORT_AGE_MS) return { ok: false, reason: 'Timestamp is too old for a live report' };
    recordedAt = parsed.getTime() > now.getTime() ? now : parsed;
  }
  return { ok: true, value: { latitude, longitude, accuracy, recordedAt } };
}

function leaveRoom(ws, tripId) {
  const room = tripRooms.get(tripId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) tripRooms.delete(tripId);
  }
  if (ws.tripIds) ws.tripIds.delete(tripId);
}

/**
 * Handles incoming WebSocket messages for live GPS tracking
 * Requirement: FR-RT-1, FR-RT-1, FR-RT-7, HI-3, Table 3.20
 */
async function handleTrackingMessage(ws, messageData, user) {
  try {
    const payload = JSON.parse(messageData);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    const { action, tripId } = payload;
    if (tripId !== undefined && (typeof tripId !== 'string' || tripId.length > 64)) {
      ws.send(JSON.stringify({ event: 'ERROR', message: 'Invalid tripId' }));
      return;
    }

    switch (action) {
      case 'JOIN_TRIP': {
        if (!tripId) return;

        // Verify authorization to subscribe to this trip (FR-RT-7)
        const trip = await prisma.trip.findUnique({
          where: { id: tripId },
          include: { shipment: true },
        });

        if (!trip) {
          ws.send(JSON.stringify({ event: 'ERROR', message: 'Trip not found' }));
          return;
        }

        const isOwner = trip.shipment.cargoOwnerId === user.id;
        const isDriver = trip.driverId === user.id;
        const isFleetOwner = trip.fleetOwnerId === user.id;
        const isAdmin = user.role === ROLES.ADMIN;

        if (!isOwner && !isDriver && !isFleetOwner && !isAdmin) {
          ws.send(JSON.stringify({ event: 'ERROR', message: 'Unauthorized to subscribe to this trip' }));
          return;
        }

        if (!tripRooms.has(tripId)) {
          tripRooms.set(tripId, new Set());
        }
        tripRooms.get(tripId).add(ws);
        if (!ws.tripIds) ws.tripIds = new Set();
        if (!ws.tripIds.has(tripId) && ws.tripIds.size >= 20) {
          leaveRoom(ws, tripId);
          ws.send(JSON.stringify({ event: 'ERROR', message: 'Too many trip subscriptions' }));
          return;
        }
        ws.tripIds.add(tripId);

        ws.send(JSON.stringify({ event: 'JOINED_TRIP', tripId }));
        logger.info(`[WS] User ${user.id} (${user.role}) joined trip room ${tripId}`);
        break;
      }

      case 'LEAVE_TRIP': {
        if (tripId) leaveRoom(ws, tripId);
        else for (const id of [...(ws.tripIds || [])]) leaveRoom(ws, id);
        ws.send(JSON.stringify({ event: 'LEFT_TRIP' }));
        break;
      }

      case 'LOCATION_UPDATE': {
        if (user.role !== ROLES.DRIVER) {
          ws.send(JSON.stringify({ event: 'ERROR', message: 'Only assigned drivers can broadcast location' }));
          return;
        }

        if (!tripId) return;

        const check = validateLocation(payload);
        if (!check.ok) {
          ws.send(JSON.stringify({ event: 'ERROR', message: check.reason }));
          return;
        }
        const { latitude, longitude, accuracy, recordedAt } = check.value;

        // 1. Accuracy filter (HI-3: Discard if accuracy > 100 meters)
        if (accuracy > LIMITS.MAX_GPS_ACCURACY_METERS) {
          logger.warn(`[WS] Discarded low-accuracy position report: ${accuracy}m > 100m (HI-3)`);
          return;
        }

        // 2. Validate trip and shipment status (Table 3.20: Only collect when reached pickup, cargo loaded, or in transit)
        const trip = await prisma.trip.findUnique({
          where: { id: tripId },
          include: { shipment: true },
        });

        if (!trip || trip.driverId !== user.id) {
          return;
        }

        const activeTrackingStatuses = [
          SHIPMENT_STATUS.REACHED_PICKUP,
          SHIPMENT_STATUS.CARGO_LOADED,
          SHIPMENT_STATUS.IN_TRANSIT,
        ];

        if (!activeTrackingStatuses.includes(trip.shipment.status)) {
          logger.info(`[WS] Discarded position report for inactive trip status: ${trip.shipment.status}`);
          return;
        }

        const now = new Date();

        // 3. Save position in database (FR-RT-1)
        const position = await prisma.tripPosition.create({
          data: {
            tripId,
            driverId: user.id,
            latitude,
            longitude,
            accuracy,
            recordedAt,
          },
        });

        // 4. Update trip tracking status
        await prisma.trip.update({
          where: { id: tripId },
          data: {
            lastPositionAt: now,
            isInterrupted: false,
            isTrackingActive: true,
          },
        });

        // Tell the cargo owner when tracking comes back after an interruption (FR-NC-7, Table 3.20)
        if (trip.isInterrupted) {
          await dispatchNotification({
            recipientId: trip.shipment.cargoOwnerId,
            type: 'TRACKING_UNAVAILABLE_OR_RESUMED',
            title: 'Live Tracking Resumed',
            message: `Live GPS tracking for shipment ${trip.shipment.shipmentNumber} has resumed.`,
            relatedShipmentId: trip.shipmentId,
          });
        }

        // 5. Recompute remaining distance and ETA (FR-RT-6)
        const remaining = estimateRoadRoute(
          latitude,
          longitude,
          trip.shipment.dropoffLat,
          trip.shipment.dropoffLng
        );

        // 6. Broadcast position to all subscribers in trip room (FR-RT-7, CI-2)
        const broadcastPayload = JSON.stringify({
          event: 'POSITION_UPDATE',
          tripId,
          shipmentId: trip.shipmentId,
          position: {
            latitude,
            longitude,
            accuracy: position.accuracy,
            recordedAt: position.recordedAt,
          },
          remainingDistanceKm: remaining.distanceKm,
          estimatedArrivalMinutes: remaining.durationMinutes,
        });

        if (tripRooms.has(tripId)) {
          const clients = tripRooms.get(tripId);
          for (const client of clients) {
            if (client.readyState === 1 && client !== ws) {
              client.send(broadcastPayload);
            }
          }
        }
        break;
      }

      default:
        ws.send(JSON.stringify({ event: 'ERROR', message: `Unknown action: ${action}` }));
    }
  } catch (error) {
    logger.error('[WS] Error processing message:', error);
  }
}

function handleClientDisconnect(ws) {
  for (const id of [...(ws.tripIds || [])]) leaveRoom(ws, id);
}

module.exports = {
  handleTrackingMessage,
  handleClientDisconnect,
  validateLocation,
};
