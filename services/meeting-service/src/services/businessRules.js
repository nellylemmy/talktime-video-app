import pool from '../config/database.js';
import {
    getAutoTimeoutMinutes,
    getMeetingLimitPerPair,
    getMaxFutureMonths,
    getVolunteerThresholds,
    getMeetingDuration
} from '../config/appConfig.js';
import { getUserTimezone, getDayBoundariesInTimezone } from '../utils/timezoneUtils.js';

/**
 * Business rules for meeting management
 * - 1-call-per-day per student rule (TIMEZONE-AWARE)
 * - Configurable meeting limit per volunteer-student pair (default: 3)
 * - Auto-timeout for overdue meetings (configurable, default: 40 minutes)
 * - Configurable future scheduling limit (default: 3 months)
 *
 * IMPORTANT: All day boundary calculations use the STUDENT's timezone
 * to ensure accurate enforcement for global users.
 */

/**
 * Check if student already has a meeting on a given date
 * TIMEZONE-AWARE: Day boundaries are calculated in the STUDENT's timezone
 *
 * @param {number} studentId
 * @param {Date} scheduledTime
 * @returns {Promise<Object|null>} Existing meeting or null, plus timezone context
 */
export const checkOneCallPerDay = async (studentId, scheduledTime) => {
    // Get student's timezone for accurate day boundary calculation
    const studentTimezone = await getUserTimezone(studentId);
    const { startOfDay, endOfDay, localDateString } = getDayBoundariesInTimezone(scheduledTime, studentTimezone);

    console.log('[Meeting Service] Timezone-aware day boundary check:', {
        studentId,
        studentTimezone,
        scheduledTime,
        localDate: localDateString,
        startOfDayUTC: startOfDay.toISOString(),
        endOfDayUTC: endOfDay.toISOString()
    });

    const query = `
        SELECT id, scheduled_time, volunteer_id, status
        FROM meetings
        WHERE student_id = $1
        AND scheduled_time >= $2
        AND scheduled_time < $3
        AND status IN ('scheduled', 'in_progress')
    `;

    const result = await pool.query(query, [studentId, startOfDay, endOfDay]);

    if (result.rows.length > 0) {
        return {
            ...result.rows[0],
            timezone: studentTimezone,
            dateInStudentTimezone: localDateString
        };
    }
    return null;
};

/**
 * Check meeting limit between volunteer and student
 * Also marks overdue meetings as missed
 * @param {number} volunteerId
 * @param {number} studentId
 * @returns {Promise<{count: number, canSchedule: boolean, limit: number}>}
 */
export const checkThreeMeetingLimit = async (volunteerId, studentId) => {
    // Get configurable timeout value
    const timeoutMinutes = await getAutoTimeoutMinutes();
    const meetingLimit = await getMeetingLimitPerPair();

    // First, mark overdue meetings as missed (using configurable timeout)
    await pool.query(`
        UPDATE meetings
        SET status = 'missed', updated_at = NOW()
        WHERE volunteer_id = $1
        AND student_id = $2
        AND status = 'scheduled'
        AND scheduled_time < NOW() - INTERVAL '${timeoutMinutes} minutes'
    `, [volunteerId, studentId]);

    // Count active meetings (exclude missed and canceled)
    const query = `
        SELECT COUNT(*) as meeting_count
        FROM meetings
        WHERE volunteer_id = $1
        AND student_id = $2
        AND status NOT IN ('missed', 'canceled', 'cancelled')
    `;

    const result = await pool.query(query, [volunteerId, studentId]);
    const count = parseInt(result.rows[0].meeting_count);

    return {
        count,
        canSchedule: count < meetingLimit,
        limit: meetingLimit
    };
};

/**
 * Check volunteer performance and restrictions
 * @param {number} volunteerId
 * @returns {Promise<Object>} Performance metrics and restriction status
 */
export const checkVolunteerPerformance = async (volunteerId) => {
    // Get configurable thresholds
    const thresholds = await getVolunteerThresholds();

    const query = `
        SELECT
            COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
            COUNT(*) FILTER (WHERE status = 'canceled' OR status = 'cancelled') as cancelled_calls,
            COUNT(*) FILTER (WHERE status = 'missed') as missed_calls,
            COUNT(*) FILTER (WHERE status IN ('completed', 'canceled', 'cancelled', 'missed')) as total_scheduled
        FROM meetings
        WHERE volunteer_id = $1 AND scheduled_time < NOW()
        AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)
    `;

    const result = await pool.query(query, [volunteerId]);
    const metrics = result.rows[0];

    const completedCalls = parseInt(metrics.completed_calls);
    const cancelledCalls = parseInt(metrics.cancelled_calls);
    const missedCalls = parseInt(metrics.missed_calls);
    const totalScheduled = parseInt(metrics.total_scheduled);

    if (totalScheduled === 0) {
        return {
            isRestricted: false,
            completedCalls: 0,
            cancelledCalls: 0,
            missedCalls: 0,
            totalScheduled: 0,
            cancelledRate: 0,
            missedRate: 0,
            reputationScore: 100
        };
    }

    const cancelledRate = Math.round((cancelledCalls / totalScheduled) * 100);
    const missedRate = Math.round((missedCalls / totalScheduled) * 100);
    const reputationScore = Math.max(0, Math.round(100 - (cancelledRate * 1.5) - (missedRate * 2)));

    // Enforce restrictions based on configurable thresholds
    const isRestricted =
        cancelledRate >= thresholds.cancellationRate ||
        missedRate >= thresholds.missedRate ||
        reputationScore < thresholds.minScore;

    return {
        isRestricted,
        completedCalls,
        cancelledCalls,
        missedCalls,
        totalScheduled,
        cancelledRate,
        missedRate,
        reputationScore,
        thresholds // Include thresholds in response for transparency
    };
};

