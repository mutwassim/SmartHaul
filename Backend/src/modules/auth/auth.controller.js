const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../../config/db');
const { generateToken, revokeToken } = require('../../utils/token');
const { encrypt, hashDeterministic } = require('../../services/encryption.service');
const { logAuthEvent } = require('../../services/audit.service');
const { registerDeviceToken } = require('../../services/fcm.service');
const { dispatchNotification } = require('../../services/fcm.service');
const { successResponse, errorResponse } = require('../../utils/response');
const { ROLES, ACCOUNT_STATUS, SECURITY, NOTIFICATION_TYPES } = require('../../config/constants');

/**
 * Self-registration for Cargo Owners, Drivers, and Fleet Owners
 * Admin self-registration is strictly prohibited (FR-AD-4, FR-SV-1, BR-1, BR-2)
 */
async function register(req, res, next) {
  try {
    const {
      role,
      name,
      phone,
      email,
      password,
      cnicNumber,
      businessName,
      businessAddress,
      preferredLanguage,
    } = req.body;

    // Security Gate: Reject admin self-registration (FR-AD-4)
    if (role === ROLES.ADMIN) {
      return errorResponse(
        res,
        'ADMIN_SELF_REGISTRATION_PROHIBITED',
        'Administrator accounts cannot be self-registered. They must be provisioned directly by an authorized administrator (FR-AD-4).',
        403
      );
    }

    // 1. Check unique phone per role (BR-1)
    const existingPhone = await prisma.user.findFirst({
      where: { phone, role },
    });
    if (existingPhone) {
      return errorResponse(
        res,
        'PHONE_ALREADY_REGISTERED',
        'An account with this contact number already exists for the selected role.',
        409
      );
    }

    // 2. Check unique email per role (BR-1)
    const existingEmail = await prisma.user.findFirst({
      where: { email, role },
    });
    if (existingEmail) {
      return errorResponse(
        res,
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email address already exists for the selected role.',
        409
      );
    }

    // 3. Process CNIC encryption and uniqueness check (BR-2, SEC-7, CON-12)
    let cnicEncrypted = null;
    let cnicIv = null;
    let cnicTag = null;
    let cnicHash = null;

    if (cnicNumber) {
      cnicHash = hashDeterministic(cnicNumber);
      const existingCnic = await prisma.user.findFirst({
        where: { cnicHash },
      });

      if (existingCnic) {
        return errorResponse(
          res,
          'CNIC_ALREADY_REGISTERED',
          'This CNIC number is already associated with another verified account on the platform (BR-2).',
          409
        );
      }

      const enc = encrypt(cnicNumber);
      cnicEncrypted = enc.encryptedData;
      cnicIv = enc.iv;
      cnicTag = enc.authTag;
    }

    // 4. Hash password with bcrypt (SEC-2, CON-11)
    const passwordHash = await bcrypt.hash(password, 10);

    // 5. Determine initial account status
    // Cargo owners are immediately ACTIVE; Drivers and Fleet Owners are PENDING verification (BR-1, Table C-2)
    const initialStatus =
      role === ROLES.CARGO_OWNER ? ACCOUNT_STATUS.ACTIVE : ACCOUNT_STATUS.PENDING;

    const newUser = await prisma.user.create({
      data: {
        role,
        name,
        phone,
        email,
        passwordHash,
        accountStatus: initialStatus,
        cnicEncrypted,
        cnicIv,
        cnicTag,
        cnicHash,
        businessName: businessName || null,
        businessAddress: businessAddress || null,
        preferredLanguage: preferredLanguage || 'EN',
      },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        email: true,
        accountStatus: true,
        businessName: true,
        businessAddress: true,
        preferredLanguage: true,
        createdAt: true,
      },
    });

    // 6. Log authentication & registration activity (FR-SV-20)
    await logAuthEvent({
      userId: newUser.id,
      identifier: email,
      action: 'LOGIN_SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // 7. Dispatch welcome notification (FR-NC-1)
    const verificationNotice =
      role === ROLES.CARGO_OWNER
        ? 'Welcome to SmartHaul! You can now create shipment requests.'
        : 'Welcome to SmartHaul! Please upload your identity and vehicle documents to start bidding.';

    await dispatchNotification({
      recipientId: newUser.id,
      type: 'REGISTRATION_CONFIRMED',
      title: 'Welcome to SmartHaul',
      message: verificationNotice,
    });

    // Generate JWT token
    const token = generateToken(newUser);

    return successResponse(
      res,
      {
        user: newUser,
        token,
      },
      'Registration successful',
      201
    );
  } catch (error) {
    next(error);
  }
}

/**
 * User login with lockout protection
 * Requirement: SEC-5, FR-SV-2, FR-SV-3, FR-SV-18
 */
async function login(req, res, next) {
  try {
    const { identifier, password, role, deviceToken, platform } = req.body;
    const ipAddress = req.ip;

    // Search user by email or phone within the given role
    const user = await prisma.user.findFirst({
      where: {
        role,
        OR: [{ email: identifier }, { phone: identifier }],
      },
    });

    // Generic invalid credential response to avoid account enumeration (FR-SV-3)
    const invalidCredsResponse = () => {
      return errorResponse(res, 'INVALID_CREDENTIALS', 'Invalid identifier, password, or role combination', 401);
    };

    if (!user) {
      await logAuthEvent({
        identifier,
        action: 'LOGIN_FAILED',
        ipAddress,
        userAgent: req.headers['user-agent'],
      });
      return invalidCredsResponse();
    }

    // Check account lockout (SEC-5, FR-SV-18)
    const now = new Date();
    if (user.lockoutUntil && user.lockoutUntil > now) {
      const minutesRemaining = Math.ceil((user.lockoutUntil - now) / (60 * 1000));
      return errorResponse(
        res,
        'ACCOUNT_LOCKED',
        `Account is temporarily locked due to repeated failed login attempts. Please try again in ${minutesRemaining} minutes (SEC-5).`,
        423
      );
    }

    // Check if password matches
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      const failedAttempts = user.failedLoginAttempts + 1;
      let lockoutDate = null;

      if (failedAttempts >= SECURITY.MAX_FAILED_LOGIN_ATTEMPTS) {
        lockoutDate = new Date(Date.now() + SECURITY.LOCKOUT_DURATION_MS);
        await logAuthEvent({
          userId: user.id,
          identifier,
          action: 'ACCOUNT_LOCKED',
          ipAddress,
          userAgent: req.headers['user-agent'],
        });
      } else {
        await logAuthEvent({
          userId: user.id,
          identifier,
          action: 'LOGIN_FAILED',
          ipAddress,
          userAgent: req.headers['user-agent'],
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: failedAttempts,
          lockoutUntil: lockoutDate,
        },
      });

      return invalidCredsResponse();
    }

    // Reset failed login counter on successful authentication
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
        lastLoginAt: now,
      },
    });

    // Register device token for push notifications if provided (SI-3.2)
    if (deviceToken) {
      await registerDeviceToken(user.id, deviceToken, platform);
    }

    // Log auth success (FR-AD-3, FR-SV-19)
    await logAuthEvent({
      userId: user.id,
      identifier,
      action: 'LOGIN_SUCCESS',
      ipAddress,
      userAgent: req.headers['user-agent'],
    });

    // Generate JWT token (SEC-3, SEC-4)
    const token = generateToken(user);

    return successResponse(
      res,
      {
        user: {
          id: user.id,
          role: user.role,
          name: user.name,
          phone: user.phone,
          email: user.email,
          accountStatus: user.accountStatus,
          businessName: user.businessName,
          businessAddress: user.businessAddress,
          preferredLanguage: user.preferredLanguage,
          avgRating: user.avgRating,
          completedTripsCount: user.completedTripsCount,
        },
        token,
      },
      'Login successful'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * User logout
 * Invalidates current session token (SEC-4)
 */
async function logout(req, res, next) {
  try {
    if (req.token) {
      revokeToken(req.token);
    }

    if (req.user) {
      await logAuthEvent({
        userId: req.user.id,
        identifier: req.user.email,
        action: 'LOGOUT',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    return successResponse(res, null, 'Successfully logged out and session invalidated');
  } catch (error) {
    next(error);
  }
}

/**
 * Request password recovery token
 * Requirement: FR-SV-6
 */
async function requestPasswordRecovery(req, res, next) {
  try {
    const { identifier, role } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        role,
        OR: [{ email: identifier }, { phone: identifier }],
      },
    });

    // Always respond with success to prevent user enumeration
    if (!user) {
      return successResponse(
        res,
        null,
        'If an account matches the provided details, a password recovery token has been issued.'
      );
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: resetToken,
        expiresAt,
      },
    });

    await logAuthEvent({
      userId: user.id,
      identifier,
      action: 'PASSWORD_RESET_REQUESTED',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // In production, token is sent via SMS / in-app notification
    return successResponse(
      res,
      { resetToken }, // Returned in dev/testing response envelope
      'Password recovery token issued successfully'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Reset password using recovery token
 * Requirement: FR-SV-6, SEC-1
 */
async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;

    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetRecord || resetRecord.isUsed || resetRecord.expiresAt < new Date()) {
      return errorResponse(res, 'INVALID_RESET_TOKEN', 'Password reset token is invalid or has expired', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password and invalidate reset token
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { isUsed: true },
      }),
    ]);

    await logAuthEvent({
      userId: resetRecord.userId,
      identifier: resetRecord.user.email,
      action: 'PASSWORD_RESET_SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Password reset successfully. You may now log in with your new password.');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  logout,
  requestPasswordRecovery,
  resetPassword,
};
