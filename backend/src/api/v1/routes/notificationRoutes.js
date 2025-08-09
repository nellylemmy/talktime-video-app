/**
 * Notification API Routes
 * RESTful API endpoints for notification functionality
 */
import express from 'express';
const router = express.Router();
import { isAuthenticated, isAdmin } from '../../../middleware/auth.js';
import * as notificationController from '../controllers/notificationController.js';

/**
 * @route   GET /api/v1/notifications
 * @desc    Get user notifications
 * @access  Private
 */
router.get('/', isAuthenticated, notificationController.getUserNotifications);

/**
 * @route   PUT /api/v1/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put('/:id/read', isAuthenticated, notificationController.markNotificationAsRead);

/**
 * @route   POST /api/v1/notifications
 * @desc    Send notification
 * @access  Private (Admin only)
 */
router.post('/', isAuthenticated, isAdmin, notificationController.sendNotification);

export default router;
