import {
    subscribeToList,
    unsubscribeFromList,
    getSubscriberStatus
} from '../services/mailchimpService.js';
import pool from '../config/database.js';

/**
 * Subscribe to newsletter
 */
export const subscribe = async (req, res) => {
    try {
        const { email, role = 'visitor', source = 'website' } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        const result = await subscribeToList(email, role, source);

        res.json({
            success: true,
            message: result.status === 'already_subscribed'
                ? 'You are already subscribed to our newsletter'
                : 'Successfully subscribed to newsletter',
            ...result
        });
    } catch (error) {
        console.error('[Newsletter Service] Subscribe error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to subscribe to newsletter'
        });
    }
};

/**
 * Unsubscribe from newsletter
 */
export const unsubscribe = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        const result = await unsubscribeFromList(email);

        res.json({
            success: true,
            message: 'Successfully unsubscribed from newsletter',
            ...result
        });
    } catch (error) {
        console.error('[Newsletter Service] Unsubscribe error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to unsubscribe'
        });
    }
};

/**
 * Check subscription status
 */
export const checkStatus = async (req, res) => {
    try {
        const { email } = req.params;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        const result = await getSubscriberStatus(email);

        res.json(result || {
            success: true,
            email,
            subscribed: false,
            status: 'not_found'
        });
    } catch (error) {
        console.error('[Newsletter Service] Check status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check subscription status'
        });
    }
};

/**
 * Get all subscribers (admin only)
 */
export const getAllSubscribers = async (req, res) => {
    try {
        const { limit = 100, offset = 0, is_active } = req.query;

        let query = `
            SELECT email, role, source, is_active, is_verified, created_at, updated_at
            FROM newsletter_subscriptions
        `;
        const params = [];

        if (is_active !== undefined) {
            query += ` WHERE is_active = $1`;
            params.push(is_active === 'true');
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM newsletter_subscriptions';
        if (is_active !== undefined) {
            countQuery += ' WHERE is_active = $1';
        }
        const countResult = await pool.query(countQuery, is_active !== undefined ? [is_active === 'true'] : []);

        res.json({
            success: true,
            subscribers: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('[Newsletter Service] Get subscribers error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get subscribers'
        });
    }
};

/**
 * Get subscription stats (admin only)
 */
export const getStats = async (req, res) => {
    try {
        // Get counts by active status
        const activeResult = await pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_active = true) as active,
                COUNT(*) FILTER (WHERE is_active = false) as inactive,
                COUNT(*) FILTER (WHERE is_verified = true) as verified
            FROM newsletter_subscriptions
        `);

        const stats = activeResult.rows[0];

        // Get recent subscriptions (last 30 days)
        const recentResult = await pool.query(`
            SELECT COUNT(*) as count
            FROM newsletter_subscriptions
            WHERE created_at > NOW() - INTERVAL '30 days'
            AND is_active = true
        `);

        // Get by role
        const roleResult = await pool.query(`
            SELECT role, COUNT(*) as count
            FROM newsletter_subscriptions
            WHERE is_active = true
            GROUP BY role
        `);

        const byRole = {};
        roleResult.rows.forEach(row => {
            byRole[row.role] = parseInt(row.count);
        });

        res.json({
            success: true,
            stats: {
                total: parseInt(stats.total) || 0,
                active: parseInt(stats.active) || 0,
                inactive: parseInt(stats.inactive) || 0,
                verified: parseInt(stats.verified) || 0,
                recentSubscriptions: parseInt(recentResult.rows[0].count) || 0,
                byRole
            }
        });
    } catch (error) {
        console.error('[Newsletter Service] Get stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get stats'
        });
    }
};

export default {
    subscribe,
    unsubscribe,
    checkStatus,
    getAllSubscribers,
    getStats
};
