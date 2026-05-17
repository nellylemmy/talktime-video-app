import cron from 'node-cron';
import { processScheduledNotifications, scheduleMeetingNotifications } from './notificationService.js';
import { selectStudentRoundRobin } from '../api/v1/controllers/volunteerController.js';
import pool from '../config/database.js';
import { getMaxUpcomingPerSchedule, getVolunteerThresholds } from './configService.js';
import { getSafeTimezone } from '../utils/timezoneUtils.js';

/**
 * Docker-compatible scheduler service for meeting notifications and auto-launch
 * Uses node-cron which works reliably in containerized environments
 */

let schedulerInitialized = false;
let notificationCronJob = null;
let recurringCronJob = null;

/**
 * Initialize the scheduler service
 * Safe to call multiple times - will only initialize once
 */
export const initializeScheduler = () => {
    if (schedulerInitialized) {
        console.log('Scheduler already initialized, skipping...');
        return;
    }

    try {
        console.log('Initializing Docker-compatible scheduler service...');

        // Schedule notification processing every minute
        // Cron expression: "*/1 * * * *" = every minute
        notificationCronJob = cron.schedule('*/1 * * * *', async () => {
            try {
                const count = await processScheduledNotifications();
                if (count > 0) {
                    console.log(`[CRON] Processed ${count} scheduled notifications`);
                }
            } catch (error) {
                // Log error but don't crash - scheduler will retry next minute
                console.error('[CRON] Error processing scheduled notifications:', error.message);
                if (error.code === 'EAI_AGAIN') {
                    console.log('[CRON] DNS resolution issue detected - will retry next cycle');
                }
            }
        }, {
            scheduled: true,
            timezone: "UTC" // Use UTC for global timezone support - user timezones handled at display layer
        });

        // Daily recurring schedule processor — runs at 00:05 UTC each day
        // Creates meetings for the next 30 days based on active recurring_schedules
        recurringCronJob = cron.schedule('5 0 * * *', async () => {
            try {
                await processRecurringSchedules();
            } catch (error) {
                console.error('[CRON] Error processing recurring schedules:', error.message);
            }
        }, {
            scheduled: true,
            timezone: "UTC"
        });

        // Process notifications immediately on startup
        processScheduledNotifications()
            .then(count => {
                if (count > 0) {
                    console.log(`[STARTUP] Processed ${count} scheduled notifications`);
                }
                console.log('Scheduler initialized successfully');
            })
            .catch(error => {
                console.error('[STARTUP] Error processing notifications:', error.message);
            });

        schedulerInitialized = true;

        // Log scheduler status
        console.log('Notification scheduler started:');
        console.log('   - Frequency: Every minute');
        console.log('   - Timezone: UTC (user timezones applied at display)');
        console.log('   - Auto-launch: Enabled for 5-minute reminders');
        console.log('   - Recurring schedules: Daily at 00:05 UTC');
        console.log('   - Docker Compatible: Yes');
        console.log('   - Error Handling: Retry on DNS failures');

    } catch (error) {
        console.error('Failed to initialize scheduler service:', error);
        throw error;
    }
};

/**
 * Process all active recurring schedules.
 * For each schedule, maintains exactly 1 upcoming meeting at a time.
 * After that meeting is attended/missed/canceled, the next cron run creates the next occurrence.
 *
 * Guards:
 * - Duplicate check covers ALL statuses (prevents re-creating at same time slot)
 * - Cap of 1 upcoming meeting per schedule (configurable via recurring.max_upcoming_per_schedule)
 * - Volunteer performance check (skips if cancellation/missed rate too high)
 */
