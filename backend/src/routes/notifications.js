import express from 'express';
import { Pool } from 'pg';
import { createJWTMiddleware } from '../utils/jwt.js';
import { getIO } from '../socket.js';

const router = express.Router();
const volunteerJWTMiddleware = createJWTMiddleware(['volunteer']);
const studentJWTMiddleware = createJWTMiddleware(['student']);
const adminJWTMiddleware = createJWTMiddleware(['admin']);
const allRolesJWTMiddleware = createJWTMiddleware(['admin', 'volunteer', 'student']);

// Database connection
const pool = new Pool({
    user: process.env.DB_USER || 'user',
    host: process.env.DB_HOST || 'db',
    database: process.env.DB_DATABASE || 'talktimedb_dev',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

/**
 * GET /api/v1/notifications
 * Get user's notifications with pagination and filtering
 */
router.get('/', allRolesJWTMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const {
            page = 1,
            limit = 20,
            status = 'all', // all, read, unread
            priority = 'all', // all, high, medium, low
            type = 'all' // all, meeting, system, reminder
        } = req.query;

        const offset = (page - 1) * limit;

        // Build WHERE clause based on filters
        let whereConditions = [
            '(recipient_id = $1 OR user_id = $1)',
            '(scheduled_for IS NULL OR scheduled_for <= NOW() OR is_sent = true)'  // Only show immediate or sent notifications
        ];
        let queryParams = [userId];
        let paramCount = 1;

        if (status !== 'all') {
            paramCount++;
            whereConditions.push(`is_read = $${paramCount}`);
            queryParams.push(status === 'read');
        }

        if (priority !== 'all') {
            paramCount++;
            whereConditions.push(`priority = $${paramCount}`);
            queryParams.push(priority);
        }

        if (type !== 'all') {
            paramCount++;
            whereConditions.push(`type = $${paramCount}`);
            queryParams.push(type);
        }

        const whereClause = whereConditions.join(' AND ');

        // Get notifications with pagination
        const notificationsQuery = `
            SELECT 
                id,
                title,
                message,
                type,
                priority,
                is_read,
                metadata,
                created_at,
                scheduled_for
            FROM notifications 
            WHERE ${whereClause}
            ORDER BY 
                CASE WHEN is_read = false THEN 0 ELSE 1 END,
                priority DESC,
                created_at DESC
            LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
        `;

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM notifications 
            WHERE ${whereClause}
        `;

        const [notificationsResult, countResult] = await Promise.all([
            pool.query(notificationsQuery, [...queryParams, limit, offset]),
            pool.query(countQuery, queryParams)
        ]);

        const notifications = notificationsResult.rows;
        const totalCount = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        // Get unread count
        const unreadCountQuery = `
            SELECT COUNT(*) as unread_count 
            FROM notifications 
            WHERE (recipient_id = $1 OR user_id = $1) 
            AND is_read = false 
            AND (scheduled_for IS NULL OR scheduled_for <= NOW() OR is_sent = true)
        `;
        const unreadResult = await pool.query(unreadCountQuery, [userId]);
        const unreadCount = parseInt(unreadResult.rows[0].unread_count);

        res.json({
            notifications,
            pagination: {
                current_page: parseInt(page),
                total_pages: totalPages,
                total_count: totalCount,
                has_next_page: hasNextPage,
                has_prev_page: hasPrevPage,
                per_page: parseInt(limit)
            },
            unread_count: unreadCount
        });

    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            error: 'Failed to fetch notifications',
            details: error.message
        });
    }
});

/**
 * PUT /api/v1/notifications/:id/read
 * Mark notification as read
 */
router.put('/:id/read', allRolesJWTMiddleware, async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.user.id;
        const userRole = req.user.role;
        // Update notification status
        const result = await pool.query(
            `UPDATE notifications 
             SET is_read = true, updated_at = NOW()
             WHERE id = $1 AND (recipient_id = $2 OR user_id = $2)
             RETURNING *`,
            [notificationId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found or access denied'
            });
        }

        // Emit real-time notification update via Socket.IO
        try {
            const io = getIO();
            const notificationRoom = `notifications_${userRole}_${userId}`;
            
            io.to(notificationRoom).emit('notification-marked-read', {
                notificationId: parseInt(notificationId),
                timestamp: new Date().toISOString()
            });
            
            console.log(`Real-time notification read update sent to room: ${notificationRoom}`);
        } catch (error) {
            console.error('Error emitting notification read update:', error);
            // Don't fail the API call if Socket.IO fails
        }

        res.json({
            success: true,
            message: 'Notification marked as read',
            notification: result.rows[0]
        });

    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            error: 'Failed to mark notification as read',
            details: error.message
        });
    }
});

/**
 * PUT /api/v1/notifications/read-all
 * Mark all notifications as read for the user
 */
router.put('/read-all', allRolesJWTMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        const updateQuery = `
            UPDATE notifications 
            SET is_read = true, updated_at = NOW()
            WHERE (recipient_id = $1 OR user_id = $1) AND is_read = false
            RETURNING id
        `;

        const result = await pool.query(updateQuery, [userId]);

        // Emit real-time notification update via Socket.IO
        try {
            const io = getIO();
            const notificationRoom = `notifications_${userRole}_${userId}`;
            
            io.to(notificationRoom).emit('notifications-marked-all-read', {
                count: result.rowCount,
                timestamp: new Date().toISOString()
            });
            
            console.log(`Real-time all notifications read update sent to room: ${notificationRoom}`);
        } catch (error) {
            console.error('Error emitting all notifications read update:', error);
            // Don't fail the API call if Socket.IO fails
        }

        res.json({
            message: 'All notifications marked as read',
            updated_count: result.rowCount
        });

    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            error: 'Failed to mark all notifications as read',
            details: error.message
        });
    }
});

/**
 * DELETE /api/v1/notifications/:id
 * Delete a notification
 */
router.delete('/:id', allRolesJWTMiddleware, async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.user.id;
        const userRole = req.user.role;

        const deleteQuery = `
            DELETE FROM notifications 
            WHERE id = $1 AND (recipient_id = $2 OR user_id = $2)
            RETURNING *
        `;

        const result = await pool.query(deleteQuery, [notificationId, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Notification not found or unauthorized'
            });
        }

        res.json({
            message: 'Notification deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({
            error: 'Failed to delete notification',
            details: error.message
        });
    }
});

/**
 * GET /api/v1/notifications/unread-count
 * Get unread notification count for badge
 */
router.get('/unread-count', allRolesJWTMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        const countQuery = `
            SELECT COUNT(*) as unread_count 
            FROM notifications 
            WHERE (recipient_id = $1 OR user_id = $1) 
            AND is_read = false 
            AND (scheduled_for IS NULL OR scheduled_for <= NOW() OR is_sent = true)
        `;

        const result = await pool.query(countQuery, [userId]);
        const unreadCount = parseInt(result.rows[0].unread_count);

        res.json({
            unread_count: unreadCount
        });

    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({
            error: 'Failed to fetch unread count',
            details: error.message
        });
    }
});

/**
 * POST /api/v1/notifications
 * Create a new notification (admin only)
 */
router.post('/', adminJWTMiddleware, async (req, res) => {
    try {
        const {
            user_id,
            title,
            message,
            type = 'system',
            priority = 'medium',
            metadata = {},
            scheduled_for = null
        } = req.body;

        // Validate required fields
        if (!user_id || !title || !message) {
            return res.status(400).json({
                error: 'Missing required fields: user_id, title, message'
            });
        }

        // Validate type
        if (!['meeting_scheduled', 'meeting_rescheduled', 'meeting_canceled', 'meeting_reminder_30min', 'meeting_reminder_10min', 'meeting_reminder_5min', 'meeting_started', 'meeting_ended', 'instant_call_received', 'message_received', 'parent_approval_received', 'system_announcement'].includes(type)) {
            return res.status(400).json({
                error: 'Invalid type. Must be a valid notification type'
            });
        }

        // Validate priority
        if (!['high', 'medium', 'low'].includes(priority)) {
            return res.status(400).json({
                error: 'Invalid priority. Must be high, medium, or low'
            });
        }

        const insertQuery = `
            INSERT INTO notifications (
                user_id, 
                title, 
                message, 
                type, 
                priority, 
                metadata, 
                scheduled_for
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;

        const result = await pool.query(insertQuery, [
            user_id,
            title,
            message,
            type,
            priority,
            JSON.stringify(metadata),
            scheduled_for
        ]);

        res.status(201).json({
            message: 'Notification created successfully',
            notification: result.rows[0]
        });

    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({
            error: 'Failed to create notification',
            details: error.message
        });
    }
});

export default router;
