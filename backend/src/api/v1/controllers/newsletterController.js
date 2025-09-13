import pool from '../../../config/database.js';
import crypto from 'crypto';

/**
 * Newsletter Subscription Controller
 * Handles newsletter subscriptions, unsubscriptions, and analytics
 */

class NewsletterController {
    // Subscribe to newsletter
    async subscribe(req, res) {
        try {
            // Basic validation
            const { email, role = 'visitor' } = req.body;
            
            if (!email || typeof email !== 'string') {
                return res.status(400).json({
                    success: false,
                    message: 'Valid email address is required'
                });
            }
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid email address is required'
                });
            }
            
            if (!['visitor', 'volunteer', 'student', 'admin'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid role specified'
                });
            }

            const { 
                interests = [], 
                source = 'widget', 
                placement = 'floating', 
                page,
                metadata = {}
            } = req.body;

            const clientIp = req.ip || req.connection.remoteAddress;
            const userAgent = req.get('User-Agent');

            // Generate verification token
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const unsubscribeToken = crypto.randomBytes(32).toString('hex');

            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Check if email already exists
                const existingResult = await client.query(
                    'SELECT id, is_active, unsubscribed_at FROM newsletter_subscriptions WHERE email = $1',
                    [email]
                );

                let subscriptionId;

                if (existingResult.rows.length > 0) {
                    const existing = existingResult.rows[0];
                    
                    if (existing.is_active && !existing.unsubscribed_at) {
                        return res.status(200).json({
                            success: true,
                            message: 'You are already subscribed to our newsletter!',
                            already_subscribed: true
                        });
                    }

                    // Reactivate subscription
                    const updateResult = await client.query(`
                        UPDATE newsletter_subscriptions 
                        SET is_active = true, 
                            unsubscribed_at = NULL,
                            interests = $1,
                            role = $2,
                            source = $3,
                            placement = $4,
                            page = $5,
                            ip_address = $6,
                            user_agent = $7,
                            verification_token = $8,
                            unsubscribe_token = $9,
                            verification_sent_at = CURRENT_TIMESTAMP,
                            subscriber_metadata = $10,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE email = $11
                        RETURNING id`,
                        [
                            JSON.stringify(interests),
                            role,
                            source,
                            placement,
                            page,
                            clientIp,
                            userAgent,
                            verificationToken,
                            unsubscribeToken,
                            JSON.stringify(metadata),
                            email
                        ]
                    );
                    
                    subscriptionId = updateResult.rows[0].id;
                } else {
                    // Create new subscription
                    const insertResult = await client.query(`
                        INSERT INTO newsletter_subscriptions (
                            email, interests, role, source, placement, page, 
                            ip_address, user_agent, verification_token, unsubscribe_token,
                            verification_sent_at, subscriber_metadata
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, $11)
                        RETURNING id`,
                        [
                            email,
                            JSON.stringify(interests),
                            role,
                            source,
                            placement,
                            page,
                            clientIp,
                            userAgent,
                            verificationToken,
                            unsubscribeToken,
                            JSON.stringify(metadata)
                        ]
                    );
                    
                    subscriptionId = insertResult.rows[0].id;
                }

                // Log analytics event
                await client.query(`
                    INSERT INTO newsletter_analytics (
                        subscription_id, event_type, event_data, ip_address, user_agent
                    ) VALUES ($1, $2, $3, $4, $5)`,
                    [
                        subscriptionId,
                        'subscribed',
                        JSON.stringify({ 
                            role, 
                            interests, 
                            source, 
                            placement, 
                            page,
                            resubscribe: existingResult.rows.length > 0
                        }),
                        clientIp,
                        userAgent
                    ]
                );

                await client.query('COMMIT');

                // TODO: Send welcome/verification email (implement with your email service)
                // await this.sendWelcomeEmail(email, verificationToken, role);

                res.status(201).json({
                    success: true,
                    message: 'Successfully subscribed to TalkTime newsletter!',
                    subscription_id: subscriptionId,
                    verification_required: true
                });

            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }

        } catch (error) {
            console.error('Newsletter subscription error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to subscribe. Please try again later.'
            });
        }
    }

    // Verify email subscription
    async verify(req, res) {
        try {
            const { token } = req.params;

            const result = await pool.query(`
                UPDATE newsletter_subscriptions 
                SET is_verified = true, verified_at = CURRENT_TIMESTAMP
                WHERE verification_token = $1 AND is_active = true
                RETURNING id, email, role`,
                [token]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Invalid or expired verification token'
                });
            }

            const subscription = result.rows[0];

            // Log verification event
            await pool.query(`
                INSERT INTO newsletter_analytics (
                    subscription_id, event_type, ip_address, user_agent
                ) VALUES ($1, $2, $3, $4)`,
                [
                    subscription.id,
                    'verified',
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.json({
                success: true,
                message: 'Email verified successfully! Welcome to TalkTime newsletter.',
                verified: true
            });

        } catch (error) {
            console.error('Email verification error:', error);
            res.status(500).json({
                success: false,
                message: 'Verification failed. Please try again.'
            });
        }
    }

    // Unsubscribe from newsletter
    async unsubscribe(req, res) {
        try {
            const { token } = req.params;

            const result = await pool.query(`
                UPDATE newsletter_subscriptions 
                SET is_active = false, unsubscribed_at = CURRENT_TIMESTAMP
                WHERE unsubscribe_token = $1 AND is_active = true
                RETURNING id, email`,
                [token]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Invalid unsubscribe token or already unsubscribed'
                });
            }

            const subscription = result.rows[0];

            // Log unsubscribe event
            await pool.query(`
                INSERT INTO newsletter_analytics (
                    subscription_id, event_type, ip_address, user_agent
                ) VALUES ($1, $2, $3, $4)`,
                [
                    subscription.id,
                    'unsubscribed',
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.json({
                success: true,
                message: 'Successfully unsubscribed from TalkTime newsletter.',
                unsubscribed: true
            });

        } catch (error) {
            console.error('Unsubscribe error:', error);
            res.status(500).json({
                success: false,
                message: 'Unsubscribe failed. Please try again.'
            });
        }
    }

    // Update subscription preferences
    async updatePreferences(req, res) {
        try {
            const { token } = req.params;
            const { interests, metadata } = req.body;

            const result = await pool.query(`
                UPDATE newsletter_subscriptions 
                SET interests = $1, 
                    subscriber_metadata = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE unsubscribe_token = $3 AND is_active = true
                RETURNING id, email, interests`,
                [
                    JSON.stringify(interests),
                    JSON.stringify(metadata),
                    token
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Invalid token or subscription not found'
                });
            }

            res.json({
                success: true,
                message: 'Preferences updated successfully!',
                preferences: result.rows[0]
            });

        } catch (error) {
            console.error('Update preferences error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update preferences.'
            });
        }
    }

    // Get subscription statistics (admin only)
    async getStatistics(req, res) {
        try {
            // This should be protected by admin middleware
            const stats = await pool.query(`
                SELECT 
                    COUNT(*) as total_subscribers,
                    COUNT(*) FILTER (WHERE is_active = true) as active_subscribers,
                    COUNT(*) FILTER (WHERE is_verified = true) as verified_subscribers,
                    COUNT(*) FILTER (WHERE role = 'volunteer') as volunteer_subscribers,
                    COUNT(*) FILTER (WHERE role = 'student') as student_subscribers,
                    COUNT(*) FILTER (WHERE role = 'visitor') as visitor_subscribers,
                    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as subscribers_last_30_days,
                    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as subscribers_last_7_days
                FROM newsletter_subscriptions
            `);

            const sourceStats = await pool.query(`
                SELECT source, COUNT(*) as count
                FROM newsletter_subscriptions
                WHERE is_active = true
                GROUP BY source
                ORDER BY count DESC
            `);

            const interestStats = await pool.query(`
                SELECT 
                    jsonb_array_elements_text(interests) as interest,
                    COUNT(*) as count
                FROM newsletter_subscriptions
                WHERE is_active = true AND interests IS NOT NULL
                GROUP BY interest
                ORDER BY count DESC
                LIMIT 10
            `);

            res.json({
                success: true,
                statistics: {
                    overview: stats.rows[0],
                    sources: sourceStats.rows,
                    top_interests: interestStats.rows
                }
            });

        } catch (error) {
            console.error('Get statistics error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve statistics.'
            });
        }
    }

    // Get subscribers list (admin only)
    async getSubscribers(req, res) {
        try {
            const { 
                page = 1, 
                limit = 50, 
                role, 
                status = 'active', 
                search 
            } = req.query;

            const offset = (page - 1) * limit;
            let whereClause = 'WHERE 1=1';
            const queryParams = [];
            let paramCount = 0;

            if (status === 'active') {
                whereClause += ' AND is_active = true';
            } else if (status === 'inactive') {
                whereClause += ' AND is_active = false';
            }

            if (role) {
                whereClause += ` AND role = $${++paramCount}`;
                queryParams.push(role);
            }

            if (search) {
                whereClause += ` AND email ILIKE $${++paramCount}`;
                queryParams.push(`%${search}%`);
            }

            const subscribers = await pool.query(`
                SELECT 
                    id, email, role, interests, source, placement, 
                    is_active, is_verified, created_at, verified_at,
                    unsubscribed_at
                FROM newsletter_subscriptions
                ${whereClause}
                ORDER BY created_at DESC
                LIMIT $${++paramCount} OFFSET $${++paramCount}`,
                [...queryParams, limit, offset]
            );

            const total = await pool.query(`
                SELECT COUNT(*) as count
                FROM newsletter_subscriptions
                ${whereClause}`,
                queryParams
            );

            res.json({
                success: true,
                subscribers: subscribers.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(total.rows[0].count),
                    pages: Math.ceil(total.rows[0].count / limit)
                }
            });

        } catch (error) {
            console.error('Get subscribers error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve subscribers.'
            });
        }
    }

    // Track analytics events (email opens, clicks, etc.)
    async trackEvent(req, res) {
        try {
            const { 
                subscription_id, 
                campaign_id, 
                event_type, 
                event_data = {} 
            } = req.body;

            await pool.query(`
                INSERT INTO newsletter_analytics (
                    subscription_id, campaign_id, event_type, event_data, 
                    ip_address, user_agent
                ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    subscription_id,
                    campaign_id,
                    event_type,
                    JSON.stringify(event_data),
                    req.ip,
                    req.get('User-Agent')
                ]
            );

            res.json({
                success: true,
                message: 'Event tracked successfully'
            });

        } catch (error) {
            console.error('Track event error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to track event.'
            });
        }
    }
}

export default new NewsletterController();
