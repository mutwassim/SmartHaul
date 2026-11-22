const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../../config/db');
const { logAdminAction } = require('../../services/audit.service');
const { hashToken } = require('../../utils/token');
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

const COMPLAINT_STATUSES = ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'WITHDRAWN'];
const OPEN_COMPLAINT_STATUSES = ['PENDING', 'UNDER_REVIEW'];

/**
 * Provision new administrator account
 * Requirement: FR-AD-1 (Administrators are provisioned, not self-registered)
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

    return successResponse(res, admin, 'Administrator account provisioned successfully (FR-AD-1)', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Display pending verification queue
 * Requirement: FR-AD-2, UC-13
 */
async function getVerificationQueue(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const pendingUsers = await prisma.user.findMany({
      where: {
        accountStatus: ACCOUNT_STATUS.PENDING,
        role: { in: [ROLES.DRIVER, ROLES.FLEET_OWNER] },
      },
      select: {
        id: true,
        name: true,
        role: true,
        phone: true,
        email: true,
        createdAt: true,
        documents: { select: { createdAt: true } },
        driverVehicle: { select: { id: true } },
        fleetVehicles: { select: { id: true } },
      },
    });

    // Submission time is the last document upload, not the registration time (C-53).
    // Oldest submission first; users with no documents yet fall back to registration time.
    const withSubmission = pendingUsers.map((u) => ({
      ...u,
      submittedAt: u.documents.length
        ? new Date(Math.max(...u.documents.map((d) => d.createdAt.getTime())))
        : u.createdAt,
    }));
    withSubmission.sort((a, b) => a.submittedAt - b.submittedAt);

    const now = new Date();
    const queue = withSubmission.slice(skip, skip + limit).map((u) => {
      const elapsedHours = Math.round((now - u.submittedAt) / (1000 * 60 * 60));
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        phone: u.phone,
        email: u.email,
        submittedAt: u.submittedAt,
        elapsedWaitingHours: elapsedHours,
        documentsCount: u.documents.length,
        hasVehicles: u.driverVehicle ? true : u.fleetVehicles.length > 0,
      };
    });

    return successResponse(res, queue, 'Verification queue retrieved (FR-AD-2)', 200, buildPaginationMeta(withSubmission.length, page, limit));
  } catch (error) {
    next(error);
  }
}

