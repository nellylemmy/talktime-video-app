/**
 * Notification API Controller
 * Handles all notification-related API endpoints
 */
import User from '../../../models/User.js';
import Meeting from '../../../models/Meeting.js';
import Notification from '../../../models/Notification.js';
import * as notificationService from '../../../services/notificationService.js';

/**
 * Get user notifications
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} List of notifications
 */
export const getUserNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get user's notifications from the database
        const notifications = await Notification.findByUserId(userId);
        
        // Process any scheduled notifications that are due
        await notificationService.processScheduledNotifications();
        
        res.json({
            notifications
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
};

/**
 * Mark notification as read
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Success message
 */
export const markNotificationAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Update the notification in the database
        const success = await Notification.markAsRead(id);
        
        if (!success) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        
        res.json({
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
};

/**
 * Send notification
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Success message
 */
export const sendNotification = async (req, res) => {
    try {
        const { userId, type, title, message, priority = 'medium', channels = ['in-app'] } = req.body;
        
        // Validate required fields
        if (!userId || !type || !title || !message) {
            return res.status(400).json({ error: 'User ID, type, title, and message are required' });
        }
        
        // Check if user exists
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Create and send the notification through specified channels
        const notification = await notificationService.sendNotification({
            userId,
            type,
            title,
            message,
            priority
        }, channels);
        
        res.status(201).json({
            message: 'Notification sent successfully',
            notification
        });
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({ error: 'Failed to send notification' });
    }
};
