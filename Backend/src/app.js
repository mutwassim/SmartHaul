const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { apiLimiter } = require('./middleware/rateLimiter.middleware');
const { errorHandler } = require('./middleware/error.middleware');

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

// Security & Performance Middlewares (CI-1, CI-6)
app.use(helmet());
app.use(
  cors({
    origin: '*', // Allow all client origins in dev/testing
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined'));

// Rate Limiting (SI-1.6)
app.use('/api/', apiLimiter);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
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

// Centralized Error Handling Middleware (SI-1.3, REL-10, SEC-16)
app.use(errorHandler);

module.exports = app;