/**
 * Review uploaded documents for user with time-limited signed links
 * Requirement: FR-AD-3, SEC-8, SI-4.2
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
 * Requirement: FR-AD-4, BR-3, BR-28, SEC-15
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

    // Only drivers and fleet owners go through verification (BR-3)
    if (user.role !== ROLES.DRIVER && user.role !== ROLES.FLEET_OWNER) {
      return errorResponse(res, 'ROLE_NOT_VERIFIABLE', 'Only driver and fleet owner accounts are verified.', 400);
    }

    // A decision is only valid on a request that is waiting for one
    if (user.accountStatus !== ACCOUNT_STATUS.PENDING) {
      return errorResponse(
        res,
        'NOT_PENDING_VERIFICATION',
        `This account is ${user.accountStatus} and has no pending verification request.`,
        409
      );
    }

    if (decision === 'REJECTED' && !rejectionReason) {
      return errorResponse(
        res,
        'REASON_REQUIRED',
        'A recorded reason is mandatory when rejecting a verification request (FR-AD-4).',
        400
      );
    }

    const pendingDocs = await prisma.verificationDocument.count({
      where: { userId, verificationStatus: 'PENDING' },
    });
    if (pendingDocs === 0) {
      return errorResponse(res, 'NO_DOCUMENTS_TO_REVIEW', 'The user has no submitted documents to review.', 409);
    }

    const newStatus = decision === 'APPROVED' ? ACCOUNT_STATUS.VERIFIED : ACCOUNT_STATUS.REJECTED;

    // Compare-and-set: two administrators deciding at once cannot both succeed
    const decided = await prisma.$transaction(async (tx) => {
      const moved = await tx.user.updateMany({
        where: { id: userId, accountStatus: ACCOUNT_STATUS.PENDING },
        data: { accountStatus: newStatus },
      });
      if (moved.count === 0) return false;
      await tx.verificationDocument.updateMany({
        where: { userId, verificationStatus: 'PENDING' },
        data: {
          verificationStatus: decision,
          rejectionReason: decision === 'REJECTED' ? rejectionReason : null,
          verifiedByAdminId: req.user.id,
          verifiedAt: new Date(),
        },
      });
      return true;
    });
    if (!decided) {
      return errorResponse(res, 'NOT_PENDING_VERIFICATION', 'Another administrator has already decided this request.', 409);
    }

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
 * Requirement: FR-AD-5, BR-13, BR-28, SEC-15
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

    const suspending = status === ACCOUNT_STATUS.SUSPENDED;
    let targetStatus = status;

    if (suspending) {
      if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
        return errorResponse(res, 'ALREADY_SUSPENDED', 'This account is already suspended.', 409);
      }
    } else {
      // Reinstating restores the status held before suspension, so verification cannot be bypassed
      if (user.accountStatus !== ACCOUNT_STATUS.SUSPENDED) {
        return errorResponse(res, 'NOT_SUSPENDED', 'Only a suspended account can be reinstated.', 409);
      }
      targetStatus =
        user.statusBeforeSuspension ||
        (user.role === ROLES.CARGO_OWNER ? ACCOUNT_STATUS.ACTIVE : ACCOUNT_STATUS.PENDING);
      if (status !== targetStatus) {
        return errorResponse(
          res,
          'STATUS_MISMATCH',
          `Reinstatement restores the previous status (${targetStatus}).`,
          409
        );
      }
    }

    // Suspension withdraws open bids (FR-AD-5) and ends every session of the user (SEC-4), in one step
    const updatedUser = await prisma.$transaction(async (tx) => {
      if (suspending) {
        await tx.bid.updateMany({
          where: { bidderId: userId, status: BID_STATUS.ACTIVE },
          data: { status: BID_STATUS.WITHDRAWN },
        });
      }
      return tx.user.update({
        where: { id: userId },
        data: {
          accountStatus: targetStatus,
          statusBeforeSuspension: suspending ? user.accountStatus : null,
          ...(suspending ? { tokenVersion: { increment: 1 } } : {}),
        },
        select: { id: true, role: true, name: true, accountStatus: true },
      });
    });

    // Immutable audit log
    await logAdminAction({
      adminId: req.user.id,
      action: status === ACCOUNT_STATUS.SUSPENDED ? 'SUSPEND_ACCOUNT' : 'REINSTATE_ACCOUNT',
      targetType: 'USER',
      targetId: userId,
      previousState: { accountStatus: user.accountStatus },
      newState: { accountStatus: targetStatus },
      reason,
      ipAddress: req.ip,
    });

    // Notify user
    await dispatchNotification({
      recipientId: userId,
      type: 'ACCOUNT_SUSPENDED_OR_REINSTATED',
      title: `Account ${status === ACCOUNT_STATUS.SUSPENDED ? 'Suspended' : 'Reinstated'}`,
      message: `Your account status has been updated to ${targetStatus}. Reason: ${reason}`,
    });

    return successResponse(res, updatedUser, `Account status updated to ${targetStatus} (FR-AD-5)`);
  } catch (error) {
    next(error);
  }
}

/**
 * Issue a one-time password reset token for a user who requested recovery.
 * Replaces returning the token to the requester (no SMS/email channel exists). Admin gives it to the verified owner.
 * Requirement: FR-SV-4, SEC-1
 */
async function issuePasswordResetToken(req, res, next) {
  try {
    const { id: userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return errorResponse(res, 'USER_NOT_FOUND', 'User not found', 404);
    }

    if (user.role === ROLES.ADMIN) {
      return errorResponse(res, 'CANNOT_RESET_ADMIN', 'Administrator passwords cannot be reset via this endpoint', 400);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry

    // Only the hash is stored; earlier unused tokens for this user stop working
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({ where: { userId, isUsed: false }, data: { isUsed: true } }),
      prisma.passwordResetToken.create({
        data: { userId, token: hashToken(resetToken), expiresAt },
      }),
    ]);

    await logAdminAction({
      adminId: req.user.id,
      action: 'ISSUE_PASSWORD_RESET_TOKEN',
      targetType: 'USER',
      targetId: userId,
      reason: req.body.reason,
      ipAddress: req.ip,
    });

    return successResponse(res, { resetToken, expiresAt }, 'Password reset token issued. Give it to the account owner.');
  } catch (error) {
    next(error);
  }
}