/**
 * Validate scheduling time constraints
 * - Cannot schedule in the past
 * - Cannot schedule beyond configurable future limit
 * @param {Date} scheduledTime
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export const validateSchedulingTime = async (scheduledTime) => {
    const maxFutureMonths = await getMaxFutureMonths();

    const now = new Date();
    const scheduledDate = new Date(scheduledTime);
    const maxFutureDate = new Date();
    maxFutureDate.setMonth(maxFutureDate.getMonth() + maxFutureMonths);

    if (scheduledDate <= now) {
        return {
            valid: false,
            error: 'Cannot schedule meetings in the past. Please select a future date and time.',
            scheduledTime,
            currentTime: now
        };
    }

    if (scheduledDate > maxFutureDate) {
        return {
            valid: false,
            error: `Meetings can only be scheduled up to ${maxFutureMonths} months in advance. Please select an earlier date.`,
            scheduledTime,
            maxAllowedTime: maxFutureDate,
            maxFutureMonths
        };
    }

    return { valid: true };
};

/**
 * Mark overdue meetings as missed (batch operation)
 * Called by scheduler cron job
 * @returns {Promise<Array>} Array of meetings marked as missed
 */
export const markOverdueMeetingsAsMissed = async () => {
    const timeoutMinutes = await getAutoTimeoutMinutes();

    const query = `
        UPDATE meetings
        SET status = 'missed', updated_at = NOW()
        WHERE status = 'scheduled'
        AND scheduled_time < NOW() - INTERVAL '${timeoutMinutes} minutes'
        RETURNING id, volunteer_id, student_id, scheduled_time
    `;

    const result = await pool.query(query);
    return result.rows;
};

/**
 * Get real-time meeting status
 * @param {Object} meeting
 * @returns {Promise<string>} Real-time status
 */
export const getRealTimeStatus = async (meeting) => {
    const timeoutMinutes = await getAutoTimeoutMinutes();
    const durationMinutes = await getMeetingDuration();

    const now = new Date();
    const meetingStart = new Date(meeting.scheduled_time);
    const meetingEnd = new Date(meetingStart.getTime() + (durationMinutes * 60 * 1000));
    const minutesLate = Math.floor((now - meetingStart) / (1000 * 60));

    if (meeting.status === 'canceled' || meeting.status === 'completed' || meeting.status === 'missed') {
        return meeting.status;
    }

    if (now < meetingStart) {
        return 'upcoming';
    } else if (now >= meetingStart && now <= meetingEnd) {
        if (meeting.status === 'in_progress') {
            return 'in_progress';
        } else if (minutesLate >= timeoutMinutes) {
            return 'auto_missed';
        } else {
            return 'missed_start';
        }
    } else {
        if (meeting.status === 'in_progress') {
            return 'ended';
        } else if (meeting.status === 'scheduled') {
            return 'missed';
        } else {
            return meeting.status;
        }
    }
};

/**
 * Synchronous version of getRealTimeStatus for cases where async is not practical
 * Uses default values - for critical real-time checks, use async version
 * @param {Object} meeting
 * @param {number} timeoutMinutes - Optional timeout, defaults to 40
 * @param {number} durationMinutes - Optional duration, defaults to 40
 * @returns {string} Real-time status
 */
export const getRealTimeStatusSync = (meeting, timeoutMinutes = 40, durationMinutes = 40) => {
    const now = new Date();
    const meetingStart = new Date(meeting.scheduled_time);
    const meetingEnd = new Date(meetingStart.getTime() + (durationMinutes * 60 * 1000));
    const minutesLate = Math.floor((now - meetingStart) / (1000 * 60));

    if (meeting.status === 'canceled' || meeting.status === 'completed' || meeting.status === 'missed') {
        return meeting.status;
    }

    if (now < meetingStart) {
        return 'upcoming';
    } else if (now >= meetingStart && now <= meetingEnd) {
        if (meeting.status === 'in_progress') {
            return 'in_progress';
        } else if (minutesLate >= timeoutMinutes) {
            return 'auto_missed';
        } else {
            return 'missed_start';
        }
    } else {
        if (meeting.status === 'in_progress') {
            return 'ended';
        } else if (meeting.status === 'scheduled') {
            return 'missed';
        } else {
            return meeting.status;
        }
    }
};

export default {
    checkOneCallPerDay,
    checkThreeMeetingLimit,
    checkVolunteerPerformance,
    validateSchedulingTime,
    markOverdueMeetingsAsMissed,
    getRealTimeStatus,
    getRealTimeStatusSync
};
