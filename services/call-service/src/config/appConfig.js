/**
 * Application Configuration Helper for Call Service
 * Fetches settings from app_settings table with in-memory caching
 */

import pool from './database.js';

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute cache

// Default values (fallback if database is unavailable)
const DEFAULT_CONFIG = {
    'meeting.duration_minutes': 40,
    'call_timer.warning_1_minutes': 5,
    'call_timer.warning_2_minutes': 1
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
        console.error(`[Call Service] Config error for ${key}:`, error.message);
        return DEFAULT_CONFIG[key] ?? null;
    }
}

/**
 * Clear the config cache
 */
export function clearCache() {
    cache.clear();
}

// Convenience functions

export async function getMeetingDurationMs() {
    const minutes = await getConfig('meeting.duration_minutes');
    return minutes * 60 * 1000;
}

export async function getWarning1Ms() {
    const durationMinutes = await getConfig('meeting.duration_minutes');
    const warningMinutes = await getConfig('call_timer.warning_1_minutes');
    // Warning 1 is X minutes before end
    return (durationMinutes - warningMinutes) * 60 * 1000;
}

export async function getWarning2Ms() {
    const durationMinutes = await getConfig('meeting.duration_minutes');
    const warningMinutes = await getConfig('call_timer.warning_2_minutes');
    // Warning 2 is X minutes before end
    return (durationMinutes - warningMinutes) * 60 * 1000;
}

export async function getTimerConfig() {
    const [durationMinutes, warning1Minutes, warning2Minutes] = await Promise.all([
        getConfig('meeting.duration_minutes'),
        getConfig('call_timer.warning_1_minutes'),
        getConfig('call_timer.warning_2_minutes')
    ]);

    return {
        durationMs: durationMinutes * 60 * 1000,
        durationMinutes,
        warning1Ms: (durationMinutes - warning1Minutes) * 60 * 1000,
        warning1Minutes,
        warning2Ms: (durationMinutes - warning2Minutes) * 60 * 1000,
        warning2Minutes
    };
}

export default {
    getConfig,
    clearCache,
    getMeetingDurationMs,
    getWarning1Ms,
    getWarning2Ms,
    getTimerConfig,
    DEFAULT_CONFIG
};
