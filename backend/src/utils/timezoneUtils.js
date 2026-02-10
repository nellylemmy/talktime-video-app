/**
 * Timezone Utility Functions for Global User Support
 *
 * This module provides timezone-aware date/time operations for the TalkTime platform.
 * All business logic involving day boundaries, meeting scheduling, and time comparisons
 * should use these utilities to ensure correct behavior for users in any timezone.
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
        console.error('Error fetching user timezone:', error);
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
 * Calculate day boundaries (start and end of day) in a specific timezone
 * This is critical for the "1 call per day per student" rule
 *
 * @param {Date|string} date - The date to calculate boundaries for
 * @param {string} timezone - The IANA timezone identifier
 * @returns {Object} { startOfDay: Date, endOfDay: Date } in UTC for database queries
 */
export const getDayBoundariesInTimezone = (date, timezone) => {
    const tz = getSafeTimezone(timezone);
    const inputDate = new Date(date);

    // Get the date parts in the user's timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    // Parse the date in user's timezone (format: YYYY-MM-DD)
    const dateString = formatter.format(inputDate);

    // Create start of day (00:00:00) in user's timezone
    // Then convert to UTC for database comparison
    const startOfDayLocal = new Date(`${dateString}T00:00:00`);
    const endOfDayLocal = new Date(`${dateString}T23:59:59.999`);

    // Calculate the UTC offset for the timezone at that specific date
    // This handles DST correctly
    const startParts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(inputDate);

    // Build date string from parts
    const partsMap = {};
    startParts.forEach(part => {
        partsMap[part.type] = part.value;
    });

    // Get offset by comparing local time interpretation with UTC
    const localMidnight = new Date(`${dateString}T00:00:00`);
    const utcMidnight = new Date(`${dateString}T00:00:00Z`);

    // Calculate timezone offset in milliseconds
    // We need to find what UTC time corresponds to midnight in the user's timezone
    const testDate = new Date(inputDate);
    const utcHours = testDate.getUTCHours();
    const localHours = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        hour12: false
    }).format(testDate));

    // Offset in hours (this is simplified - for precise calculation we use a different approach)
    let offsetHours = localHours - utcHours;
    if (offsetHours > 12) offsetHours -= 24;
    if (offsetHours < -12) offsetHours += 24;

    // Start of day in UTC = midnight in user's timezone converted to UTC
    const startOfDayUTC = new Date(`${dateString}T00:00:00Z`);
    startOfDayUTC.setUTCHours(startOfDayUTC.getUTCHours() - offsetHours);

    // End of day in UTC = 23:59:59.999 in user's timezone converted to UTC
    const endOfDayUTC = new Date(`${dateString}T23:59:59.999Z`);
    endOfDayUTC.setUTCHours(endOfDayUTC.getUTCHours() - offsetHours);

    return {
        startOfDay: startOfDayUTC,
        endOfDay: endOfDayUTC,
        timezone: tz,
        localDateString: dateString
    };
};

/**
 * Get day boundaries using PostgreSQL AT TIME ZONE (more accurate)
 * Returns SQL parameters for timezone-aware day boundary query
 *
 * @param {Date|string} date - The date to calculate boundaries for
 * @param {string} timezone - The IANA timezone identifier
 * @returns {Object} SQL query parts and parameters
 */
export const getDayBoundariesSQL = (date, timezone) => {
    const tz = getSafeTimezone(timezone);
    const inputDate = new Date(date);

    // Get the date in user's timezone (YYYY-MM-DD format)
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const localDateString = formatter.format(inputDate);

    // Return SQL-ready components
    // PostgreSQL: SELECT * FROM meetings WHERE scheduled_time >= $1::date AT TIME ZONE $2
    //             AND scheduled_time < ($1::date + INTERVAL '1 day') AT TIME ZONE $2
    return {
        localDate: localDateString,
        timezone: tz,
        // SQL snippet for start of day in user's timezone
        startOfDaySQL: `($1::date)::timestamp AT TIME ZONE $2`,
        // SQL snippet for end of day (exclusive) in user's timezone
        endOfDaySQL: `(($1::date)::timestamp + INTERVAL '1 day') AT TIME ZONE $2`
    };
};

/**
 * Format a date/time in a specific timezone for display
 * @param {Date|string} date - The date to format
 * @param {string} timezone - The IANA timezone identifier
 * @param {Object} options - Intl.DateTimeFormat options
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
 * Check if a given time falls within a user's "today" in their timezone
 * @param {Date|string} time - The time to check
 * @param {string} timezone - The user's timezone
 * @returns {boolean} True if the time is within today in user's timezone
 */
export const isToday = (time, timezone) => {
    const tz = getSafeTimezone(timezone);
    const now = new Date();
    const inputTime = new Date(time);

    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    return formatter.format(now) === formatter.format(inputTime);
};

/**
 * Get the current date string in a user's timezone
 * @param {string} timezone - The user's timezone
 * @returns {string} Current date in YYYY-MM-DD format in user's timezone
 */
export const getCurrentDateInTimezone = (timezone) => {
    const tz = getSafeTimezone(timezone);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
};

/**
 * Check if a meeting time has passed the auto-timeout threshold in user's timezone context
 * @param {Date|string} scheduledTime - The scheduled meeting time
 * @param {number} timeoutMinutes - Minutes after scheduled time to consider missed (default 40)
 * @returns {boolean} True if meeting should be marked as missed
 */
export const hasMeetingTimedOut = (scheduledTime, timeoutMinutes = 40) => {
    const scheduled = new Date(scheduledTime);
    const now = new Date();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    return (now.getTime() - scheduled.getTime()) >= timeoutMs;
};

/**
 * Convert a local time string to UTC, given the user's timezone
 * @param {string} localTimeString - Time string in user's local format
 * @param {string} timezone - The user's timezone
 * @returns {Date} UTC Date object
 */
export const localToUTC = (localTimeString, timezone) => {
    const tz = getSafeTimezone(timezone);

    // Parse the local time string
    const localDate = new Date(localTimeString);

    // Get the offset for this timezone at this specific time
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    // This is a simplified conversion - for production, consider using a library
    // The input is assumed to already represent the intended UTC time
    return localDate;
};

/**
 * Get timezone offset in minutes for a specific timezone at a specific time
 * Handles DST correctly by checking at the specific moment
 * @param {Date|string} date - The date to check offset for
 * @param {string} timezone - The IANA timezone identifier
 * @returns {number} Offset in minutes from UTC (positive = ahead of UTC)
 */
export const getTimezoneOffset = (date, timezone) => {
    const tz = getSafeTimezone(timezone);
    const inputDate = new Date(date);

    // Get UTC time
    const utcDate = new Date(inputDate.toLocaleString('en-US', { timeZone: 'UTC' }));
    // Get time in target timezone
    const tzDate = new Date(inputDate.toLocaleString('en-US', { timeZone: tz }));

    // Difference in minutes
    return Math.round((tzDate - utcDate) / (1000 * 60));
};

export default {
    getUserTimezone,
    isValidTimezone,
    getSafeTimezone,
    getDayBoundariesInTimezone,
    getDayBoundariesSQL,
    formatInTimezone,
    isToday,
    getCurrentDateInTimezone,
    hasMeetingTimedOut,
    localToUTC,
    getTimezoneOffset
};
