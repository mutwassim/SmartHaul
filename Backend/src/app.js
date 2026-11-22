const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { apiLimiter } = require('./middleware/rateLimiter.middleware');
const { errorHandler } = require('./middleware/error.middleware');
const env = require('./config/env');
const prisma = require('./config/db');
const { errorResponse } = require('./utils/response');

// Import Module Routers
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const cargoOwnerRoutes = require('./modules/cargo-owner/cargoOwner.routes');
const driverRoutes = require('./modules/driver/driver.routes');
const fleetRoutes = require('./modules/fleet/fleet.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const paymentRoutes = require('./modules/payments/payment.routes');
const complaintRoutes = require('./modules/complaints/complaint.routes');
const ratingRoutes = require('./modules/ratings/rating.routes');
const messageRoutes = require('./modules/messages/chat.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const trackingRoutes = require('./modules/tracking/tracking.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const storageRoutes = require('./modules/storage/storage.routes');

const app = express();

// Trust the hosting proxy so rate limits are per client, not per proxy (SI-1.6)
if (env.TRUST_PROXY > 0) {
  app.set('trust proxy', env.TRUST_PROXY);
}

// Security & Performance Middlewares (CI-1, CI-6)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
    hsts: env.NODE_ENV === 'production',
  })
);
app.use(
  cors({
    // Production: only listed origins. Development: reflect the request origin.
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : env.NODE_ENV !== 'production',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined'));

// Rate Limiting (SI-1.6)
app.use('/api/', apiLimiter);

// Health Check (also at /api/health, the only path the public proxy forwards)
app.get(['/health', '/api/health'], async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    return res.status(503).json({ status: 'unhealthy', database: 'down', timestamp: new Date().toISOString() });
  }
  res.status(200).json({
    status: 'healthy',
    database: 'up',
    timestamp: new Date().toISOString(),
    service: 'SmartHaul API Backend',
    version: '1.0.0',
  });
});

// Mount Versioned API Routes (SI-1.4)
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/shipments`, cargoOwnerRoutes);
app.use(`${API_PREFIX}/driver`, driverRoutes);
app.use(`${API_PREFIX}/fleet`, fleetRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/complaints`, complaintRoutes);
app.use(`${API_PREFIX}/ratings`, ratingRoutes);
app.use(`${API_PREFIX}/messages`, messageRoutes);
app.use(`${API_PREFIX}/notifications`, notificationRoutes);
app.use(`${API_PREFIX}/tracking`, trackingRoutes);
app.use(`${API_PREFIX}/analytics`, analyticsRoutes);
app.use(`${API_PREFIX}/storage`, storageRoutes);

// Unknown routes
app.use((req, res) => errorResponse(res, 'NOT_FOUND', 'Route not found', 404));

// Centralized Error Handling Middleware (SI-1.3, REL-10, SEC-16)
app.use(errorHandler);

module.exports = app;
