import cron from 'node-cron';
import { processScheduledNotifications } from '../services/notificationService.js';

/**
 * Meeting scheduler using node-cron to handle automated meeting triggers
 * Runs every minute to check for meetings that should start
 */

let schedulerJob = null;

/**
 * Start the meeting scheduler
 * Checks every minute for scheduled notifications that need to be sent
 */
export const startMeetingScheduler = () => {
    if (schedulerJob) {
        console.log('⚠️ Meeting scheduler is already running');
        return;
    }
    
    console.log('🕐 Starting meeting scheduler - checking every minute for scheduled meetings...');
    
    // Schedule to run every minute: '* * * * *'
    // This will check for notifications due and trigger auto-launch for 5-minute reminders
    schedulerJob = cron.schedule('* * * * *', async () => {
        try {
            const processedCount = await processScheduledNotifications();
            if (processedCount > 0) {
                console.log(`📅 Processed ${processedCount} scheduled notifications`);
            }
        } catch (error) {
            console.error('❌ Error in meeting scheduler:', error);
        }
    }, {
        scheduled: true,
        timezone: 'Africa/Nairobi' // EAT timezone for Kenyan users
    });
    
    console.log('✅ Meeting scheduler started successfully');
};

/**
 * Stop the meeting scheduler
 */
export const stopMeetingScheduler = () => {
    if (schedulerJob) {
        schedulerJob.stop();
        schedulerJob = null;
        console.log('🛑 Meeting scheduler stopped');
    } else {
        console.log('⚠️ Meeting scheduler is not running');
    }
};

/**
 * Get scheduler status
 */
export const getSchedulerStatus = () => {
    return {
        isRunning: schedulerJob !== null,
        nextRun: schedulerJob ? 'Every minute' : 'Not scheduled'
    };
};

/**
 * Manual trigger for testing
 * Processes scheduled notifications immediately
 */
export const triggerSchedulerManually = async () => {
    try {
        console.log('🔄 Manually triggering scheduler...');
        const processedCount = await processScheduledNotifications();
        console.log(`✅ Manual trigger completed. Processed ${processedCount} notifications`);
        return processedCount;
    } catch (error) {
        console.error('❌ Error in manual scheduler trigger:', error);
        throw error;
    }
};
