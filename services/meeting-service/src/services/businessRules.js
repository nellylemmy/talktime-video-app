import pool from '../config/database.js';

/**
 * Business rules for meeting management
 * - 1-call-per-day per student rule
 * - 3-meeting limit per volunteer-student pair
 * - Auto-timeout for overdue meetings (40 minutes)
 * - 3-month future scheduling limit
 */

/**
 * Check if student already has a meeting on a given date
 * @param {number} studentId
 * @param {Date} scheduledTime
 * @returns {Promise<Object|null>} Existing meeting or null
 */
export const checkOneCallPerDay = async (studentId, scheduledTime) => {
    const meetingDate = new Date(scheduledTime);
    const startOfDay = new Date(meetingDate.getFullYear(), meetingDate.getMonth(), meetingDate.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const query = `
        SELECT id, scheduled_time, volunteer_id, status
        FROM meetings
        WHERE student_id = $1
        AND scheduled_time >= $2
        AND scheduled_time < $3
        AND status IN ('scheduled', 'in_progress')
    `;

    const result = await pool.query(query, [studentId, startOfDay, endOfDay]);
    return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Check 3-meeting limit between volunteer and student
 * Also marks overdue meetings as missed
 * @param {number} volunteerId
 * @param {number} studentId
 * @returns {Promise<{count: number, canSchedule: boolean}>}
 */
export const checkThreeMeetingLimit = async (volunteerId, studentId) => {
    // First, mark overdue meetings as missed (40+ minute timeout)
    await pool.query(`
        UPDATE meetings
        SET status = 'missed', updated_at = NOW()
        WHERE volunteer_id = $1
        AND student_id = $2
        AND status = 'scheduled'
        AND scheduled_time < NOW() - INTERVAL '40 minutes'
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
        canSchedule: count < 3,
        limit: 3
    };
};

/**
 * Check volunteer performance and restrictions
 * @param {number} volunteerId
 * @returns {Promise<Object>} Performance metrics and restriction status
 */
export const checkVolunteerPerformance = async (volunteerId) => {
    const query = `
        SELECT
            COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
            COUNT(*) FILTER (WHERE status = 'canceled' OR status = 'cancelled') as cancelled_calls,
            COUNT(*) FILTER (WHERE status = 'missed') as missed_calls,
            COUNT(*) FILTER (WHERE status IN ('completed', 'canceled', 'cancelled', 'missed')) as total_scheduled
        FROM meetings
        WHERE volunteer_id = $1 AND scheduled_time < NOW()
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

    // Enforce restrictions: cancelledRate >= 40% OR missedRate >= 30% OR reputationScore < 30
    const isRestricted = cancelledRate >= 40 || missedRate >= 30 || reputationScore < 30;

    return {
        isRestricted,
        completedCalls,
        cancelledCalls,
        missedCalls,
        totalScheduled,
        cancelledRate,
        missedRate,
        reputationScore
    };
};

/**
 * Validate scheduling time constraints
 * - Cannot schedule in the past
 * - Cannot schedule more than 3 months ahead
 * @param {Date} scheduledTime
 * @returns {{valid: boolean, error?: string}}
 */
export const validateSchedulingTime = (scheduledTime) => {
    const now = new Date();
    const scheduledDate = new Date(scheduledTime);
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    if (scheduledDate <= now) {
        return {
            valid: false,
            error: 'Cannot schedule meetings in the past. Please select a future date and time.',
            scheduledTime,
            currentTime: now
        };
    }

    if (scheduledDate > threeMonthsFromNow) {
        return {
            valid: false,
            error: 'Meetings can only be scheduled up to 3 months in advance. Please select an earlier date.',
            scheduledTime,
            maxAllowedTime: threeMonthsFromNow
        };
    }

    return { valid: true };
};

/**
 * Mark overdue meetings as missed (batch operation)
 * Called by scheduler cron job
 * @returns {Promise<number>} Number of meetings marked as missed
 */
export const markOverdueMeetingsAsMissed = async () => {
    const query = `
        UPDATE meetings
        SET status = 'missed', updated_at = NOW()
        WHERE status = 'scheduled'
        AND scheduled_time < NOW() - INTERVAL '40 minutes'
        RETURNING id, volunteer_id, student_id, scheduled_time
    `;

    const result = await pool.query(query);
    return result.rows;
};

/**
 * Get real-time meeting status
 * @param {Object} meeting
 * @returns {string} Real-time status
 */
export const getRealTimeStatus = (meeting) => {
    const now = new Date();
    const meetingStart = new Date(meeting.scheduled_time);
    const meetingEnd = new Date(meetingStart.getTime() + (60 * 60 * 1000)); // Assume 1 hour duration
    const minutesLate = Math.floor((now - meetingStart) / (1000 * 60));

    if (meeting.status === 'canceled' || meeting.status === 'completed' || meeting.status === 'missed') {
        return meeting.status;
    }

    if (now < meetingStart) {
        return 'upcoming';
    } else if (now >= meetingStart && now <= meetingEnd) {
        if (meeting.status === 'in_progress') {
            return 'in_progress';
        } else if (minutesLate >= 40) {
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
    getRealTimeStatus
};
