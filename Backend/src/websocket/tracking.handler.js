const prisma = require('../config/db');
const { calculateHaversineDistance } = require('../services/osrm.service');
const { LIMITS, SHIPMENT_STATUS, ROLES } = require('../config/constants');
const logger = require('../utils/logger');

// Trip rooms map: tripId -> Set of ws clients
const tripRooms = new Map();

/**
 * Handles incoming WebSocket messages for live GPS tracking
 * Requirement: FR-RT-1, FR-RT-2, FR-RT-10, HI-3, Table 3.20
 */
async function handleTrackingMessage(ws, messageData, user) {
  try {
    const payload = JSON.parse(messageData);
    const { action, tripId, latitude, longitude, accuracy, timestamp } = payload;

    switch (action) {
      case 'JOIN_TRIP': {
        if (!tripId) return;

        // Verify authorization to subscribe to this trip (FR-RT-10)
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
        ws.tripId = tripId;

        ws.send(JSON.stringify({ event: 'JOINED_TRIP', tripId }));
        logger.info(`[WS] User ${user.id} (${user.role}) joined trip room ${tripId}`);
        break;
      }

      case 'LEAVE_TRIP': {
        if (ws.tripId && tripRooms.has(ws.tripId)) {
          tripRooms.get(ws.tripId).delete(ws);
        }
        ws.tripId = null;
        ws.send(JSON.stringify({ event: 'LEFT_TRIP' }));
        break;
      }

      case 'LOCATION_UPDATE': {
        if (user.role !== ROLES.DRIVER) {
          ws.send(JSON.stringify({ event: 'ERROR', message: 'Only assigned drivers can broadcast location' }));
          return;
        }

        if (!tripId || latitude === undefined || longitude === undefined) {
          return;
        }

        // 1. Accuracy filter (HI-3: Discard if accuracy > 100 meters)
        if (accuracy && accuracy > LIMITS.MAX_GPS_ACCURACY_METERS) {
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
        const recordedAt = timestamp ? new Date(timestamp) : now;

        // 3. Save position in database (FR-RT-3)
        const position = await prisma.tripPosition.create({
          data: {
            tripId,
            driverId: user.id,
            latitude,
            longitude,
            accuracy: accuracy || 0,
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

        // 5. Recompute remaining distance and ETA (FR-RT-9)
        const remaining = calculateHaversineDistance(
          latitude,
          longitude,
          trip.shipment.dropoffLat,
          trip.shipment.dropoffLng
        );

        // 6. Broadcast position to all subscribers in trip room (FR-RT-10, CI-2)
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
  if (ws.tripId && tripRooms.has(ws.tripId)) {
    tripRooms.get(ws.tripId).delete(ws);
    if (tripRooms.get(ws.tripId).size === 0) {
      tripRooms.delete(ws.tripId);
    }
  }
}

module.exports = {
  handleTrackingMessage,
  handleClientDisconnect,
};
