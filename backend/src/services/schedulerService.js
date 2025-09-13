import cron from 'node-cron';
import { processScheduledNotifications } from './notificationService.js';

/**
 * Docker-compatible scheduler service for meeting notifications and auto-launch
 * Uses node-cron which works reliably in containerized environments
 */

let schedulerInitialized = false;
let notificationCronJob = null;

/**
 * Initialize the scheduler service
 * Safe to call multiple times - will only initialize once
 */
export const initializeScheduler = () => {
    if (schedulerInitialized) {
        console.log('📅 Scheduler already initialized, skipping...');
        return;
    }

    try {
        console.log('🚀 Initializing Docker-compatible scheduler service...');

        // Schedule notification processing every minute
        // Cron expression: "*/1 * * * *" = every minute
        notificationCronJob = cron.schedule('*/1 * * * *', async () => {
            try {
                const count = await processScheduledNotifications();
                if (count > 0) {
                    console.log(`📅 [CRON] Processed ${count} scheduled notifications`);
                }
            } catch (error) {
                console.error('❌ [CRON] Error processing scheduled notifications:', error);
            }
        }, {
            scheduled: true,
            timezone: "Africa/Nairobi" // EAT timezone for meeting scheduling
        });

        // Process notifications immediately on startup
        processScheduledNotifications()
            .then(count => {
                if (count > 0) {
                    console.log(`📅 [STARTUP] Processed ${count} scheduled notifications`);
                }
                console.log('✅ Scheduler initialized successfully');
            })
            .catch(error => {
                console.error('❌ [STARTUP] Error processing notifications:', error);
            });

        schedulerInitialized = true;
        
        // Log scheduler status
        console.log('📅 Notification scheduler started:');
        console.log('   - Frequency: Every minute');
        console.log('   - Timezone: Africa/Nairobi (EAT)');
        console.log('   - Auto-launch: Enabled for 5-minute reminders');
        console.log('   - Docker Compatible: Yes');

    } catch (error) {
        console.error('❌ Failed to initialize scheduler service:', error);
        throw error;
    }
};

/**
 * Stop the scheduler service
 * Useful for graceful shutdown
 */
export const stopScheduler = () => {
    if (notificationCronJob) {
        notificationCronJob.stop();
        notificationCronJob.destroy();
        notificationCronJob = null;
        schedulerInitialized = false;
        console.log('📅 Scheduler service stopped');
    }
};

/**
 * Get scheduler status
 * @returns {Object} Scheduler status information
 */
export const getSchedulerStatus = () => {
    return {
        initialized: schedulerInitialized,
        running: notificationCronJob ? true : false,
        timezone: 'Africa/Nairobi',
        frequency: 'Every minute',
        features: [
            'Scheduled notifications',
            'Meeting auto-launch',
            'Docker compatible',
            'EAT timezone support'
        ]
    };
};

/**
 * Manual trigger for testing purposes
 * @returns {Promise<number>} Number of notifications processed
 */
export const triggerManualProcess = async () => {
    console.log('🔧 [MANUAL] Triggering notification processing...');
    try {
        const count = await processScheduledNotifications();
        console.log(`🔧 [MANUAL] Processed ${count} notifications`);
        return count;
    } catch (error) {
        console.error('❌ [MANUAL] Error processing notifications:', error);
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