async function processRecurringSchedules() {
    console.log('[RECURRING] Starting daily recurring schedule processing...');

    const { rows: schedules } = await pool.query(
        `SELECT rs.*, u.full_name as volunteer_name
         FROM recurring_schedules rs
         JOIN users u ON rs.volunteer_id = u.id
         WHERE rs.is_active = TRUE`
    );

    if (schedules.length === 0) {
        console.log('[RECURRING] No active recurring schedules found.');
        return;
    }

    console.log(`[RECURRING] Processing ${schedules.length} active recurring schedule(s)...`);

    const maxUpcoming = await getMaxUpcomingPerSchedule();
    const { cancellationRate: cancelThreshold, missedRate: missedThreshold } = await getVolunteerThresholds();

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const schedule of schedules) {
        const { id: scheduleId, volunteer_id, time_slot, days_of_week, volunteer_name, timezone } = schedule;
        const tz = getSafeTimezone(timezone || 'Africa/Nairobi');

        // --- Performance guard: skip if volunteer is restricted ---
        const { rows: [perfStats] } = await pool.query(
            `SELECT
                COUNT(*) FILTER (WHERE status IN ('completed', 'canceled', 'cancelled', 'missed')) as total_terminal,
                COUNT(*) FILTER (WHERE status IN ('canceled', 'cancelled')) as total_canceled,
                COUNT(*) FILTER (WHERE status = 'missed') as total_missed
             FROM meetings
             WHERE volunteer_id = $1`,
            [volunteer_id]
        );

        const totalTerminal = parseInt(perfStats.total_terminal) || 0;
        if (totalTerminal > 0) {
            const cancelRate = (parseInt(perfStats.total_canceled) / totalTerminal) * 100;
            const missedRate = (parseInt(perfStats.total_missed) / totalTerminal) * 100;
            if (cancelRate >= cancelThreshold || missedRate >= missedThreshold) {
                console.log(`[RECURRING] Skipping schedule ${scheduleId} — volunteer ${volunteer_name} (ID ${volunteer_id}) restricted (cancel: ${cancelRate.toFixed(1)}%, missed: ${missedRate.toFixed(1)}%)`);
                continue;
            }
        }

        // --- Cap check: how many upcoming meetings does this schedule already have? ---
        const { rows: [{ count: upcomingCount }] } = await pool.query(
            `SELECT COUNT(*)::int as count FROM meetings
             WHERE recurring_schedule_id = $1 AND status = 'scheduled' AND scheduled_time > NOW()`,
            [scheduleId]
        );

        if (upcomingCount >= maxUpcoming) {
            console.log(`[RECURRING] Schedule ${scheduleId} already has ${upcomingCount}/${maxUpcoming} upcoming. Skipping.`);
            totalSkipped++;
            continue;
        }

        // time_slot is a TIME value like '16:30:00'
        const [slotH, slotM] = time_slot.split(':').map(Number);

        // Iterate today+1 through today+30, create at most (maxUpcoming - upcomingCount) meetings
        let createdForSchedule = 0;
        const remaining = maxUpcoming - upcomingCount;
        const today = new Date();

        for (let offset = 1; offset <= 30; offset++) {
            if (createdForSchedule >= remaining) break;

            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() + offset);

            // Get day-of-week in the schedule's timezone (not UTC)
            const dowStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(targetDate);
            const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
            const localDow = dayMap[dowStr];
            if (localDow === 0) continue; // Sunday — skip
            if (!days_of_week.includes(localDow)) continue;

            // Get YYYY-MM-DD in the schedule's timezone
            const localDateStr = new Intl.DateTimeFormat('en-CA', {
                timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(targetDate);
            const hr = String(slotH).padStart(2, '0');
            const mi = String(slotM).padStart(2, '0');

            // Use PostgreSQL AT TIME ZONE for DST-safe UTC conversion
            const localDatetime = `${localDateStr} ${hr}:${mi}:00`;
            const { rows: [{ ts: scheduledTime }] } = await pool.query(
                `SELECT ($1::timestamp AT TIME ZONE $2)::timestamptz as ts`, [localDatetime, tz]
            );

            // Duplicate check: has ANY meeting ever existed at this volunteer + time slot?
            const { rows: existing } = await pool.query(
                `SELECT id FROM meetings
                 WHERE volunteer_id = $1 AND scheduled_time = $2`,
                [volunteer_id, scheduledTime]
            );

            if (existing.length > 0) {
                totalSkipped++;
                continue;
            }

            // Auto-assign a student via round-robin
            const student = await selectStudentRoundRobin(volunteer_id, scheduledTime, tz);
            if (!student) {
                totalSkipped++;
                continue;
            }

            const studentId = student.user_id || student.id;
            const roomId = `talktime-${volunteer_id}-${studentId}-${Date.now()}-${offset}`;

            try {
                const { rows: [meeting] } = await pool.query(
                    `INSERT INTO meetings (volunteer_id, student_id, scheduled_time, room_id, status, recurring_schedule_id)
                     VALUES ($1, $2, $3, $4, 'scheduled', $5)
                     RETURNING *`,
                    [volunteer_id, studentId, scheduledTime, roomId, scheduleId]
                );

                // Schedule notifications for the meeting
                await scheduleMeetingNotifications(meeting);
                totalCreated++;
                createdForSchedule++;
            } catch (meetingErr) {
                console.error(`[RECURRING] Failed to create meeting for schedule ${scheduleId} at ${scheduledTime}:`, meetingErr.message);
                totalSkipped++;
            }
        }
    }

    console.log(`[RECURRING] Done. Created ${totalCreated} meetings, skipped ${totalSkipped}.`);
}

/**
 * Stop the scheduler service
 * Useful for graceful shutdown
 */
export const stopScheduler = () => {
    if (notificationCronJob) {
        notificationCronJob.stop();
        notificationCronJob.destroy();
        notificationCronJob = null;
    }
    if (recurringCronJob) {
        recurringCronJob.stop();
        recurringCronJob.destroy();
        recurringCronJob = null;
    }
    schedulerInitialized = false;
    console.log('Scheduler service stopped');
};

/**
 * Get scheduler status
 * @returns {Object} Scheduler status information
 */
export const getSchedulerStatus = () => {
    return {
        initialized: schedulerInitialized,
        running: notificationCronJob ? true : false,
        recurringRunning: recurringCronJob ? true : false,
        timezone: 'UTC',
        frequency: 'Every minute',
        recurringFrequency: 'Daily at 00:05 UTC',
        features: [
            'Scheduled notifications',
            'Meeting auto-launch',
            'Recurring schedule processing',
            'Docker compatible',
            'Global timezone support',
            'DNS failure retry'
        ]
    };
};

/**
 * Manual trigger for testing purposes
 * @returns {Promise<number>} Number of notifications processed
 */
export const triggerManualProcess = async () => {
    console.log('[MANUAL] Triggering notification processing...');
    try {
        const count = await processScheduledNotifications();
        console.log(`[MANUAL] Processed ${count} notifications`);
        return count;
    } catch (error) {
        console.error('[MANUAL] Error processing notifications:', error);
        throw error;
    }
};

// Export default for easy importing
export default {
    initializeScheduler,
    stopScheduler,
    getSchedulerStatus,
    triggerManualProcess
};
