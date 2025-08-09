/**
 * Job Scheduler
 * 
 * This module initializes and schedules all background jobs for the TalkTime application.
 * Jobs are run at regular intervals to ensure data integrity and automation of processes.
 */
// Legacy resetStudentAvailability removed - using unified users table only

// Job configuration
const jobs = [
    {
        name: 'Reset Student Availability',
        fn: resetStudentAvailability,
        interval: 5 * 60 * 1000, // Run every 5 minutes (increased frequency for reliability)
        runOnStartup: true, // Run immediately when the server starts
        description: 'Resets availability for students with only past meetings'
    }
];

// Job scheduler
class JobScheduler {
    constructor() {
        this.jobIntervals = [];
    }

    /**
     * Initialize and start all scheduled jobs
     */
    start() {
        console.log('[Scheduler] Starting job scheduler');
        
        jobs.forEach(job => {
            console.log(`[Scheduler] Setting up job: ${job.name}`);
            
            // Run job immediately if configured
            if (job.runOnStartup) {
                console.log(`[Scheduler] Running job on startup: ${job.name}`);
                this.runJob(job);
            }
            
            // Schedule job to run at the specified interval
            const intervalId = setInterval(() => {
                console.log(`[Scheduler] Running scheduled job: ${job.name}`);
                this.runJob(job);
            }, job.interval);
            
            this.jobIntervals.push(intervalId);
        });
        
        console.log('[Scheduler] All jobs scheduled successfully');
    }

    /**
     * Run a job and handle any errors
     * @param {Object} job - Job configuration
     */
    async runJob(job) {
        try {
            await job.fn();
        } catch (error) {
            console.error(`[Scheduler] Error running job ${job.name}:`, error);
        }
    }

    /**
     * Stop all scheduled jobs
     */
    stop() {
        console.log('[Scheduler] Stopping job scheduler');
        
        this.jobIntervals.forEach(intervalId => {
            clearInterval(intervalId);
        });
        
        this.jobIntervals = [];
        console.log('[Scheduler] All jobs stopped');
    }
}

// Export singleton instance
const scheduler = new JobScheduler();
export default scheduler;
