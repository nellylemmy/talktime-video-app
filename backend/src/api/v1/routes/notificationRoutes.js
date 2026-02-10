/**
 * Notification API Routes
 * RESTful API endpoints for notification functionality
 */
import express from 'express';
const router = express.Router();
import { isAuthenticated, isAdmin } from '../../../middleware/auth.js';
import * as notificationController from '../controllers/notificationController.js';

// Import tracking routes
import trackingRouter from './notificationTracking.js';

/**
 * @route   GET /api/v1/notifications
 * @desc    Get user notifications
 * @access  Private
 */
router.get('/', isAuthenticated, notificationController.getUserNotifications);

/**
 * @route   GET /api/v1/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get('/unread-count', isAuthenticated, notificationController.getUnreadCount);

/**
 * @route   PUT /api/v1/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put('/read-all', isAuthenticated, notificationController.markAllNotificationsAsRead);

/**
 * @route   PUT /api/v1/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put('/:id/read', isAuthenticated, notificationController.markNotificationAsRead);

/**
 * @route   DELETE /api/v1/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 */
router.delete('/:id', isAuthenticated, notificationController.deleteNotification);

/**
 * @route   POST /api/v1/notifications
 * @desc    Send notification
 * @access  Private (Admin only)
 */
router.post('/', isAuthenticated, isAdmin, notificationController.sendNotification);

// Mount tracking routes
router.use('/', trackingRouter);

export default router;