/**
 * List platform users with role, status and search filters
 * Requirement: FR-SV-11
 */
async function listUsers(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { role, accountStatus, search } = req.query;

    const whereClause = {
      ...(Object.values(ROLES).includes(role) ? { role } : {}),
      ...(Object.values(ACCOUNT_STATUS).includes(accountStatus) ? { accountStatus } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where: whereClause }),
      prisma.user.findMany({
        where: whereClause,
        skip,
        take: limit,
        select: {
          id: true,
          role: true,
          name: true,
          email: true,
          phone: true,
          accountStatus: true,
          statusBeforeSuspension: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return successResponse(res, users, 'Users retrieved', 200, buildPaginationMeta(total, page, limit));
  } catch (error) {
    next(error);
  }
}

/**
 * Monitor exceptional shipments (delayed, unassigned, disputed)
 * Requirement: FR-AD-8
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
        trip: {
          include: {
            driver: { select: { id: true, name: true, phone: true } },
            vehicle: true,
          },
        },
        complaints: { where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      omit: { routePolyline: true }, // C-33
    });

    return successResponse(res, shipments, 'Exceptional shipments retrieved (FR-AD-8)');
  } catch (error) {
    next(error);
  }
}

/**
 * List submitted complaints
 * Requirement: FR-AD-9
 */
async function listComplaints(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { status, category } = req.query;

    if (status && !COMPLAINT_STATUSES.includes(status)) {
      return errorResponse(res, 'INVALID_STATUS_FILTER', `Status must be one of ${COMPLAINT_STATUSES.join(', ')}`, 400);
    }
    if (category && !Object.prototype.hasOwnProperty.call(COMPLAINT_CATEGORIES, category)) {
      return errorResponse(res, 'INVALID_CATEGORY_FILTER', 'Category is not one of the complaint categories (Table C-4)', 400);
    }

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
 * Requirement: FR-AD-10, FR-AD-10, FR-AD-11, BR-23, BR-25, BR-28
 */
async function resolveComplaint(req, res, next) {
  try {
    const { id: complaintId } = req.params;
    const { decision, adminRemarks, adjustedFare, adjustedPaymentStatus, waivePenalty } = req.body;

    const complaint = await prisma.complaint.findUnique({
      where: { id: complaintId },
      include: { shipment: { include: { paymentRecord: true } } },
    });

    if (!complaint) {
      return errorResponse(res, 'COMPLAINT_NOT_FOUND', 'Complaint not found', 404);
    }

    const isPaymentDispute = complaint.category === COMPLAINT_CATEGORIES.PAYMENT_DISPUTE;

    // A resolved or withdrawn complaint is final: resolving it again would adjust the fare again (C-40)
    if (!OPEN_COMPLAINT_STATUSES.includes(complaint.status)) {
      return errorResponse(
        res,
        'COMPLAINT_ALREADY_CLOSED',
        `This complaint is already ${complaint.status} and cannot be resolved again.`,
        409
      );
    }

    // Adjustments belong to a resolved payment dispute only
    const hasAdjustment = adjustedFare !== undefined || adjustedPaymentStatus !== undefined;
    if (hasAdjustment && !(isPaymentDispute && decision === 'RESOLVED')) {
      return errorResponse(
        res,
        'ADJUSTMENT_NOT_ALLOWED',
        'A fare or payment status can be adjusted only when resolving a payment dispute.',
        400
      );
    }

    // Lifting a no-show penalty belongs to a resolved cancellation dispute only
    const waiving = waivePenalty === true;
    if (waiving && !(complaint.category === COMPLAINT_CATEGORIES.CANCELLATION_DISPUTE && decision === 'RESOLVED')) {
      return errorResponse(
        res,
        'PENALTY_WAIVER_NOT_ALLOWED',
        'A penalty can be waived only when resolving a cancellation dispute.',
        400
      );
    }

    let adjustment = null;
    if (isPaymentDispute && complaint.shipment && complaint.shipment.paymentRecord) {
      const pr = complaint.shipment.paymentRecord;
      const fare = adjustedFare !== undefined ? adjustedFare : pr.agreedFare;
      let received = pr.amountReceived;
      const status = adjustedPaymentStatus !== undefined ? adjustedPaymentStatus : pr.status;
      if (status === 'PAID') received = fare;
      else if (status === 'PENDING') received = 0;
      if (received > fare) {
        return errorResponse(
          res,
          'AMOUNT_EXCEEDS_AGREED_FARE',
          `The amount already received (PKR ${received}) exceeds the adjusted fare (PKR ${fare}). Adjust the payment status too.`,
          400
        );
      }
      if (status === 'PARTIAL' && (received <= 0 || received >= fare)) {
        return errorResponse(
          res,
          'INVALID_PARTIAL_AMOUNT',
          'A Partial payment needs an amount received between 0 and the fare.',
          400
        );
      }
      adjustment = { fare, received, status };
    }

    const closed = await prisma.$transaction(async (tx) => {
      // 1. Update complaint status and remarks (FR-AD-10). Conditional on it still being open.
      const updated = await tx.complaint.updateMany({
        where: { id: complaintId, status: { in: OPEN_COMPLAINT_STATUSES } },
        data: {
          status: decision,
          adminRemarks,
          resolvedByAdminId: req.user.id,
          resolvedAt: new Date(),
        },
      });
      if (updated.count !== 1) return false;

      // The complainant's no-show penalty on this shipment is lifted; a suspension stays until an admin reinstates
      if (waiving) {
        await tx.driverPenalty.updateMany({
          where: { shipmentId: complaint.shipmentId, userId: complaint.submitterId, status: 'ACTIVE' },
          data: { status: 'WAIVED', waivedAt: new Date() },
        });
      }

      // 2. If payment dispute, unfreeze (only when no other dispute is open) and amend fare/status (FR-AD-11, BR-23)
      if (isPaymentDispute && complaint.shipment && complaint.shipment.paymentRecord) {
        const paymentRecord = complaint.shipment.paymentRecord;
        const previousFare = paymentRecord.agreedFare;

        const stillOpen = await tx.complaint.count({
          where: {
            shipmentId: complaint.shipmentId,
            category: COMPLAINT_CATEGORIES.PAYMENT_DISPUTE,
            status: { in: OPEN_COMPLAINT_STATUSES },
          },
        });

        await tx.paymentRecord.update({
          where: { id: paymentRecord.id },
          data: {
            ...(stillOpen === 0 ? { isFrozen: false } : {}),
            ...(hasAdjustment
              ? { agreedFare: adjustment.fare, amountReceived: adjustment.received, status: adjustment.status }
              : {}),
          },
        });

        // Log payment status log
        await tx.paymentStatusLog.create({
          data: {
            paymentRecordId: paymentRecord.id,
            previousStatus: paymentRecord.status,
            newStatus: adjustment.status,
            amountReceived: adjustment.received,
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
          previousState: { agreedFare: previousFare, status: paymentRecord.status, amountReceived: paymentRecord.amountReceived },
          newState: { agreedFare: adjustment.fare, status: adjustment.status, amountReceived: adjustment.received },
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
      return true;
    });

    if (!closed) {
      return errorResponse(res, 'COMPLAINT_ALREADY_CLOSED', 'This complaint was closed by someone else a moment ago.', 409);
    }

    // Notify submitter and counterparty (FR-NC-10)
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

    return successResponse(res, null, `Complaint ${decision.toLowerCase()} successfully (FR-AD-10)`);
  } catch (error) {
    next(error);
  }
}

/**
 * View immutable admin audit trail
 * Requirement: FR-AD-13, BR-28, SEC-15
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
 * Requirement: FR-AD-14
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

    return successResponse(res, { recipientCount: users.length }, 'Announcement broadcasted successfully (FR-AD-14)');
  } catch (error) {
    next(error);
  }
}

/**
 * List all shipments platform-wide with status filter and search
 * Requirement: FR-AD-6
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
        omit: { routePolyline: true }, // C-33
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
      'Platform shipments retrieved (FR-AD-6)',
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
  issuePasswordResetToken,
  listUsers,
  listAllShipments,
  getExceptionalShipments,
  listComplaints,
  resolveComplaint,
  getAuditLogs,
  broadcastAnnouncement,
};
