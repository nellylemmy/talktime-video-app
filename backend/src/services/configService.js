/**
 * Configuration Service
 * Manages application settings with database storage and Redis caching
 * Settings are admin-configurable and cached for performance
 */

import pool from '../config/database.js';
import { redisClient } from '../config/cache.js';

const CACHE_PREFIX = 'config:';
const CACHE_TTL = 300; // 5 minutes cache TTL
const ALL_SETTINGS_CACHE_KEY = 'config:all';
const PUBLIC_SETTINGS_CACHE_KEY = 'config:public';

// Default values (fallback if database is unavailable)
const DEFAULT_SETTINGS = {
    // Meeting settings
    'meeting.duration_minutes': 40,
    'meeting.min_duration_minutes': 5,
    'meeting.auto_timeout_minutes': 40,
    'meeting.max_future_months': 3,
    'meeting.calls_per_student_per_day': 1,
    'meeting.meetings_per_volunteer_student_pair': 3,

    // Instant call settings
    'instant_call.response_timeout_seconds': 180,
    'instant_call.cleanup_interval_minutes': 3,

    // Call timer settings
    'call_timer.warning_1_minutes': 5,
    'call_timer.warning_2_minutes': 1,

    // Volunteer performance settings
    'volunteer.cancellation_rate_threshold': 40,
    'volunteer.missed_rate_threshold': 30,
    'volunteer.min_reputation_score': 30,

    // Notification settings
    'notification.reminder_intervals_minutes': [30, 10, 5],
    'notification.auto_launch_minutes': 5,
    'notification.sound_enabled': true
};

/**
 * Parse value from database based on data type
 */
function parseValue(value, dataType) {
    switch (dataType) {
        case 'number':
            return Number(value);
        case 'boolean':
            return value === 'true' || value === true;
        case 'json':
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        default:
            return value;
    }
}

/**
 * Convert value to string for database storage
 */
function stringifyValue(value, dataType) {
    if (dataType === 'json' || typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

/**
 * Check if Redis client is connected
 */
async function isRedisConnected() {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
        return redisClient.isOpen;
    } catch {
        return false;
    }
}

/**
 * Get a single setting by key
 * @param {string} key - The setting key
 * @returns {Promise<any>} The setting value
 */
export async function getSetting(key) {
    try {
        // Try cache first
        if (await isRedisConnected()) {
            const cached = await redisClient.get(`${CACHE_PREFIX}${key}`);
            if (cached !== null) {
                return JSON.parse(cached);
            }
        }

        // Fetch from database
        const result = await pool.query(
            'SELECT value, data_type FROM app_settings WHERE key = $1',
            [key]
        );

        if (result.rows.length === 0) {
            // Return default if exists
            if (DEFAULT_SETTINGS.hasOwnProperty(key)) {
                return DEFAULT_SETTINGS[key];
            }
            return null;
        }

        const { value, data_type } = result.rows[0];
        const parsedValue = parseValue(value, data_type);

        // Cache the result
        if (await isRedisConnected()) {
            await redisClient.setEx(
                `${CACHE_PREFIX}${key}`,
                CACHE_TTL,
                JSON.stringify(parsedValue)
            );
        }

        return parsedValue;
    } catch (error) {
        console.error(`[ConfigService] Error getting setting ${key}:`, error.message);
        // Return default on error
        if (DEFAULT_SETTINGS.hasOwnProperty(key)) {
            return DEFAULT_SETTINGS[key];
        }
        return null;
    }
}

/**
 * Get all settings
 * @param {boolean} publicOnly - If true, only return public settings
 * @returns {Promise<Object>} All settings as key-value pairs
 */
export async function getAllSettings(publicOnly = false) {
    try {
        const cacheKey = publicOnly ? PUBLIC_SETTINGS_CACHE_KEY : ALL_SETTINGS_CACHE_KEY;

        // Try cache first
        if (await isRedisConnected()) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        }

        // Fetch from database
        let query = 'SELECT key, value, data_type FROM app_settings';
        if (publicOnly) {
            query += ' WHERE is_public = true';
        }

        const result = await pool.query(query);

        const settings = {};
        for (const row of result.rows) {
            settings[row.key] = parseValue(row.value, row.data_type);
        }

        // Add defaults for missing settings
        for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
            if (!settings.hasOwnProperty(key)) {
                settings[key] = value;
            }
        }

        // Cache the result
        if (await isRedisConnected()) {
            await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(settings));
        }

        return settings;
    } catch (error) {
        console.error('[ConfigService] Error getting all settings:', error.message);
        return { ...DEFAULT_SETTINGS };
    }
}

/**
 * Get settings by category
 * @param {string} category - The category to filter by
 * @returns {Promise<Object>} Settings in the category
 */
export async function getSettingsByCategory(category) {
    try {
        const cacheKey = `${CACHE_PREFIX}category:${category}`;

        // Try cache first
        if (await isRedisConnected()) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        }

        // Fetch from database
        const result = await pool.query(
            'SELECT key, value, data_type, description, is_public FROM app_settings WHERE category = $1',
            [category]
        );

        const settings = result.rows.map(row => ({
            key: row.key,
            value: parseValue(row.value, row.data_type),
            dataType: row.data_type,
            description: row.description,
            isPublic: row.is_public
        }));

        // Cache the result
        if (await isRedisConnected()) {
            await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(settings));
        }

        return settings;
    } catch (error) {
        console.error(`[ConfigService] Error getting settings for category ${category}:`, error.message);
        return [];
    }
}

/**
 * Update a setting (admin only)
 * @param {string} key - The setting key
 * @param {any} value - The new value
 * @returns {Promise<Object>} The updated setting
 */
