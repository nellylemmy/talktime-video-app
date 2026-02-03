import cron from 'node-cron';
import { markOverdueMeetingsAsMissed } from './businessRules.js';
import { publishMeetingMissed } from '../events/publisher.js';

let schedulerTask = null;

/**
 * Process overdue meetings and mark as missed
 */
const processOverdueMeetings = async () => {
    try {
        console.log('[Meeting Service] Checking for overdue meetings...');
        const missedMeetings = await markOverdueMeetingsAsMissed();

        if (missedMeetings.length > 0) {
            console.log(`[Meeting Service] Marked ${missedMeetings.length} meetings as missed`);

            // Publish events for each missed meeting
            for (const meeting of missedMeetings) {
                await publishMeetingMissed(meeting, 'timeout');
            }
        }
    } catch (error) {
        console.error('[Meeting Service] Error processing overdue meetings:', error.message);
    }
};

/**
 * Start the scheduler
 */
export const startScheduler = () => {
    if (schedulerTask) {
        console.log('[Meeting Service] Scheduler already running');
        return;
    }

    // Run every minute
    schedulerTask = cron.schedule('* * * * *', processOverdueMeetings, {
        scheduled: true,
        timezone: 'Africa/Nairobi'
    });

    console.log('[Meeting Service] Scheduler started (checking overdue meetings every minute)');

    // Run immediately on startup
    processOverdueMeetings();
};

/**
 * Stop the scheduler
 */
export const stopScheduler = () => {
    if (schedulerTask) {
        schedulerTask.stop();
        schedulerTask = null;
        console.log('[Meeting Service] Scheduler stopped');
    }
};

export default { startScheduler, stopScheduler };
