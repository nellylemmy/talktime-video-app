import cron from 'node-cron';
import { processScheduledNotifications, scheduleMeetingNotifications } from './notificationService.js';
import { selectStudentRoundRobin } from '../api/v1/controllers/volunteerController.js';
import Meeting from '../models/Meeting.js';
import pool from '../config/database.js';

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
 * For each schedule, creates meetings for the next 30 days where:
 * - The day-of-week matches the schedule's days_of_week
 * - The volunteer doesn't already have a meeting at that exact time
 * - A student is available via round-robin
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

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const schedule of schedules) {
        const { volunteer_id, time_slot, days_of_week } = schedule;

        // time_slot is a TIME value like '16:30:00'
        const [slotH, slotM] = time_slot.split(':').map(Number);

        // Iterate today+1 through today+30
        const today = new Date();
        for (let offset = 1; offset <= 30; offset++) {
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() + offset);

            // Get the EAT day-of-week (JS: 0=Sun, 1=Mon ... 6=Sat)
            // Our DB uses 1=Mon..6=Sat
            const jsDow = targetDate.getDay(); // 0=Sun
            // Convert to our format: Sun=0, Mon=1 ... Sat=6 (same mapping)
            // But our constraint uses 1=Mon..6=Sat (no 0=Sunday)
            if (jsDow === 0) continue; // Sunday — skip

            if (!days_of_week.includes(jsDow)) continue;

            // Build the scheduled time as EAT with +03:00 offset
            const yr = targetDate.getFullYear();
            const mo = String(targetDate.getMonth() + 1).padStart(2, '0');
            const dy = String(targetDate.getDate()).padStart(2, '0');
            const hr = String(slotH).padStart(2, '0');
            const mi = String(slotM).padStart(2, '0');
            const scheduledTime = `${yr}-${mo}-${dy}T${hr}:${mi}:00+03:00`;

            // Check if volunteer already has a meeting at this exact time
            const { rows: existing } = await pool.query(
                `SELECT id FROM meetings
                 WHERE volunteer_id = $1 AND scheduled_time = $2
                 AND status IN ('scheduled', 'in_progress')`,
                [volunteer_id, scheduledTime]
            );

            if (existing.length > 0) {
                totalSkipped++;
                continue;
            }

            // Auto-assign a student via round-robin
            const student = await selectStudentRoundRobin(volunteer_id, scheduledTime);
            if (!student) {
                totalSkipped++;
                continue;
            }

            const studentId = student.user_id || student.id;
            const roomId = `talktime-${volunteer_id}-${studentId}-${Date.now()}-${offset}`;

            try {
                const meeting = await Meeting.create({
                    volunteerId: volunteer_id,
                    studentId: studentId,
                    scheduledTime: scheduledTime,
                    roomId: roomId
                });

                // Schedule notifications for the meeting
                await scheduleMeetingNotifications(meeting);
                totalCreated++;
            } catch (meetingErr) {
                console.error(`[RECURRING] Failed to create meeting for volunteer ${volunteer_id} at ${scheduledTime}:`, meetingErr.message);
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
