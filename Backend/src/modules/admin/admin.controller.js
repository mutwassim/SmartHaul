const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');
const { logAdminAction } = require('../../services/audit.service');
const { generateSignedReadUrl } = require('../../services/storage.service');
const { dispatchNotification } = require('../../services/fcm.service');
const { getPaginationParams, buildPaginationMeta } = require('../../utils/pagination');
const { successResponse, errorResponse } = require('../../utils/response');
const {
  ROLES,
  ACCOUNT_STATUS,
  SHIPMENT_STATUS,
  BID_STATUS,
  COMPLAINT_CATEGORIES,
} = require('../../config/constants');

/**
 * Provision new administrator account
 * Requirement: FR-AD-4 (Administrators are provisioned, not self-registered)
 */
async function provisionAdmin(req, res, next) {
  try {
    const { name, email, phone, password } = req.body;

    // Check unique email and phone for ADMIN role (BR-1)
    const existing = await prisma.user.findFirst({
      where: {
        role: ROLES.ADMIN,
        OR: [{ email }, { phone }],
      },
    });

    if (existing) {
      return errorResponse(res, 'ADMIN_ALREADY_EXISTS', 'An admin with this email or phone already exists', 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const admin = await prisma.user.create({
      data: {
        role: ROLES.ADMIN,
        name,
        email,
        phone,
        passwordHash,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      },
      select: {
        id: true,
        role: true,
        name: true,
        email: true,
        phone: true,
        accountStatus: true,
        createdAt: true,
      },
    });

    await logAdminAction({
      adminId: req.user.id,
      action: 'PROVISION_ADMIN_ACCOUNT',
      targetType: 'USER',
      targetId: admin.id,
      newState: { email: admin.email, name: admin.name },
      reason: 'Admin account provisioned by administrator',
      ipAddress: req.ip,
    });

    return successResponse(res, admin, 'Administrator account provisioned successfully (FR-AD-4)', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Display pending verification queue
 * Requirement: FR-AD-5, UC-13
 */
async function getVerificationQueue(req, res, next) {
  try {
    const pendingUsers = await prisma.user.findMany({
      where: {
        accountStatus: ACCOUNT_STATUS.PENDING,
        role: { in: [ROLES.DRIVER, ROLES.FLEET_OWNER] },
      },
      include: {
        documents: true,
        driverVehicle: true,
        fleetVehicles: true,
      },
      orderBy: { createdAt: 'asc' }, // Ordered by submission time
    });

    const now = new Date();
    const queue = pendingUsers.map((u) => {
      const elapsedHours = Math.round((now - u.createdAt) / (1000 * 60 * 60));
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        phone: u.phone,
        email: u.email,
        submittedAt: u.createdAt,
        elapsedWaitingHours: elapsedHours,
        documentsCount: u.documents.length,
        hasVehicles: u.driverVehicle ? true : u.fleetVehicles.length > 0,
      };
    });

    return successResponse(res, queue, 'Verification queue retrieved (FR-AD-5)');
  } catch (error) {
    next(error);
  }
}

/**
 * Review uploaded documents for user with time-limited signed links
 * Requirement: FR-AD-6, SEC-8, SI-4.2
 */
async function getUserVerificationDocuments(req, res, next) {
  try {
    const { id: userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        documents: true,
        driverVehicle: true,
        fleetVehicles: true,
      },
    });

    if (!user) {
      return errorResponse(res, 'USER_NOT_FOUND', 'User not found', 404);
    }

    const docsWithSignedUrls = user.documents.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      verificationStatus: doc.verificationStatus,
      expiryDate: doc.expiryDate,
      originalFilename: doc.originalFilename,
      fileSizeBytes: doc.fileSizeBytes,
      signedUrl: generateSignedReadUrl(doc.storageKey, 900), // 15-minute link (SEC-8)
      uploadedAt: doc.createdAt,
    }));

    return successResponse(
      res,
      {
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          phone: user.phone,
          email: user.email,
          businessName: user.businessName,
          accountStatus: user.accountStatus,
        },
        documents: docsWithSignedUrls,
      },
      'User verification documents retrieved'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Approve or Reject verification
 * Requirement: FR-AD-7, BR-3, BR-28, SEC-15
 */
async function processVerificationDecision(req, res, next) {
  try {
    const { id: userId } = req.params;
    const { decision, rejectionReason } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return errorResponse(res, 'USER_NOT_FOUND', 'User not found', 404);
    }

    if (decision === 'REJECTED' && !rejectionReason) {
      return errorResponse(
        res,
        'REASON_REQUIRED',
        'A recorded reason is mandatory when rejecting a verification request (FR-AD-7).',
        400
      );
    }

    const newStatus = decision === 'APPROVED' ? ACCOUNT_STATUS.VERIFIED : ACCOUNT_STATUS.REJECTED;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { accountStatus: newStatus },
      }),
      prisma.verificationDocument.updateMany({
        where: { userId },
        data: {
          verificationStatus: decision,
          rejectionReason: decision === 'REJECTED' ? rejectionReason : null,
          verifiedByAdminId: req.user.id,
          verifiedAt: new Date(),
        },
      }),
    ]);

    // Record immutable admin audit log (BR-28, SEC-15)
    await logAdminAction({
      adminId: req.user.id,
      action: decision === 'APPROVED' ? 'APPROVE_VERIFICATION' : 'REJECT_VERIFICATION',
      targetType: 'USER',
      targetId: userId,
      previousState: { accountStatus: user.accountStatus },
      newState: { accountStatus: newStatus },
      reason: rejectionReason || 'Documents verified and approved',
      ipAddress: req.ip,
    });

    // Notify user of verification outcome (FR-NC-2)
    const noticeMessage =
      decision === 'APPROVED'
        ? 'Congratulations! Your account has been verified. You can now bid and participate on SmartHaul.'
        : `Verification unsuccessful: ${rejectionReason}. Please update your documents and resubmit.`;

    await dispatchNotification({
      recipientId: userId,
      type: 'VERIFICATION_OUTCOME',
      title: decision === 'APPROVED' ? 'Account Verified' : 'Verification Rejected',
      message: noticeMessage,
    });

    return successResponse(res, { accountStatus: newStatus }, `Verification ${decision.toLowerCase()} successfully`);
  } catch (error) {
    next(error);
  }
}

