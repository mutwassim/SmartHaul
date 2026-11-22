const prisma = require('../../config/db');
const { dispatchNotification } = require('../../services/fcm.service');
const { successResponse, errorResponse } = require('../../utils/response');
const { SHIPMENT_STATUS, ROLES, LIMITS } = require('../../config/constants');

/**
 * Who sits in a shipment's thread: the cargo owner, the party that won the booking, and, once
 * a trip exists, its driver and fleet owner. Before a fleet has assigned a driver there is no trip,
 * so the winning bidder is read from the accepted bid (C-37).
 */
function threadParties(shipment) {
  const trip = shipment.trip || null;
  const accepted = (shipment.bids || [])[0] || null;
  const winnerId = accepted ? accepted.bidderId : null;
  const driverId = trip ? trip.driverId : null;
  const fleetOwnerId = trip ? trip.fleetOwnerId : null;
  const members = new Set([shipment.cargoOwnerId, winnerId, driverId, fleetOwnerId].filter(Boolean));
  return { members, cargoOwnerId: shipment.cargoOwnerId, serviceSideId: driverId || winnerId || fleetOwnerId };
}

const threadInclude = { trip: true, bids: { where: { status: 'ACCEPTED' }, select: { bidderId: true } } };

/**
 * Fetch messages for a shipment
 * Requirement: FR-NC-11, FR-NC-11, SEC-10
 */
async function getShipmentMessages(req, res, next) {
  try {
    const { shipmentId } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: threadInclude,
    });

    if (!shipment) {
      return errorResponse(res, 'SHIPMENT_NOT_FOUND', 'Shipment not found', 404);
    }

    // Access control: the parties to the booking, or an administrator investigating a complaint (FR-NC-11)
    const { members } = threadParties(shipment);
    const isAdmin = req.user.role === ROLES.ADMIN;

    if (!members.has(req.user.id) && !isAdmin) {
      return errorResponse(
        res,
        'FORBIDDEN',
        'You are not authorized to view messages for this shipment (FR-NC-11).',
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
 * Requirement: FR-NC-11, FR-NC-11, FR-NC-12
 */
async function sendShipmentMessage(req, res, next) {
  try {
    const { shipmentId } = req.params;
    const { content } = req.body;

    if (typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse(res, 'EMPTY_MESSAGE', 'Message content cannot be empty', 400);
    }

    const text = content.trim();
    if (text.length > LIMITS.MAX_MESSAGE_LENGTH) {
      return errorResponse(
        res,
        'MESSAGE_TOO_LONG',
        `A message can be at most ${LIMITS.MAX_MESSAGE_LENGTH} characters.`,
        400
      );
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: threadInclude,
    });

    if (!shipment) {
      return errorResponse(res, 'SHIPMENT_NOT_FOUND', 'Shipment not found', 404);
    }

    // Must be BOOKED or in active transit (read-only once completed or cancelled) (FR-NC-11)
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
        `Messaging is closed for shipments in ${shipment.status} status (FR-NC-11).`,
        400
      );
    }

    const { members, cargoOwnerId, serviceSideId } = threadParties(shipment);

    if (!members.has(req.user.id)) {
      return errorResponse(
        res,
        'FORBIDDEN',
        'Messaging is restricted to the parties to this booking (FR-NC-11).',
        403
      );
    }

    // The cargo owner writes to the driver (or to the fleet before a driver is assigned); everyone else writes to the cargo owner
    const recipientId = req.user.id === cargoOwnerId ? serviceSideId : cargoOwnerId;

    if (!recipientId) {
      return errorResponse(res, 'NO_RECIPIENT', 'There is nobody to receive this message yet.', 409);
    }

    const message = await prisma.shipmentMessage.create({
      data: {
        shipmentId,
        senderId: req.user.id,
        recipientId,
        content: text,
      },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });

    // Notify recipient (FR-NC-12)
    await dispatchNotification({
      recipientId,
      type: 'NEW_MESSAGE',
      title: `Message from ${req.user.name}`,
      message: text.length > 80 ? text.substring(0, 80) + '...' : text,
      relatedShipmentId: shipmentId,
    });

    return successResponse(res, message, 'Message sent successfully (FR-NC-11)', 201);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getShipmentMessages,
  sendShipmentMessage,
};
