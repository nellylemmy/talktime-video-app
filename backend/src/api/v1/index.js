/**
 * API v1 Router
 * Main entry point for API v1 routes
 */
import express from 'express';
const router = express.Router();
import volunteerRoutes from './routes/volunteerRoutes.js';
import docsRoutes from './routes/docsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import meetingRoutes from './routes/meetingRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';

// Mount API routes
router.use('/volunteers', volunteerRoutes);
router.use('/docs', docsRoutes);
router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/meetings', meetingRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes); // Admin routes
router.use('/analytics', analyticsRoutes); // Analytics routes

// API documentation route
router.get('/', (req, res) => {
  res.json({
    message: 'Welcome to TalkTime API v1',
    documentation: '/api/v1/docs',
    endpoints: {
      volunteers: '/api/v1/volunteers',
      students: '/api/v1/students',
      meetings: '/api/v1/meetings',
      auth: '/api/v1/auth',
      admin: '/api/v1/admin',
      analytics: '/api/v1/analytics'
    }
  });
});

export default router;