/**
 * Suspend or Reinstate User Account
 * Requirement: FR-AD-9, BR-13, BR-28, SEC-15
 */
async function updateUserAccountStatus(req, res, next) {
  try {
    const { id: userId } = req.params;
    const { status, reason } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return errorResponse(res, 'USER_NOT_FOUND', 'User not found', 404);
    }

    if (user.role === ROLES.ADMIN) {
      return errorResponse(res, 'CANNOT_SUSPEND_ADMIN', 'Cannot modify administrator status via this endpoint', 400);
    }

    // If suspending, withdraw open bids (FR-AD-9)
    if (status === ACCOUNT_STATUS.SUSPENDED) {
      await prisma.bid.updateMany({
        where: { bidderId: userId, status: BID_STATUS.ACTIVE },
        data: { status: BID_STATUS.WITHDRAWN },
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { accountStatus: status },
    });

    // Immutable audit log
    await logAdminAction({
      adminId: req.user.id,
      action: status === ACCOUNT_STATUS.SUSPENDED ? 'SUSPEND_ACCOUNT' : 'REINSTATE_ACCOUNT',
      targetType: 'USER',
      targetId: userId,
      previousState: { accountStatus: user.accountStatus },
      newState: { accountStatus: status },
      reason,
      ipAddress: req.ip,
    });

    // Notify user
    await dispatchNotification({
      recipientId: userId,
      type: 'ACCOUNT_SUSPENDED_OR_REINSTATED',
      title: `Account ${status === ACCOUNT_STATUS.SUSPENDED ? 'Suspended' : 'Reinstated'}`,
      message: `Your account status has been updated to ${status}. Reason: ${reason}`,
    });

    return successResponse(res, updatedUser, `Account status updated to ${status} (FR-AD-9)`);
  } catch (error) {
    next(error);
  }
}

/**
 * Monitor exceptional shipments (delayed, unassigned, disputed)
 * Requirement: FR-AD-12
 */
