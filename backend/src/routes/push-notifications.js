import express from 'express';
import webpush from 'web-push';
import pool from '../config/database.js';

const router = express.Router();

// Generate or use existing VAPID keys
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:support@talktime.app';

// Generate VAPID keys if not provided
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('🔑 Generating new VAPID keys...');
    const vapidKeys = webpush.generateVAPIDKeys();
    VAPID_PUBLIC_KEY = vapidKeys.publicKey;
    VAPID_PRIVATE_KEY = vapidKeys.privateKey;
    console.log('📋 Generated VAPID Public Key:', VAPID_PUBLIC_KEY);
    console.log('🔒 Generated VAPID Private Key:', VAPID_PRIVATE_KEY);
    console.log('💡 Add these to your environment variables for persistence');
} else {
    console.log('🔑 Using existing VAPID keys from environment');
}

// Configure web-push with VAPID keys
webpush.setVapidDetails(
    VAPID_EMAIL,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

console.log('✅ Web-push configured with VAPID details');

// GET /vapid-public-key - Public endpoint for VAPID key
router.get('/vapid-public-key', (req, res) => {
    try {
        res.json({
            publicKey: VAPID_PUBLIC_KEY
        });
    } catch (error) {
        console.error('Error getting VAPID public key:', error);
        res.status(500).json({
            error: 'Failed to get VAPID public key',
            message: error.message
        });
    }
});

// POST /subscribe - Subscribe to push notifications
router.post('/subscribe', async (req, res) => {
    try {
        const { subscription, userId } = req.body;
        
        if (!subscription || !userId) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'subscription and userId are required'
            });
        }

        // Store subscription in database
        const query = `
            INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            ON CONFLICT (user_id, endpoint) 
            DO UPDATE SET 
                p256dh_key = EXCLUDED.p256dh_key,
                auth_key = EXCLUDED.auth_key,
                updated_at = NOW(),
                is_active = 1
            RETURNING id
        `;

        const values = [
            userId,
            subscription.endpoint,
            subscription.keys.p256dh,
            subscription.keys.auth
        ];

        const result = await pool.query(query, values);
        
        res.json({
            success: true,
            subscriptionId: result.rows[0].id,
            message: 'Successfully subscribed to push notifications'
        });

    } catch (error) {
        console.error('Error subscribing to push notifications:', error);
        res.status(500).json({
            error: 'Failed to subscribe to push notifications',
            message: error.message
        });
    }
});

// POST /unsubscribe - Unsubscribe from push notifications
router.post('/unsubscribe', async (req, res) => {
    try {
        const { endpoint, userId } = req.body;
        
        if (!endpoint || !userId) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'endpoint and userId are required'
            });
        }

        const query = `
            UPDATE push_subscriptions 
            SET is_active = 0, updated_at = NOW()
            WHERE user_id = $1 AND endpoint = $2
            RETURNING id
        `;

        const result = await pool.query(query, [userId, endpoint]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Subscription not found',
                message: 'No active subscription found for this user and endpoint'
            });
        }

        res.json({
            success: true,
            message: 'Successfully unsubscribed from push notifications'
        });

    } catch (error) {
        console.error('Error unsubscribing from push notifications:', error);
        res.status(500).json({
            error: 'Failed to unsubscribe from push notifications',
            message: error.message
        });
    }
});

// POST /send - Send push notification
router.post('/send', async (req, res) => {
    try {
        const { userId, title, body, data = {} } = req.body;
        
        if (!userId || !title || !body) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'userId, title, and body are required'
            });
        }

        // Get user's active subscriptions
        const subscriptionsQuery = `
            SELECT id, endpoint, p256dh_key, auth_key
            FROM push_subscriptions
            WHERE user_id = $1 AND is_active = 1
        `;

        const subscriptionsResult = await pool.query(subscriptionsQuery, [userId]);
        
        if (subscriptionsResult.rows.length === 0) {
            return res.status(404).json({
                error: 'No active subscriptions',
                message: 'User has no active push notification subscriptions'
            });
        }

        const payload = JSON.stringify({
            title,
            body,
            data
        });

        const sendPromises = subscriptionsResult.rows.map(async (subscription) => {
            try {
                const pushSubscription = {
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subscription.p256dh_key,
                        auth: subscription.auth_key
                    }
                };

                await webpush.sendNotification(pushSubscription, payload);
                console.log('📤 Push notification sent to:', subscription.endpoint);

                // Log successful notification
                await pool.query(`
                    INSERT INTO push_notification_logs 
                    (subscription_id, title, body, data, status, sent_at)
                    VALUES ($1, $2, $3, $4, 'sent', NOW())
                `, [subscription.id, title, body, JSON.stringify(data)]);

                return { success: true, subscriptionId: subscription.id };

            } catch (error) {
                console.error('Error sending to subscription:', subscription.id, error);

                // Log failed notification
                await pool.query(`
                    INSERT INTO push_notification_logs 
                    (subscription_id, title, body, data, status, error_message, sent_at)
                    VALUES ($1, $2, $3, $4, 'failed', $5, NOW())
                `, [subscription.id, title, body, JSON.stringify(data), error.message]);

                // If subscription is no longer valid, deactivate it
                if (error.statusCode === 410) {
                    await pool.query(`
                        UPDATE push_subscriptions 
                        SET is_active = 0, updated_at = NOW()
                        WHERE id = $1
                    `, [subscription.id]);
                }

                return { success: false, subscriptionId: subscription.id, error: error.message };
            }
        });

        const results = await Promise.all(sendPromises);
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        res.json({
            success: true,
            message: `Notification sent to ${successCount} subscription(s)`,
            details: {
                total: results.length,
                successful: successCount,
                failed: failureCount,
                results
            }
        });

    } catch (error) {
        console.error('Error sending push notification:', error);
        res.status(500).json({
            error: 'Failed to send push notification',
            message: error.message
        });
    }
});

// GET /subscriptions/:userId - Get user's subscriptions
router.get('/subscriptions/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const query = `
            SELECT id, endpoint, created_at, updated_at, is_active
            FROM push_subscriptions
            WHERE user_id = $1
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query, [userId]);

        res.json({
            success: true,
            subscriptions: result.rows
        });

    } catch (error) {
        console.error('Error getting user subscriptions:', error);
        res.status(500).json({
            error: 'Failed to get user subscriptions',
            message: error.message
        });
    }
});

// GET /logs/:userId - Get notification logs for user
router.get('/logs/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        const query = `
            SELECT pnl.*, ps.user_id
            FROM push_notification_logs pnl
            JOIN push_subscriptions ps ON pnl.subscription_id = ps.id
            WHERE ps.user_id = $1
            ORDER BY pnl.sent_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await pool.query(query, [userId, limit, offset]);

        res.json({
            success: true,
            logs: result.rows,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: result.rows.length
            }
        });

    } catch (error) {
        console.error('Error getting notification logs:', error);
        res.status(500).json({
            error: 'Failed to get notification logs',
            message: error.message
        });
    }
});

export default router;
