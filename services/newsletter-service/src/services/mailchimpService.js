import mailchimp from '@mailchimp/mailchimp_marketing';
import crypto from 'crypto-js';
import pool from '../config/database.js';

// Initialize Mailchimp client
const initializeMailchimp = () => {
    const apiKey = process.env.MAILCHIMP_API_KEY;
    const server = process.env.MAILCHIMP_SERVER_PREFIX;

    if (!apiKey || !server) {
        console.warn('[Newsletter Service] Mailchimp not configured - missing API key or server prefix');
        return false;
    }

    mailchimp.setConfig({
        apiKey,
        server
    });

    return true;
};

const isConfigured = initializeMailchimp();
const listId = process.env.MAILCHIMP_LIST_ID;

/**
 * Generate MD5 hash for subscriber email (required by Mailchimp)
 */
const getSubscriberHash = (email) => {
    return crypto.MD5(email.toLowerCase()).toString();
};

/**
 * Subscribe email to Mailchimp list
 */
export const subscribeToList = async (email, role = 'visitor', source = 'website') => {
    // Store in local database first
    await storeSubscription(email, role, source);

    if (!isConfigured || !listId) {
        console.warn('[Newsletter Service] Mailchimp not configured, storing locally only');
        return { success: true, status: 'local_only', email };
    }

    try {
        const response = await mailchimp.lists.addListMember(listId, {
            email_address: email,
            status: 'subscribed',
            tags: [role, source, 'TalkTime Newsletter']
        });

        console.log(`[Newsletter Service] Subscribed ${email} to Mailchimp`);
        return {
            success: true,
            status: response.status,
            email: response.email_address,
            id: response.id
        };
    } catch (error) {
        // Handle already subscribed
        if (error.status === 400 && error.response?.body?.title === 'Member Exists') {
            console.log(`[Newsletter Service] ${email} already subscribed`);
            return {
                success: true,
                status: 'already_subscribed',
                email
            };
        }

        console.error('[Newsletter Service] Mailchimp subscribe error:', error.message);
        // Return success since we stored locally
        return {
            success: true,
            status: 'local_only',
            email,
            warning: 'Failed to sync with Mailchimp'
        };
    }
};

/**
 * Unsubscribe email from Mailchimp list
 */
export const unsubscribeFromList = async (email) => {
    // Update local database
    await updateSubscriptionStatus(email, false);

    if (!isConfigured || !listId) {
        return { success: true, status: 'local_only', email };
    }

    try {
        const subscriberHash = getSubscriberHash(email);
        await mailchimp.lists.updateListMember(listId, subscriberHash, {
            status: 'unsubscribed'
        });

        console.log(`[Newsletter Service] Unsubscribed ${email} from Mailchimp`);
        return { success: true, status: 'unsubscribed', email };
    } catch (error) {
        console.error('[Newsletter Service] Mailchimp unsubscribe error:', error.message);
        return { success: true, status: 'local_only', email };
    }
};

/**
 * Get subscriber status from Mailchimp
 */
export const getSubscriberStatus = async (email) => {
    // Check local database first
    const localStatus = await getLocalSubscriptionStatus(email);

    if (!isConfigured || !listId) {
        return localStatus;
    }

    try {
        const subscriberHash = getSubscriberHash(email);
        const response = await mailchimp.lists.getListMember(listId, subscriberHash);

        return {
            success: true,
            email: response.email_address,
            status: response.status,
            subscribed: response.status === 'subscribed',
            source: 'mailchimp'
        };
    } catch (error) {
        if (error.status === 404) {
            return {
                success: true,
                email,
                status: 'not_found',
                subscribed: false
            };
        }

        // Fall back to local status
        return localStatus || {
            success: false,
            email,
            error: 'Failed to check subscription status'
        };
    }
};

/**
 * Ping Mailchimp to verify connection
 */
export const pingMailchimp = async () => {
    if (!isConfigured) {
        return { success: false, error: 'Mailchimp not configured' };
    }

    try {
        const response = await mailchimp.ping.get();
        return { success: true, health: response.health_status };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// Local database helpers

const storeSubscription = async (email, role, source) => {
    try {
        await pool.query(`
            INSERT INTO newsletter_subscriptions (email, role, source, is_active)
            VALUES ($1, $2, $3, true)
            ON CONFLICT (email) DO UPDATE SET
                role = COALESCE($2, newsletter_subscriptions.role),
                source = COALESCE($3, newsletter_subscriptions.source),
                is_active = true,
                updated_at = NOW()
        `, [email.toLowerCase(), role, source]);
    } catch (error) {
        console.error('[Newsletter Service] Error storing subscription:', error);
    }
};

const updateSubscriptionStatus = async (email, isActive) => {
    try {
        await pool.query(`
            UPDATE newsletter_subscriptions
            SET is_active = $1,
                unsubscribed_at = CASE WHEN $1 = false THEN NOW() ELSE NULL END,
                updated_at = NOW()
            WHERE email = $2
        `, [isActive, email.toLowerCase()]);
    } catch (error) {
        console.error('[Newsletter Service] Error updating subscription:', error);
    }
};

const getLocalSubscriptionStatus = async (email) => {
    try {
        const result = await pool.query(`
            SELECT email, role, source, is_active, is_verified, created_at
            FROM newsletter_subscriptions
            WHERE email = $1
        `, [email.toLowerCase()]);

        if (result.rows.length === 0) {
            return null;
        }

        const sub = result.rows[0];
        return {
            success: true,
            email: sub.email,
            role: sub.role,
            source: sub.source,
            status: sub.is_active ? 'subscribed' : 'unsubscribed',
            subscribed: sub.is_active,
            verified: sub.is_verified,
            subscribedAt: sub.created_at,
            source: 'local'
        };
    } catch (error) {
        console.error('[Newsletter Service] Error getting local status:', error);
        return null;
    }
};

export default {
    subscribeToList,
    unsubscribeFromList,
    getSubscriberStatus,
    pingMailchimp
};
