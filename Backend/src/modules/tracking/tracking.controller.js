const prisma = require('../../config/db');
const { calculateHaversineDistance } = require('../../services/osrm.service');
const { successResponse, errorResponse } = require('../../utils/response');
const { ROLES, SHIPMENT_STATUS } = require('../../config/constants');

/**
 * Get live tracking view for a shipment
 * Requirement: FR-RT-9, FR-RT-10, FR-CO-17
 */
async function getLiveShipmentTracking(req, res, next) {
  try {
    const { shipmentId } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        trip: {
          include: {
            driver: { select: { id: true, name: true, phone: true } },
            vehicle: true,
            positions: {
              take: 1,
              orderBy: { recordedAt: 'desc' },
            },
          },
        },
      },
    });

    if (!shipment) {
      return errorResponse(res, 'SHIPMENT_NOT_FOUND', 'Shipment not found', 404);
    }

    // Role-based access control (FR-RT-10, SEC-14)
    const isOwner = shipment.cargoOwnerId === req.user.id;
    const isDriver = shipment.trip && shipment.trip.driverId === req.user.id;
    const isFleetOwner = shipment.trip && shipment.trip.fleetOwnerId === req.user.id;
    const isAdmin = req.user.role === ROLES.ADMIN;

    if (!isOwner && !isDriver && !isFleetOwner && !isAdmin) {
      return errorResponse(res, 'FORBIDDEN', 'Access denied. You are not authorized to view tracking for this shipment (FR-RT-10).', 403);
    }

    const latestPosition =
      shipment.trip && shipment.trip.positions && shipment.trip.positions.length > 0
        ? shipment.trip.positions[0]
        : null;

    // Calculate remaining distance and ETA if position is available (FR-RT-9)
    let remainingDistanceKm = shipment.distanceKm;
    let estimatedArrivalMinutes = shipment.durationMinutes;

    if (latestPosition) {
      const remaining = calculateHaversineDistance(
        latestPosition.latitude,
        latestPosition.longitude,
        shipment.dropoffLat,
        shipment.dropoffLng
      );
      remainingDistanceKm = remaining.distanceKm;
      estimatedArrivalMinutes = remaining.durationMinutes;
    }

    return successResponse(
      res,
      {
        shipmentId: shipment.id,
        shipmentNumber: shipment.shipmentNumber,
        status: shipment.status,
        pickupAddress: shipment.pickupAddress,
        pickupCoords: { lat: shipment.pickupLat, lng: shipment.pickupLng },
        dropoffAddress: shipment.dropoffAddress,
        dropoffCoords: { lat: shipment.dropoffLat, lng: shipment.dropoffLng },
        routePolyline: shipment.routePolyline,
        totalDistanceKm: shipment.distanceKm,
        remainingDistanceKm,
        estimatedArrivalMinutes,
        latestPosition,
        isInterrupted: shipment.trip ? shipment.trip.isInterrupted : false,
        driver: shipment.trip ? shipment.trip.driver : null,
      },
      'Live tracking retrieved (FR-RT-9)'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Get route history for completed shipment
 * Requirement: FR-RT-13
 */
async function getTripRouteHistory(req, res, next) {
  try {
    const { tripId } = req.params;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        shipment: true,
        positions: {
          orderBy: { recordedAt: 'asc' },
        },
      },
    });

    if (!trip) {
      return errorResponse(res, 'TRIP_NOT_FOUND', 'Trip not found', 404);
    }

    const isOwner = trip.shipment.cargoOwnerId === req.user.id;
    const isDriver = trip.driverId === req.user.id;
    const isFleetOwner = trip.fleetOwnerId === req.user.id;
    const isAdmin = req.user.role === ROLES.ADMIN;

    if (!isOwner && !isDriver && !isFleetOwner && !isAdmin) {
      return errorResponse(res, 'FORBIDDEN', 'Unauthorized to view route history', 403);
    }

    return successResponse(
      res,
      {
        tripId: trip.id,
        shipmentNumber: trip.shipment.shipmentNumber,
        totalDistanceKm: trip.shipment.distanceKm,
        positions: trip.positions,
      },
      'Route history retrieved (FR-RT-13)'
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getLiveShipmentTracking,
  getTripRouteHistory,
};