export async function updateSetting(key, value) {
    try {
        // Get existing setting to determine data type
        const existing = await pool.query(
            'SELECT data_type FROM app_settings WHERE key = $1',
            [key]
        );

        if (existing.rows.length === 0) {
            throw new Error(`Setting ${key} not found`);
        }

        const dataType = existing.rows[0].data_type;
        const stringValue = stringifyValue(value, dataType);

        // Update in database
        const result = await pool.query(
            `UPDATE app_settings
             SET value = $1, updated_at = NOW()
             WHERE key = $2
             RETURNING key, value, data_type, description, is_public, updated_at`,
            [stringValue, key]
        );

        const updated = result.rows[0];

        // Invalidate cache
        await invalidateCache(key);

        console.log(`[ConfigService] Setting ${key} updated to ${stringValue}`);

        return {
            key: updated.key,
            value: parseValue(updated.value, updated.data_type),
            dataType: updated.data_type,
            description: updated.description,
            isPublic: updated.is_public,
            updatedAt: updated.updated_at
        };
    } catch (error) {
        console.error(`[ConfigService] Error updating setting ${key}:`, error.message);
        throw error;
    }
}

/**
 * Update multiple settings at once (admin only)
 * @param {Object} settings - Key-value pairs to update
 * @returns {Promise<Object>} Updated settings
 */
export async function updateSettings(settings) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const updated = {};

        for (const [key, value] of Object.entries(settings)) {
            // Get data type
            const existing = await client.query(
                'SELECT data_type FROM app_settings WHERE key = $1',
                [key]
            );

            if (existing.rows.length === 0) {
                console.warn(`[ConfigService] Skipping unknown setting: ${key}`);
                continue;
            }

            const dataType = existing.rows[0].data_type;
            const stringValue = stringifyValue(value, dataType);

            await client.query(
                'UPDATE app_settings SET value = $1, updated_at = NOW() WHERE key = $2',
                [stringValue, key]
            );

            updated[key] = parseValue(stringValue, dataType);
        }

        await client.query('COMMIT');

        // Invalidate all cache
        await invalidateAllCache();

        console.log(`[ConfigService] Bulk updated ${Object.keys(updated).length} settings`);

        return updated;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[ConfigService] Error in bulk update:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Invalidate cache for a specific key
 */
async function invalidateCache(key) {
    try {
        if (await isRedisConnected()) {
            await redisClient.del(`${CACHE_PREFIX}${key}`);
            await redisClient.del(ALL_SETTINGS_CACHE_KEY);
            await redisClient.del(PUBLIC_SETTINGS_CACHE_KEY);

            // Also invalidate category caches
            const result = await pool.query(
                'SELECT category FROM app_settings WHERE key = $1',
                [key]
            );
            if (result.rows.length > 0) {
                await redisClient.del(`${CACHE_PREFIX}category:${result.rows[0].category}`);
            }
        }
    } catch (error) {
        console.error('[ConfigService] Error invalidating cache:', error.message);
    }
}

/**
 * Invalidate all config cache
 */
export async function invalidateAllCache() {
    try {
        if (await isRedisConnected()) {
            const keys = await redisClient.keys(`${CACHE_PREFIX}*`);
            if (keys.length > 0) {
                await redisClient.del(keys);
            }
        }
    } catch (error) {
        console.error('[ConfigService] Error invalidating all cache:', error.message);
    }
}

/**
 * Get meeting duration in minutes
 * Convenience method for commonly used setting
 */
export async function getMeetingDuration() {
    return await getSetting('meeting.duration_minutes');
}

/**
 * Get meeting duration in milliseconds
 * Convenience method for timers
 */
export async function getMeetingDurationMs() {
    const minutes = await getMeetingDuration();
    return minutes * 60 * 1000;
}

/**
 * Get auto-timeout duration in minutes
 */
export async function getAutoTimeoutMinutes() {
    return await getSetting('meeting.auto_timeout_minutes');
}

/**
 * Get meeting limit per volunteer-student pair
 */
export async function getMeetingLimitPerPair() {
    return await getSetting('meeting.meetings_per_volunteer_student_pair');
}

/**
 * Get calls per student per day limit
 */
export async function getCallsPerStudentPerDay() {
    return await getSetting('meeting.calls_per_student_per_day');
}

/**
 * Get instant call response timeout in seconds
 */
export async function getInstantCallTimeout() {
    return await getSetting('instant_call.response_timeout_seconds');
}

/**
 * Get call timer warning intervals
 */
export async function getCallTimerWarnings() {
    const warning1 = await getSetting('call_timer.warning_1_minutes');
    const warning2 = await getSetting('call_timer.warning_2_minutes');
    return { warning1, warning2 };
}

/**
 * Get volunteer performance thresholds
 */
export async function getVolunteerThresholds() {
    const cancellationRate = await getSetting('volunteer.cancellation_rate_threshold');
    const missedRate = await getSetting('volunteer.missed_rate_threshold');
    const minScore = await getSetting('volunteer.min_reputation_score');
    return { cancellationRate, missedRate, minScore };
}

/**
 * Get notification reminder intervals
 */
export async function getReminderIntervals() {
    return await getSetting('notification.reminder_intervals_minutes');
}

// Export default object for convenience
export default {
    getSetting,
    getAllSettings,
    getSettingsByCategory,
    updateSetting,
    updateSettings,
    invalidateAllCache,
    getMeetingDuration,
    getMeetingDurationMs,
    getAutoTimeoutMinutes,
    getMeetingLimitPerPair,
    getCallsPerStudentPerDay,
    getInstantCallTimeout,
    getCallTimerWarnings,
    getVolunteerThresholds,
    getReminderIntervals,
    DEFAULT_SETTINGS
};
