/**
 * Notification Model
 * Represents a notification in the system
 */
import db from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

class Notification {
    /**
     * Create a new notification
     * @param {Object} notification - Notification data
     * @returns {Object} Created notification
     */
    static async create(notification) {
        const id = notification.id || uuidv4();
        const createdAt = notification.createdAt || new Date().toISOString();
        
        const newNotification = {
            id,
            userId: notification.userId,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            meetingId: notification.meetingId || null,
            createdAt,
            isRead: false,
            priority: notification.priority || 'medium',
            channel: notification.channel || 'in-app',
            scheduledFor: notification.scheduledFor || null
        };
        
        try {
            await db.query(
                `INSERT INTO notifications 
                (id, user_id, type, title, message, meeting_id, created_at, is_read, priority, channel, scheduled_for) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    newNotification.id,
                    newNotification.userId,
                    newNotification.type,
                    newNotification.title,
                    newNotification.message,
                    newNotification.meetingId,
                    newNotification.createdAt,
                    newNotification.isRead,
                    newNotification.priority,
                    newNotification.channel,
                    newNotification.scheduledFor
                ]
            );
            
            return newNotification;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    }
    
    /**
     * Find notifications by user ID
     * @param {string} userId - User ID
     * @returns {Array} List of notifications
     */
    static async findByUserId(userId) {
        try {
            const result = await db.query(
                `SELECT * FROM notifications 
                WHERE user_id = $1 OR recipient_id = $1 
                ORDER BY created_at DESC`,
                [userId]
            );
            
            return result.rows.map(this.mapNotificationFromDb);
        } catch (error) {
            console.error('Error finding notifications by user ID:', error);
            throw error;
        }
    }
    
    /**
     * Find unread notifications by user ID
     * @param {string} userId - User ID
     * @returns {Array} List of unread notifications
     */
    static async findUnreadByUserId(userId) {
        try {
            const result = await db.query(
                `SELECT * FROM notifications 
                WHERE user_id = $1 AND is_read = false 
                ORDER BY created_at DESC`,
                [userId]
            );
            
            return result.rows.map(this.mapNotificationFromDb);
        } catch (error) {
            console.error('Error finding unread notifications by user ID:', error);
            throw error;
        }
    }
    
    /**
     * Mark notification as read
     * @param {string} id - Notification ID
     * @returns {boolean} Success status
     */
    static async markAsRead(id) {
        try {
            const result = await db.query(
                `UPDATE notifications 
                SET is_read = true 
                WHERE id = $1 
                RETURNING *`,
                [id]
            );
            
            return result.rowCount > 0;
        } catch (error) {
            console.error('Error marking notification as read:', error);
            throw error;
        }
    }
    
    /**
     * Find notifications by meeting ID
     * @param {string} meetingId - Meeting ID
     * @returns {Array} List of notifications
     */
    static async findByMeetingId(meetingId) {
        try {
            const result = await db.query(
                `SELECT * FROM notifications 
                WHERE meeting_id = $1 
                ORDER BY created_at DESC`,
                [meetingId]
            );
            
            return result.rows.map(this.mapNotificationFromDb);
        } catch (error) {
            console.error('Error finding notifications by meeting ID:', error);
            throw error;
        }
    }
    
    /**
     * Delete notifications by meeting ID
     * @param {string} meetingId - Meeting ID
     * @returns {boolean} Success status
     */
    static async deleteByMeetingId(meetingId) {
        try {
            const result = await db.query(
                `DELETE FROM notifications 
                WHERE meeting_id = $1`,
                [meetingId]
            );
            
            return result.rowCount > 0;
        } catch (error) {
            console.error('Error deleting notifications by meeting ID:', error);
            throw error;
        }
    }
    
    /**
     * Map notification from database format to API format
     * @param {Object} dbNotification - Notification from database
     * @returns {Object} Formatted notification
     */
    static mapNotificationFromDb(dbNotification) {
        return {
            id: dbNotification.id,
            userId: dbNotification.user_id,
            type: dbNotification.type,
            title: dbNotification.title,
            message: dbNotification.message,
            meetingId: dbNotification.meeting_id,
            createdAt: dbNotification.created_at,
            isRead: dbNotification.is_read,
            priority: dbNotification.priority,
            channel: dbNotification.channel,
            scheduledFor: dbNotification.scheduled_for
        };
    }
}

export default Notification;