async function getExceptionalShipments(req, res, next) {
  try {
    const now = new Date();

    // 1. Delayed shipments: IN_TRANSIT and delivery date in past
    // 2. Unassigned shipments: BOOKED with no driver assigned
    // 3. Disputed shipments: Open complaints
    const shipments = await prisma.shipment.findMany({
      where: {
        OR: [
          {
            status: { in: [SHIPMENT_STATUS.IN_TRANSIT, SHIPMENT_STATUS.BOOKED] },
            expectedDeliveryDate: { lt: now },
          },
          {
            complaints: {
              some: { status: { in: ['PENDING', 'UNDER_REVIEW'] } },
            },
          },
        ],
      },
      include: {
        cargoOwner: { select: { id: true, name: true, phone: true } },
        trip: { include: { driver: true, vehicle: true } },
        complaints: { where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    return successResponse(res, shipments, 'Exceptional shipments retrieved (FR-AD-12)');
  } catch (error) {
    next(error);
  }
}

/**
 * List submitted complaints
 * Requirement: FR-AD-13
 */
async function listComplaints(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { status, category } = req.query;

    const whereClause = {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
    };

    const [total, complaints] = await Promise.all([
      prisma.complaint.count({ where: whereClause }),
      prisma.complaint.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          submitter: { select: { id: true, name: true, role: true, phone: true } },
          counterparty: { select: { id: true, name: true, role: true, phone: true } },
          shipment: { select: { id: true, shipmentNumber: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return successResponse(
      res,
      complaints,
      'Complaints retrieved',
      200,
      buildPaginationMeta(total, page, limit)
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Resolve complaint & payment dispute
 * Requirement: FR-AD-14, FR-AD-15, FR-AD-16, BR-23, BR-25, BR-28
 */
async function resolveComplaint(req, res, next) {
  try {
    const { id: complaintId } = req.params;
    const { decision, adminRemarks, adjustedFare, adjustedPaymentStatus } = req.body;

    const complaint = await prisma.complaint.findUnique({
      where: { id: complaintId },
      include: { shipment: { include: { paymentRecord: true } } },
    });

    if (!complaint) {
      return errorResponse(res, 'COMPLAINT_NOT_FOUND', 'Complaint not found', 404);
    }

    const isPaymentDispute = complaint.category === COMPLAINT_CATEGORIES.PAYMENT_DISPUTE;

    await prisma.$transaction(async (tx) => {
      // 1. Update complaint status and remarks (FR-AD-15)
      await tx.complaint.update({
        where: { id: complaintId },
        data: {
          status: decision,
          adminRemarks,
          resolvedByAdminId: req.user.id,
          resolvedAt: new Date(),
        },
      });

      // 2. If payment dispute, unfreeze and conditionally amend fare (FR-AD-16, BR-23)
      if (isPaymentDispute && complaint.shipment && complaint.shipment.paymentRecord) {
        const paymentRecord = complaint.shipment.paymentRecord;
        const previousFare = paymentRecord.agreedFare;

        await tx.paymentRecord.update({
          where: { id: paymentRecord.id },
          data: {
            isFrozen: false,
            ...(adjustedFare ? { agreedFare: adjustedFare } : {}),
            ...(adjustedPaymentStatus ? { status: adjustedPaymentStatus } : {}),
          },
        });

        // Log payment status log
        await tx.paymentStatusLog.create({
          data: {
            paymentRecordId: paymentRecord.id,
            previousStatus: paymentRecord.status,
            newStatus: adjustedPaymentStatus || paymentRecord.status,
            amountReceived: paymentRecord.amountReceived,
            changedById: req.user.id,
            note: `Administrator resolved dispute: ${adminRemarks}`,
          },
        });

        // Log admin audit action (BR-28, SEC-15)
        await logAdminAction({
          adminId: req.user.id,
          action: 'RESOLVE_PAYMENT_DISPUTE',
          targetType: 'PAYMENT',
          targetId: paymentRecord.id,
          previousState: { agreedFare: previousFare, status: paymentRecord.status },
          newState: { agreedFare: adjustedFare || previousFare, status: adjustedPaymentStatus || paymentRecord.status },
          reason: adminRemarks,
          ipAddress: req.ip,
        });
      } else {
        // Standard complaint resolution audit log
        await logAdminAction({
          adminId: req.user.id,
          action: `COMPLAINT_${decision}`,
          targetType: 'COMPLAINT',
          targetId: complaintId,
          previousState: { status: complaint.status },
          newState: { status: decision },
          reason: adminRemarks,
          ipAddress: req.ip,
        });
      }
    });

    // Notify submitter and counterparty (FR-NC-11)
    await dispatchNotification({
      recipientId: complaint.submitterId,
      type: 'COMPLAINT_STATUS_CHANGED',
      title: `Complaint ${decision}`,
      message: `Your complaint (${complaint.referenceCode}) has been marked as ${decision}. Remarks: ${adminRemarks}`,
      relatedShipmentId: complaint.shipmentId,
    });

    if (complaint.counterpartyId) {
      await dispatchNotification({
        recipientId: complaint.counterpartyId,
        type: 'COMPLAINT_STATUS_CHANGED',
        title: `Complaint ${decision}`,
        message: `Complaint (${complaint.referenceCode}) against you has been marked as ${decision}. Remarks: ${adminRemarks}`,
        relatedShipmentId: complaint.shipmentId,
      });
    }

    return successResponse(res, null, `Complaint ${decision.toLowerCase()} successfully (FR-AD-14)`);
  } catch (error) {
    next(error);
  }
}

/**
 * View immutable admin audit trail
 * Requirement: FR-AD-19, BR-28, SEC-15
 */
async function getAuditLogs(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { targetType, adminId } = req.query;

    const whereClause = {
      ...(targetType ? { targetType } : {}),
      ...(adminId ? { adminId } : {}),
    };

    const [total, logs] = await Promise.all([
      prisma.adminAuditLog.count({ where: whereClause }),
      prisma.adminAuditLog.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          admin: { select: { id: true, name: true, email: true } },
        },
        orderBy: { timestamp: 'desc' },
      }),
    ]);

    return successResponse(res, logs, 'Admin audit logs retrieved', 200, buildPaginationMeta(total, page, limit));
  } catch (error) {
    next(error);
  }
}

/**
 * Broadcast platform announcement
 * Requirement: FR-AD-20
 */
async function broadcastAnnouncement(req, res, next) {
  try {
    const { title, message, targetRole } = req.body;

    const whereClause = targetRole && targetRole !== 'ALL' ? { role: targetRole } : {};
    const users = await prisma.user.findMany({
      where: whereClause,
      select: { id: true },
    });

    // Create notifications for all matching users
    if (users.length > 0) {
      await prisma.notification.createMany({
        data: users.map((u) => ({
          recipientId: u.id,
          type: 'PLATFORM_ANNOUNCEMENT',
          title,
          message,
        })),
      });
    }

    await logAdminAction({
      adminId: req.user.id,
      action: 'BROADCAST_ANNOUNCEMENT',
      targetType: 'PLATFORM',
      targetId: 'ALL',
      newState: { title, targetRole, recipientCount: users.length },
      reason: message,
      ipAddress: req.ip,
    });

    return successResponse(res, { recipientCount: users.length }, 'Announcement broadcasted successfully (FR-AD-20)');
  } catch (error) {
    next(error);
  }
}

/**
 * List all shipments platform-wide with status filter and search
 * Requirement: FR-AD-10
 */
async function listAllShipments(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { status, search } = req.query;

    const whereClause = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { shipmentNumber: { contains: search, mode: 'insensitive' } },
              { pickupAddress: { contains: search, mode: 'insensitive' } },
              { dropoffAddress: { contains: search, mode: 'insensitive' } },
              { cargoType: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, shipments] = await Promise.all([
      prisma.shipment.count({ where: whereClause }),
      prisma.shipment.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          cargoOwner: { select: { id: true, name: true, phone: true, email: true } },
          trip: {
            include: {
              driver: { select: { id: true, name: true, phone: true } },
              vehicle: true,
            },
          },
          paymentRecord: true,
          complaints: true,
          _count: { select: { bids: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return successResponse(
      res,
      shipments,
      'Platform shipments retrieved (FR-AD-10)',
      200,
      buildPaginationMeta(total, page, limit)
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  provisionAdmin,
  getVerificationQueue,
  getUserVerificationDocuments,
  processVerificationDecision,
  updateUserAccountStatus,
  listAllShipments,
  getExceptionalShipments,
  listComplaints,
  resolveComplaint,
  getAuditLogs,
  broadcastAnnouncement,
};
