/**
 * Timezone Utility Functions for Notification Service
 * Global timezone support for accurate notification delivery
 */

import pool from '../config/database.js';

/**
 * Get a user's timezone from the database
 * @param {number} userId - The user ID
 * @returns {Promise<string>} The user's IANA timezone identifier (defaults to 'UTC')
 */
export const getUserTimezone = async (userId) => {
    try {
        const result = await pool.query(
            'SELECT timezone FROM users WHERE id = $1',
            [userId]
        );
        return result.rows[0]?.timezone || 'UTC';
    } catch (error) {
        console.error('[Notification Service] Error fetching user timezone:', error);
        return 'UTC';
    }
};

/**
 * Validate an IANA timezone identifier
 * @param {string} timezone - The timezone string to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidTimezone = (timezone) => {
    if (!timezone || typeof timezone !== 'string') return false;
    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        return true;
    } catch (e) {
        return false;
    }
};

/**
 * Get a safe timezone - validates and returns UTC if invalid
 * @param {string} timezone - The timezone to validate
 * @returns {string} A valid IANA timezone identifier
 */
export const getSafeTimezone = (timezone) => {
    return isValidTimezone(timezone) ? timezone : 'UTC';
};

/**
 * Format a date/time in a specific timezone for display
 * @param {Date|string} date - The date to format
 * @param {string} timezone - The IANA timezone identifier
 * @param {Object} options - Optional Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatInTimezone = (date, timezone, options = {}) => {
    const tz = getSafeTimezone(timezone);
    const inputDate = new Date(date);

    const defaultOptions = {
        timeZone: tz,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };

    return inputDate.toLocaleString('en-US', { ...defaultOptions, ...options });
};

/**
 * Calculate day boundaries (start and end of day) in a specific timezone
 * @param {Date|string} date - The date to calculate boundaries for
 * @param {string} timezone - The IANA timezone identifier
 * @returns {Object} { startOfDay: Date, endOfDay: Date } in UTC
 */
export const getDayBoundariesInTimezone = (date, timezone) => {
    const tz = getSafeTimezone(timezone);
    const inputDate = new Date(date);

    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    const dateString = formatter.format(inputDate);

    const testDate = new Date(inputDate);
    const utcHours = testDate.getUTCHours();
    const localHours = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        hour12: false
    }).format(testDate));

    let offsetHours = localHours - utcHours;
    if (offsetHours > 12) offsetHours -= 24;
    if (offsetHours < -12) offsetHours += 24;

    const startOfDayUTC = new Date(`${dateString}T00:00:00Z`);
    startOfDayUTC.setUTCHours(startOfDayUTC.getUTCHours() - offsetHours);

    const endOfDayUTC = new Date(`${dateString}T23:59:59.999Z`);
    endOfDayUTC.setUTCHours(endOfDayUTC.getUTCHours() - offsetHours);

    return {
        startOfDay: startOfDayUTC,
        endOfDay: endOfDayUTC,
        timezone: tz,
        localDateString: dateString
    };
};

export default {
    getUserTimezone,
    isValidTimezone,
    getSafeTimezone,
    formatInTimezone,
    getDayBoundariesInTimezone
};
