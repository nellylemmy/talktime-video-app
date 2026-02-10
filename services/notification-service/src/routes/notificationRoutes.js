import express from 'express';
import pool from '../config/database.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

/**
 * Extract user ID from JWT token in Authorization header
 */
const getUserIdFromToken = (req) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.decode(token); // Just decode, verification happens at gateway/auth service
        return decoded?.id || decoded?.userId || decoded?.user_id || null;
    } catch (error) {
        console.error('[Notification Service] Error decoding token:', error);
        return null;
    }
};

/**
 * Get notifications for authenticated user (extracts user ID from JWT)
 * Supports query params: page, limit, status, priority, type, unread_only
 * This route must be defined BEFORE /:userId routes to take precedence
 */
router.get('/', async (req, res) => {
    try {
        const userId = getUserIdFromToken(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized - no valid token' });
        }

        const {
            page = 1,
            limit = 20,
            status = 'all',
            priority = 'all',
            type = 'all',
            unread_only = false
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = `
            SELECT * FROM notifications
            WHERE (recipient_id = $1 OR user_id = $1)
            AND is_sent = true
        `;
        const params = [userId];
        let paramIndex = 2;

        // Filter by read status
        if (unread_only === 'true' || status === 'unread') {
            query += ` AND is_read = false`;
        } else if (status === 'read') {
            query += ` AND is_read = true`;
        }

        // Filter by priority if not 'all'
        if (priority && priority !== 'all') {
            query += ` AND priority = $${paramIndex}`;
            params.push(priority);
            paramIndex++;
        }

        // Filter by type if not 'all'
        if (type && type !== 'all') {
            query += ` AND type = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }

        // Get total count for pagination
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
        const countResult = await pool.query(countQuery, params);
        const totalCount = parseInt(countResult.rows[0].count);

        // Add ordering and pagination
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), offset);

        const result = await pool.query(query, params);

        // Get unread count
        const unreadResult = await pool.query(`
            SELECT COUNT(*) FROM notifications
            WHERE (recipient_id = $1 OR user_id = $1)
            AND is_sent = true AND is_read = false
        `, [userId]);

        res.json({
            success: true,
            notifications: result.rows,
            unreadCount: parseInt(unreadResult.rows[0].count),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('[Notification Service] Error fetching notifications:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }
});

/**
 * Get unread count for authenticated user (extracts user ID from JWT)
 * This route must be defined BEFORE /:userId routes to take precedence
 */
router.get('/unread-count', async (req, res) => {
    try {
        const userId = getUserIdFromToken(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized - no valid token' });
        }

        const result = await pool.query(`
            SELECT COUNT(*) FROM notifications
            WHERE (recipient_id = $1 OR user_id = $1)
            AND is_sent = true AND is_read = false
        `, [userId]);

        res.json({
            success: true,
            unread_count: parseInt(result.rows[0].count),
            count: parseInt(result.rows[0].count) // backward compatibility
        });
    } catch (error) {
        console.error('[Notification Service] Error getting unread count:', error);
        res.status(500).json({ success: false, error: 'Failed to get count' });
    }
});

/**
 * Mark all notifications as read for authenticated user (extracts user ID from JWT)
 * This route must be defined BEFORE /:userId routes to take precedence
 */
router.put('/read-all', async (req, res) => {
    try {
        const userId = getUserIdFromToken(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized - no valid token' });
        }

        const result = await pool.query(`
            UPDATE notifications
            SET is_read = true
            WHERE (recipient_id = $1 OR user_id = $1) AND is_read = false
        `, [userId]);

        res.json({
            success: true,
            message: 'All notifications marked as read',
            updated_count: result.rowCount
        });
    } catch (error) {
        console.error('[Notification Service] Error marking all as read:', error);
        res.status(500).json({ success: false, error: 'Failed to mark all as read' });
    }
});

/**
 * Delete a notification for authenticated user
 * This route must be defined BEFORE /:userId routes to take precedence
 */
router.delete('/:id', async (req, res) => {
    try {
        const userId = getUserIdFromToken(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized - no valid token' });
        }

        const { id } = req.params;

        // Delete only if the notification belongs to this user
        const result = await pool.query(`
            DELETE FROM notifications
            WHERE id = $1 AND (recipient_id = $2 OR user_id = $2)
        `, [id, userId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Notification not found or access denied' });
        }

        res.json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        console.error('[Notification Service] Error deleting notification:', error);
        res.status(500).json({ success: false, error: 'Failed to delete notification' });
    }
});

/**
 * Get notifications for a user
 */
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50, offset = 0, unread_only = false } = req.query;

        let query = `
            SELECT * FROM notifications
            WHERE (recipient_id = $1 OR user_id = $1)
            AND is_sent = true
        `;
        const params = [userId];

        if (unread_only === 'true') {
            query += ` AND is_read = false`;
        }

        query += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Get unread count
        const countResult = await pool.query(`
            SELECT COUNT(*) FROM notifications
            WHERE (recipient_id = $1 OR user_id = $1)
            AND is_sent = true AND is_read = false
        `, [userId]);

        res.json({
            success: true,
            notifications: result.rows,
            unreadCount: parseInt(countResult.rows[0].count)
        });
    } catch (error) {
        console.error('[Notification Service] Error fetching notifications:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }
});

/**
 * Mark notification as read
 * Accepts both POST and PUT for compatibility
 */
const markNotificationAsRead = async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query(`
            UPDATE notifications
            SET is_read = true
            WHERE id = $1
        `, [id]);

        res.json({ success: true });
    } catch (error) {
        console.error('[Notification Service] Error marking notification as read:', error);
        res.status(500).json({ success: false, error: 'Failed to mark as read' });
    }
};

router.post('/:id/read', markNotificationAsRead);
router.put('/:id/read', markNotificationAsRead);

/**
 * Mark all notifications as read for a user
 */
router.post('/:userId/read-all', async (req, res) => {
    try {
        const { userId } = req.params;

        await pool.query(`
            UPDATE notifications
            SET is_read = true
            WHERE (recipient_id = $1 OR user_id = $1) AND is_read = false
        `, [userId]);

        res.json({ success: true });
    } catch (error) {
        console.error('[Notification Service] Error marking all as read:', error);
        res.status(500).json({ success: false, error: 'Failed to mark all as read' });
    }
});

/**
 * Get unread count
 */
router.get('/:userId/unread-count', async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await pool.query(`
            SELECT COUNT(*) FROM notifications
            WHERE (recipient_id = $1 OR user_id = $1)
            AND is_sent = true AND is_read = false
        `, [userId]);

        res.json({
            success: true,
            count: parseInt(result.rows[0].count)
        });
    } catch (error) {
        console.error('[Notification Service] Error getting unread count:', error);
        res.status(500).json({ success: false, error: 'Failed to get count' });
    }
});

export default router;
