import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Import routes - JWT Authentication Only
import jwtAuthRoutes from './routes/jwt-auth.js';
import adminAuthRoutes from './api/v1/routes/authRoutes.js';
// Legacy student routes removed - using unified users table only
import studentJWTAuthRoutes from './api/v1/routes/studentAuthRoutes.js';
import studentRoutes from './api/v1/routes/studentRoutes.js';
import volunteerRoutes from './api/v1/routes/volunteerRoutes.js';
import adminRoutes from './api/v1/routes/adminRoutes.js';
// Analytics routes REMOVED - handled by analytics-service microservice
// import analyticsRoutes from './api/v1/routes/analyticsRoutes.js';
// Meeting routes REMOVED - handled by meeting-service microservice
// import meetingRoutes from './api/v1/routes/meetingRoutes.js';
import meetingValidationRoutes from './api/v1/routes/meetingValidationRoutes.js';
// Legacy instantCalls routes removed - using unified users table only
// Legacy enhancedInstantCalls routes removed - using unified users table only
import meetingAccessRoutes from './routes/meetingAccess.js';
import parentalApprovalRoutes from './routes/parentalApproval.js';
import messageRoutes from './api/v1/routes/messageRoutes.js';
// Notification routes REMOVED - handled by notification-service microservice
// import notificationRoutes from './routes/notifications.js';
// Newsletter routes REMOVED - handled by newsletter-service microservice
// import newsletterRoutes from './routes/newsletter.js';
// import uploadRoutes from './routes/upload.js';
import mailchimpRoutes from './api/v1/routes/mailchimpRoutes.js';
import uploadRoutes from './api/v1/routes/uploadRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initializeSocket } from './socket.js';
import { redisClient } from './config/cache.js';
import { initializeScheduler, stopScheduler } from './services/schedulerService.js';
import configService from './services/configService.js';
// import { initializeSecurityTables } from './middleware/enhancedSecurity.js'; // Temporarily disabled

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Skip Redis for now - focus on JWT authentication
console.log('⚠️  Skipping Redis connection - running without caching');

// Redis is now used only for caching, not for sessions
// All authentication is handled via JWT tokens

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '../uploads')));

// Middleware setup
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// JWT Authentication middleware will be used instead of sessions

// ALL ROUTES NOW USE JWT AUTHENTICATION EXCLUSIVELY
// No session-based authentication is used anywhere in the application

// Import JWT middleware for route protection
import { createJWTMiddleware } from './utils/jwt.js';

// JWT Authentication middleware for different roles
const jwtAuthMiddleware = createJWTMiddleware();
const adminJWTMiddleware = createJWTMiddleware(['admin']);
const volunteerJWTMiddleware = createJWTMiddleware(['volunteer']);
const studentJWTMiddleware = createJWTMiddleware(['student']);
const adminOrVolunteerJWTMiddleware = createJWTMiddleware(['admin', 'volunteer']);
const adminOrStudentJWTMiddleware = createJWTMiddleware(['admin', 'student']);

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes - All routes now use JWT authentication exclusively
// No session-based authentication is used anywhere in the application

// Public routes (no authentication required)
app.use('/api/v1/parental-approval', parentalApprovalRoutes); // Parental approval routes
// Newsletter routes REMOVED - handled by newsletter-service microservice

// JWT Authentication routes (no additional middleware needed)
app.use('/api/v1/jwt-auth', jwtAuthRoutes);
app.use('/api/v1/jwt-auth/student', studentJWTAuthRoutes);
app.use('/api/v1/students', studentRoutes);

// Register route handlers with appropriate JWT protection
// LEGACY STUDENT ROUTES REMOVED - Using unified users table only

// Test endpoint to verify volunteer routes work (before JWT middleware)
app.get('/api/v1/volunteers/ping', (req, res) => {
    res.json({ success: true, message: 'Volunteer routes base path is accessible' });
});

app.use('/api/v1/volunteers', volunteerJWTMiddleware, volunteerRoutes);
// Meeting routes REMOVED - handled by meeting-service microservice
// app.use('/api/v1/meetings', adminOrVolunteerJWTMiddleware, meetingRoutes);
app.use('/api/v1/meeting-validation', adminOrStudentJWTMiddleware, meetingValidationRoutes);

// Admin routes - signup is public, other routes are protected
// Register public admin routes first (signup, login)
app.use('/api/v1/admin', adminRoutes);

// Then register protected admin routes with JWT middleware
app.use('/api/v1/admin', adminJWTMiddleware, adminAuthRoutes);

// Upload routes (admin only — JWT enforced inside uploadRoutes)
app.use('/api/v1/admin/upload', uploadRoutes);

// Analytics routes REMOVED - handled by analytics-service microservice
// app.use('/api/v1/analytics', analyticsRoutes);

// Instant call routes with JWT protection

// Additional routes with JWT protection
// Legacy instant-calls routes removed - using unified users table only
// Legacy enhanced-instant-calls routes removed - using unified users table only
app.use('/api/v1/meeting', jwtAuthMiddleware, meetingAccessRoutes);
// Notification routes REMOVED - handled by notification-service microservice
// app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/mailchimp', mailchimpRoutes);
app.use('/api/v1/messages', jwtAuthMiddleware, messageRoutes);
// app.use('/api/v1/upload', uploadRoutes);

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Public config endpoint (no authentication required)
// Returns only public settings that frontend needs
app.get('/api/v1/config', async (req, res) => {
  try {
    const settings = await configService.getAllSettings(true); // Only public settings
    res.json({
      success: true,
      config: settings
    });
  } catch (error) {
    console.error('Error fetching public config:', error);
    // Return defaults on error to not break frontend
    res.json({
      success: true,
      config: configService.DEFAULT_SETTINGS
    });
  }
});

// WebRTC ICE config endpoint (authenticated — any role)
// Returns STUN-first (free P2P) + self-hosted coturn TURN as fallback

app.get('/api/v1/webrtc/config', jwtAuthMiddleware, async (req, res) => {
  const secret = process.env.COTURN_SECRET;
  const turnHost = process.env.TURN_HOST || '62.72.3.138';
  const turnPort = process.env.TURN_PORT || '3478';

  // STUN servers FIRST — browsers try direct P2P before relay
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  if (secret) {
    // TURN REST API: credential = HMAC-SHA1(secret, "expiry:userId")
    const ttl = 24 * 3600; // 24h credential lifetime
    const expiry = Math.floor(Date.now() / 1000) + ttl;
    const username = `${expiry}:${req.user.id}`;
    const credential = crypto
      .createHmac('sha1', secret)
      .update(username)
      .digest('base64');

    iceServers.push({
      urls: [
        `turn:${turnHost}:${turnPort}?transport=udp`,
        `turn:${turnHost}:${turnPort}?transport=tcp`
      ],
      username,
      credential
    });
  }

  res.json({ iceServers });
});

// Test route to verify mounting
app.get('/api/v1/test', (req, res) => {
  res.json({ message: 'Test route working' });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found.'
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Initialize Socket.IO
initializeSocket(server);

// Start the Docker-compatible notification scheduler
try {
    initializeScheduler();
    console.log('🚀 Initializing Docker-compatible scheduler service...');
    console.log('✅ Scheduler initialized successfully');
} catch (error) {
    console.error('❌ Failed to start scheduler service:', error);
}

// Initialize Enhanced Security Tables (Phase 5) - Temporarily disabled
// initializeSecurityTables().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  stopScheduler(); // Stop the cron scheduler
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  stopScheduler(); // Stop the cron scheduler
  server.close(() => {
    console.log('Process terminated');
  });
});

export default app;