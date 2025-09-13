// Enhanced notification tracking and analytics endpoint
// This endpoint handles tracking for all notification interactions

import express from 'express';
import pool from '../../../config/database.js';
import { isAuthenticated } from '../../../middleware/auth.js';

const router = express.Router();

// Track notification events (clicks, dismissals, actions)
router.post('/track', async (req, res) => {
    try {
        const {
            notification_id,
            action,
            timestamp,
            source = 'web',
            additional_data = {}
        } = req.body;

        if (!notification_id || !action) {
            return res.status(400).json({ 
                error: 'Missing required fields: notification_id and action' 
            });
        }

        // Valid actions for tracking
        const validActions = [
            'clicked', 'dismissed', 'viewed', 'join_meeting', 'accept_call', 
            'decline_call', 'view_dashboard', 'add_calendar', 'schedule_new',
            'rate_meeting', 'schedule_next', 'remind_later', 'acknowledged'
        ];

        if (!validActions.includes(action)) {
            return res.status(400).json({ 
                error: `Invalid action. Must be one of: ${validActions.join(', ')}` 
            });
        }

        const trackingTimestamp = timestamp ? new Date(timestamp) : new Date();

        // Update notification with tracking information
        let updateQuery;
        let updateValues;

        if (action === 'clicked') {
            updateQuery = `
                UPDATE notifications 
                SET 
                    clicked_at = $2,
                    engagement_score = engagement_score + 10,
                    interaction_count = interaction_count + 1
                WHERE id = $1
                RETURNING *
            `;
            updateValues = [notification_id, trackingTimestamp];
        } else if (action === 'dismissed') {
            updateQuery = `
                UPDATE notifications 
                SET 
                    dismissed_at = $2,
                    engagement_score = engagement_score + 2,
                    interaction_count = interaction_count + 1
                WHERE id = $1
                RETURNING *
            `;
            updateValues = [notification_id, trackingTimestamp];
        } else {
            // For other actions, just increment engagement and interaction count
            updateQuery = `
                UPDATE notifications 
                SET 
                    engagement_score = engagement_score + 5,
                    interaction_count = interaction_count + 1,
                    last_interaction_at = $2
                WHERE id = $1
                RETURNING *
            `;
            updateValues = [notification_id, trackingTimestamp];
        }

        const notificationResult = await pool.query(updateQuery, updateValues);

        if (notificationResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Notification not found' 
            });
        }

        // Insert tracking record into analytics table
        const analyticsQuery = `
            INSERT INTO notification_analytics (
                notification_id, action, timestamp, source, additional_data
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;

        const analyticsResult = await pool.query(analyticsQuery, [
            notification_id,
            action,
            trackingTimestamp,
            source,
            JSON.stringify(additional_data)
        ]);

        // Calculate engagement rate for this notification type
        const engagementQuery = `
            SELECT 
                type,
                COUNT(*) as total_sent,
                COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as clicked_count,
                COUNT(CASE WHEN dismissed_at IS NOT NULL THEN 1 END) as dismissed_count,
                AVG(engagement_score) as avg_engagement
            FROM notifications 
            WHERE type = (SELECT type FROM notifications WHERE id = $1)
            GROUP BY type
        `;

        const engagementResult = await pool.query(engagementQuery, [notification_id]);

        res.json({
            success: true,
            message: 'Notification event tracked successfully',
            notification: notificationResult.rows[0],
            analytics: analyticsResult.rows[0],
            engagement_stats: engagementResult.rows[0] || null
        });

    } catch (error) {
        console.error('Error tracking notification event:', error);
        res.status(500).json({ 
            error: 'Failed to track notification event',
            details: error.message 
        });
    }
});

// Get notification analytics for a user
router.get('/analytics/:userId', isAuthenticated, async (req, res) => {
    try {
        const { userId } = req.params;
        const { 
            start_date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            end_date = new Date().toISOString(),
            type = null 
        } = req.query;

        let analyticsQuery = `
            SELECT 
                n.type,
                COUNT(*) as total_notifications,
                COUNT(CASE WHEN n.clicked_at IS NOT NULL THEN 1 END) as clicked_count,
                COUNT(CASE WHEN n.dismissed_at IS NOT NULL THEN 1 END) as dismissed_count,
                COUNT(CASE WHEN n.viewed_at IS NOT NULL THEN 1 END) as viewed_count,
                AVG(n.engagement_score) as avg_engagement_score,
                AVG(n.interaction_count) as avg_interactions,
                COUNT(CASE WHEN n.delivery_status = 'delivered' THEN 1 END) as delivered_count,
                COUNT(CASE WHEN n.delivery_status = 'failed' THEN 1 END) as failed_count
            FROM notifications n
            WHERE n.user_id = $1 
            AND n.created_at BETWEEN $2 AND $3
        `;

        let queryParams = [userId, start_date, end_date];

        if (type) {
            analyticsQuery += ` AND n.type = $4`;
            queryParams.push(type);
        }

        analyticsQuery += ` GROUP BY n.type ORDER BY total_notifications DESC`;

        const analyticsResult = await pool.query(analyticsQuery, queryParams);

        // Get most recent notifications for this user
        const recentQuery = `
            SELECT 
                id, type, title, message, created_at, clicked_at, dismissed_at,
                engagement_score, interaction_count, delivery_status
            FROM notifications 
            WHERE user_id = $1 
            AND created_at BETWEEN $2 AND $3
            ORDER BY created_at DESC 
            LIMIT 20
        `;

        const recentResult = await pool.query(recentQuery, [userId, start_date, end_date]);

        // Get action analytics
        const actionQuery = `
            SELECT 
                na.action,
                COUNT(*) as action_count,
                DATE_TRUNC('day', na.timestamp) as action_date
            FROM notification_analytics na
            JOIN notifications n ON na.notification_id = n.id
            WHERE n.user_id = $1 
            AND na.timestamp BETWEEN $2 AND $3
            GROUP BY na.action, DATE_TRUNC('day', na.timestamp)
            ORDER BY action_date DESC, action_count DESC
        `;

        const actionResult = await pool.query(actionQuery, [userId, start_date, end_date]);

        res.json({
            success: true,
            analytics: {
                summary: analyticsResult.rows,
                recent_notifications: recentResult.rows,
                action_analytics: actionResult.rows,
                date_range: { start_date, end_date }
            }
        });

    } catch (error) {
        console.error('Error getting notification analytics:', error);
        res.status(500).json({ 
            error: 'Failed to get notification analytics',
            details: error.message 
        });
    }
});

// Get system-wide notification statistics (admin only)
router.get('/stats/system', isAuthenticated, async (req, res) => {
    try {
        // Check if user is admin (you'll need to implement your admin check)
        // For now, we'll return stats for all users

        const { 
            start_date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            end_date = new Date().toISOString() 
        } = req.query;

        // Overall notification stats
        const overallQuery = `
            SELECT 
                COUNT(*) as total_notifications,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as total_clicks,
                COUNT(CASE WHEN dismissed_at IS NOT NULL THEN 1 END) as total_dismissals,
                AVG(engagement_score) as avg_engagement,
                COUNT(CASE WHEN delivery_status = 'delivered' THEN 1 END) as successful_deliveries,
                COUNT(CASE WHEN delivery_status = 'failed' THEN 1 END) as failed_deliveries
            FROM notifications 
            WHERE created_at BETWEEN $1 AND $2
        `;

        const overallResult = await pool.query(overallQuery, [start_date, end_date]);

        // Stats by notification type
        const typeQuery = `
            SELECT 
                type,
                COUNT(*) as count,
                COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as clicks,
                COUNT(CASE WHEN dismissed_at IS NOT NULL THEN 1 END) as dismissals,
                AVG(engagement_score) as avg_engagement,
                ROUND((COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END)::decimal / COUNT(*) * 100), 2) as click_rate
            FROM notifications 
            WHERE created_at BETWEEN $1 AND $2
            GROUP BY type 
            ORDER BY count DESC
        `;

        const typeResult = await pool.query(typeQuery, [start_date, end_date]);

        // Daily breakdown
        const dailyQuery = `
            SELECT 
                DATE_TRUNC('day', created_at) as date,
                COUNT(*) as notifications_sent,
                COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as clicks,
                COUNT(CASE WHEN dismissed_at IS NOT NULL THEN 1 END) as dismissals
            FROM notifications 
            WHERE created_at BETWEEN $1 AND $2
            GROUP BY DATE_TRUNC('day', created_at)
            ORDER BY date DESC
        `;

        const dailyResult = await pool.query(dailyQuery, [start_date, end_date]);

        // Top performing notifications
        const topQuery = `
            SELECT 
                id, type, title, engagement_score, interaction_count,
                created_at, clicked_at IS NOT NULL as was_clicked
            FROM notifications 
            WHERE created_at BETWEEN $1 AND $2
            ORDER BY engagement_score DESC, interaction_count DESC
            LIMIT 10
        `;

        const topResult = await pool.query(topQuery, [start_date, end_date]);

        res.json({
            success: true,
            stats: {
                overall: overallResult.rows[0],
                by_type: typeResult.rows,
                daily_breakdown: dailyResult.rows,
                top_performing: topResult.rows,
                date_range: { start_date, end_date }
            }
        });

    } catch (error) {
        console.error('Error getting system notification stats:', error);
        res.status(500).json({ 
            error: 'Failed to get system notification stats',
            details: error.message 
        });
    }
});

// Get pending notifications for background sync
router.get('/pending', async (req, res) => {
    try {
        const { user_id, limit = 10 } = req.query;

        let query = `
            SELECT 
                id, type, title, message, icon_url, badge_url, action_url,
                require_interaction, created_at, channels_sent
            FROM notifications 
            WHERE delivery_status = 'pending' 
            AND (auto_delete_after IS NULL OR created_at + auto_delete_after > NOW())
        `;

        let queryParams = [];

        if (user_id) {
            query += ` AND user_id = $1`;
            queryParams.push(user_id);
            query += ` ORDER BY created_at DESC LIMIT $2`;
            queryParams.push(limit);
        } else {
            query += ` ORDER BY created_at DESC LIMIT $1`;
            queryParams.push(limit);
        }

        const result = await pool.query(query, queryParams);

        // Mark as sent via push
        if (result.rows.length > 0) {
            const notificationIds = result.rows.map(row => row.id);
            await pool.query(`
                UPDATE notifications 
                SET 
                    delivery_status = 'delivered',
                    channels_sent = CASE 
                        WHEN channels_sent::jsonb ? 'push' THEN channels_sent
                        ELSE jsonb_set(COALESCE(channels_sent, '{}')::jsonb, '{push}', 'true')
                    END
                WHERE id = ANY($1)
            `, [notificationIds]);
        }

        res.json({
            success: true,
            notifications: result.rows.map(row => ({
                ...row,
                actions: getActionsForType(row.type),
                tag: `talktime-${row.type}-${row.id}`
            }))
        });

    } catch (error) {
        console.error('Error getting pending notifications:', error);
        res.status(500).json({ 
            error: 'Failed to get pending notifications',
            details: error.message 
        });
    }
});

// Helper function to get actions for notification types
function getActionsForType(type) {
    const actionMap = {
        'meeting_scheduled': [
            { action: 'view_details', title: '👀 View Details' },
            { action: 'add_calendar', title: '📅 Add to Calendar' },
            { action: 'dismiss', title: '✕ Dismiss' }
        ],
        'meeting_reminder': [
            { action: 'join', title: '🎯 Join Now' },
            { action: 'remind_later', title: '⏰ Remind Later' },
            { action: 'dismiss', title: '✕ Dismiss' }
        ],
        'meeting_canceled': [
            { action: 'schedule_new', title: '📅 Schedule New' },
            { action: 'view_dashboard', title: '📊 View Dashboard' },
            { action: 'dismiss', title: '✕ Dismiss' }
        ],
        'instant_call': [
            { action: 'accept', title: '✅ Accept' },
            { action: 'decline', title: '❌ Decline' }
        ],
        'meeting_completed': [
            { action: 'rate_meeting', title: '⭐ Rate Meeting' },
            { action: 'schedule_next', title: '📅 Schedule Next' },
            { action: 'dismiss', title: '✕ Dismiss' }
        ]
    };

    return actionMap[type] || [
        { action: 'view_dashboard', title: '👀 View' },
        { action: 'dismiss', title: '✕ Dismiss' }
    ];
}

export default router;
