import cron from 'node-cron';
import { processScheduledNotifications } from './notificationService.js';

let schedulerTask = null;

/**
 * Start the notification scheduler
 */
export const startScheduler = () => {
    if (schedulerTask) {
        console.log('[Notification Service] Scheduler already running');
        return;
    }

    // Run every minute
    schedulerTask = cron.schedule('* * * * *', async () => {
        try {
            await processScheduledNotifications();
        } catch (error) {
            console.error('[Notification Service] Scheduler error:', error.message);
        }
    }, {
        scheduled: true,
        timezone: 'UTC' // Use UTC for global timezone support
    });

    console.log('[Notification Service] Scheduler started (processing every minute)');

    // Run immediately on startup
    processScheduledNotifications();
};

/**
 * Stop the scheduler
 */
export const stopScheduler = () => {
    if (schedulerTask) {
        schedulerTask.stop();
        schedulerTask = null;
        console.log('[Notification Service] Scheduler stopped');
    }
};

export default { startScheduler, stopScheduler };
