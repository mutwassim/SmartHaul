const prisma = require('../../config/db');
const { dispatchNotification } = require('../../services/fcm.service');
const { successResponse, errorResponse } = require('../../utils/response');
const { SHIPMENT_STATUS, ROLES } = require('../../config/constants');

/**
 * Fetch messages for a shipment
 * Requirement: FR-NC-12, FR-NC-13, SEC-10
 */
async function getShipmentMessages(req, res, next) {
  try {
    const { shipmentId } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { trip: true },
    });

    if (!shipment) {
      return errorResponse(res, 'SHIPMENT_NOT_FOUND', 'Shipment not found', 404);
    }

    // Access control: Only cargo owner, assigned driver, or admin investigating complaint (FR-NC-13)
    const isCargoOwner = shipment.cargoOwnerId === req.user.id;
    const isAssignedDriver = shipment.trip && shipment.trip.driverId === req.user.id;
    const isAdmin = req.user.role === ROLES.ADMIN;

    if (!isCargoOwner && !isAssignedDriver && !isAdmin) {
      return errorResponse(
        res,
        'FORBIDDEN',
        'You are not authorized to view messages for this shipment (FR-NC-13).',
        403
      );
    }

    const messages = await prisma.shipmentMessage.findMany({
      where: { shipmentId },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
      orderBy: { sentAt: 'asc' },
    });

    // Mark unread messages as read
    await prisma.shipmentMessage.updateMany({
      where: { shipmentId, recipientId: req.user.id, isRead: false },
      data: { isRead: true },
    });

    return successResponse(res, messages, 'Shipment messages retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * Send a message within a booked shipment thread
 * Requirement: FR-NC-12, FR-NC-13, FR-NC-14
 */
async function sendShipmentMessage(req, res, next) {
  try {
    const { shipmentId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return errorResponse(res, 'EMPTY_MESSAGE', 'Message content cannot be empty', 400);
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { trip: true },
    });

    if (!shipment) {
      return errorResponse(res, 'SHIPMENT_NOT_FOUND', 'Shipment not found', 404);
    }

    // Must be BOOKED or in active transit (read-only once completed or cancelled) (FR-NC-12)
    const activeStatuses = [
      SHIPMENT_STATUS.BOOKED,
      SHIPMENT_STATUS.REACHED_PICKUP,
      SHIPMENT_STATUS.CARGO_LOADED,
      SHIPMENT_STATUS.IN_TRANSIT,
      SHIPMENT_STATUS.REACHED_DESTINATION,
      SHIPMENT_STATUS.DELIVERED,
    ];

    if (!activeStatuses.includes(shipment.status)) {
      return errorResponse(
        res,
        'CHAT_CLOSED',
        `Messaging is closed for shipments in ${shipment.status} status (FR-NC-12).`,
        400
      );
    }

    const isCargoOwner = shipment.cargoOwnerId === req.user.id;
    const isAssignedDriver = shipment.trip && shipment.trip.driverId === req.user.id;

    if (!isCargoOwner && !isAssignedDriver) {
      return errorResponse(
        res,
        'FORBIDDEN',
        'Messaging is strictly restricted between the cargo owner and the assigned driver (FR-NC-13).',
        403
      );
    }

    const recipientId = isCargoOwner ? shipment.trip.driverId : shipment.cargoOwnerId;

    const message = await prisma.shipmentMessage.create({
      data: {
        shipmentId,
        senderId: req.user.id,
        recipientId,
        content: content.trim(),
      },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });

    // Notify recipient (FR-NC-14)
    await dispatchNotification({
      recipientId,
      type: 'TRIP_STATUS_CHANGED',
      title: `Message from ${req.user.name}`,
      message: content.length > 80 ? content.substring(0, 80) + '...' : content,
      relatedShipmentId: shipmentId,
    });

    return successResponse(res, message, 'Message sent successfully (FR-NC-12)', 201);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getShipmentMessages,
  sendShipmentMessage,
};
