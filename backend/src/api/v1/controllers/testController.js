// Test endpoint for notification scheduler functionality
// This is a development-only endpoint for testing

import { processScheduledNotifications } from '../../../services/notificationService.js';
import pool from '../../../config/database.js';

export const testNotificationScheduler = async (req, res) => {
    try {
        console.log('🧪 Testing notification scheduler functionality...');
        
        // Get current time
        const now = new Date();
        
        // Check for any scheduled notifications in the next 5 minutes
        const upcomingNotifications = await pool.query(`
            SELECT * FROM notifications 
            WHERE scheduled_for IS NOT NULL 
            AND scheduled_for BETWEEN $1 AND $2 
            AND is_sent = false
            ORDER BY scheduled_for ASC
            LIMIT 10
        `, [now.toISOString(), new Date(now.getTime() + 5 * 60 * 1000).toISOString()]);
        
        // Process any due notifications
        const processedCount = await processScheduledNotifications();
        
        // Get current meeting statistics
        const meetingStats = await pool.query(`
            SELECT 
                COUNT(*) as total_meetings,
                COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled_meetings,
                COUNT(*) FILTER (WHERE status = 'in_progress') as active_meetings,
                COUNT(*) FILTER (WHERE scheduled_time > NOW()) as future_meetings,
                COUNT(*) FILTER (WHERE scheduled_time BETWEEN NOW() AND NOW() + INTERVAL '1 hour') as meetings_next_hour
            FROM meetings
        `);
        
        // Get notification statistics
        const notificationStats = await pool.query(`
            SELECT 
                COUNT(*) as total_notifications,
                COUNT(*) FILTER (WHERE scheduled_for IS NOT NULL) as scheduled_notifications,
                COUNT(*) FILTER (WHERE is_sent = false AND scheduled_for IS NOT NULL) as pending_notifications,
                COUNT(*) FILTER (WHERE scheduled_for BETWEEN NOW() AND NOW() + INTERVAL '1 hour') as notifications_next_hour
            FROM notifications
        `);
        
        const testResult = {
            success: true,
            timestamp: now.toISOString(),
            timezone: 'UTC',
            scheduler_status: 'running',
            processed_notifications: processedCount,
            upcoming_notifications: upcomingNotifications.rows,
            meeting_stats: meetingStats.rows[0],
            notification_stats: notificationStats.rows[0],
            test_actions_performed: [
                'Checked for upcoming scheduled notifications',
                'Processed due notifications',
                'Gathered meeting statistics',
                'Gathered notification statistics'
            ]
        };
        
        console.log('✅ Notification scheduler test completed:', testResult);
        
        res.json(testResult);
        
    } catch (error) {
        console.error('❌ Error testing notification scheduler:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// Test endpoint to create a meeting scheduled for very soon (for testing auto-launch)
export const createTestMeeting = async (req, res) => {
    try {
        const { minutesFromNow = 2 } = req.body;
        
        // Create a test meeting scheduled for `minutesFromNow` minutes from now
        const scheduledTime = new Date(Date.now() + minutesFromNow * 60 * 1000);
        
        // Use test user IDs (you might need to adjust these based on your test data)
        const testVolunteerId = 53; // maina@mail.com
        const testStudentId = 54;   // neleki96
        
        const meeting = await pool.query(`
            INSERT INTO meetings (
                volunteer_id, 
                student_id, 
                scheduled_time, 
                duration, 
                status, 
                room_id,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            RETURNING *
        `, [
            testVolunteerId,
            testStudentId,
            scheduledTime,
            40, // 40 minutes
            'scheduled',
            `test-room-${Date.now()}`
        ]);
        
        // Schedule notifications for this meeting
        const notificationService = await import('../../../services/notificationService.js');
        await notificationService.scheduleMeetingNotifications(meeting.rows[0]);
        
        console.log('✅ Test meeting created:', meeting.rows[0]);
        
        res.json({
            success: true,
            meeting: meeting.rows[0],
            scheduled_time: scheduledTime.toISOString(),
            minutes_from_now: minutesFromNow,
            message: `Test meeting created and scheduled for ${scheduledTime.toLocaleString()}`
        });
        
    } catch (error) {
        console.error('❌ Error creating test meeting:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
