/**
 * Application Configuration Helper for Meeting Service
 * Fetches settings from app_settings table with in-memory caching
 */

import pool from './database.js';

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute cache

// Default values (fallback if database is unavailable)
const DEFAULT_CONFIG = {
    'meeting.duration_minutes': 40,
    'meeting.min_duration_minutes': 5,
    'meeting.auto_timeout_minutes': 40,
    'meeting.max_future_months': 3,
    'meeting.calls_per_student_per_day': 1,
    'meeting.meetings_per_volunteer_student_pair': 3,
    'instant_call.response_timeout_seconds': 180,
    'instant_call.cleanup_interval_minutes': 3,
    'call_timer.warning_1_minutes': 5,
    'call_timer.warning_2_minutes': 1,
    'volunteer.cancellation_rate_threshold': 40,
    'volunteer.missed_rate_threshold': 30,
    'volunteer.min_reputation_score': 30
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
 * Get a config value by key
 * @param {string} key - The config key
 * @returns {Promise<any>} The config value
 */
export async function getConfig(key) {
    // Check cache first
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.value;
    }

    try {
        const result = await pool.query(
            'SELECT value, data_type FROM app_settings WHERE key = $1',
            [key]
        );

        if (result.rows.length === 0) {
            return DEFAULT_CONFIG[key] ?? null;
        }

        const { value, data_type } = result.rows[0];
        const parsedValue = parseValue(value, data_type);

        // Cache the result
        cache.set(key, { value: parsedValue, timestamp: Date.now() });

        return parsedValue;
    } catch (error) {
        console.error(`[Meeting Service] Config error for ${key}:`, error.message);
        return DEFAULT_CONFIG[key] ?? null;
    }
}

/**
 * Get multiple config values at once
 * @param {string[]} keys - Array of config keys
 * @returns {Promise<Object>} Object with config values
 */
export async function getConfigs(keys) {
    const result = {};
    for (const key of keys) {
        result[key] = await getConfig(key);
    }
    return result;
}

/**
 * Clear the config cache
 */
export function clearCache() {
    cache.clear();
}

// Convenience functions for commonly used configs

export async function getMeetingDuration() {
    return getConfig('meeting.duration_minutes');
}

export async function getAutoTimeoutMinutes() {
    return getConfig('meeting.auto_timeout_minutes');
}

export async function getMeetingLimitPerPair() {
    return getConfig('meeting.meetings_per_volunteer_student_pair');
}

export async function getMaxFutureMonths() {
    return getConfig('meeting.max_future_months');
}

export async function getVolunteerThresholds() {
    return {
        cancellationRate: await getConfig('volunteer.cancellation_rate_threshold'),
        missedRate: await getConfig('volunteer.missed_rate_threshold'),
        minScore: await getConfig('volunteer.min_reputation_score')
    };
}

export default {
    getConfig,
    getConfigs,
    clearCache,
    getMeetingDuration,
    getAutoTimeoutMinutes,
    getMeetingLimitPerPair,
    getMaxFutureMonths,
    getVolunteerThresholds,
    DEFAULT_CONFIG
};
