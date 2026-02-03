import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

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
 */
router.post('/:id/read', async (req, res) => {
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
});

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
