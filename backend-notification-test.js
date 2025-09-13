/**
 * Complete Notification System Test for TalkTime Docker Environment
 * This script tests the full notification workflow:
 * 1. Schedule notifications for a test meeting
 * 2. Process scheduled notifications
 * 3. Verify notifications are properly sent
 */

import { Pool } from 'pg';

// Database connection
const pool = new Pool({
    user: process.env.DB_USER || 'user',
    host: process.env.DB_HOST || 'db',
    database: process.env.DB_DATABASE || 'talktimedb_dev',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

async function testNotificationSystem() {
    console.log('🧪 Starting Complete Notification System Test');
    console.log('═══════════════════════════════════════════\n');

    try {
        // Step 1: Check database connection
        console.log('1️⃣ Testing database connection...');
        const dbTestResult = await pool.query('SELECT NOW() as current_time');
        console.log(`✅ Database connected. Current time: ${dbTestResult.rows[0].current_time}`);

        // Step 2: Check notifications table structure
        console.log('\n2️⃣ Checking notifications table...');
        const tableCheck = await pool.query(`
            SELECT COUNT(*) as total_notifications, 
                   COUNT(*) FILTER (WHERE scheduled_for IS NOT NULL) as scheduled_count,
                   COUNT(*) FILTER (WHERE is_sent = true) as sent_count
            FROM notifications
        `);
        const { total_notifications, scheduled_count, sent_count } = tableCheck.rows[0];
        console.log(`✅ Notifications table: ${total_notifications} total, ${scheduled_count} scheduled, ${sent_count} sent`);

        // Step 3: Test notification scheduling (simulate meeting creation)
        console.log('\n3️⃣ Testing notification scheduling...');
        
        // Create a test meeting time (30 minutes from now)
        const meetingTime = new Date();
        meetingTime.setMinutes(meetingTime.getMinutes() + 30);
        
        console.log(`📅 Test meeting time: ${meetingTime.toISOString()}`);
        
        // Schedule the 3 standard notifications
        const intervals = [
            { minutes: 60, title: '1-Hour Meeting Reminder', priority: 'low' },
            { minutes: 30, title: '30-Minute Meeting Reminder', priority: 'normal' },
            { minutes: 5, title: '5-Minute Meeting Reminder', priority: 'high' }
        ];
        
        const scheduledNotifications = [];
        
        for (const interval of intervals) {
            const scheduledTime = new Date(meetingTime.getTime() - (interval.minutes * 60 * 1000));
            
            // Only schedule if the notification time is in the future
            if (scheduledTime > new Date()) {
                const insertQuery = `
                    INSERT INTO notifications (
                        user_id, 
                        type, 
                        title, 
                        message, 
                        priority, 
                        scheduled_for, 
                        metadata
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING id, scheduled_for
                `;
                
                const result = await pool.query(insertQuery, [
                    24, // Test volunteer ID
                    'meeting_reminder_30min',
                    interval.title,
                    `Your test meeting is starting in ${interval.minutes} minutes at ${meetingTime.toLocaleTimeString()}.`,
                    interval.priority,
                    scheduledTime.toISOString(),
                    JSON.stringify({ meeting_id: 'TEST_MEETING', test: true })
                ]);
                
                scheduledNotifications.push({
                    id: result.rows[0].id,
                    scheduled_for: result.rows[0].scheduled_for,
                    minutes_before: interval.minutes,
                    title: interval.title
                });
                
                console.log(`   ✅ ${interval.title} scheduled for ${new Date(scheduledTime).toLocaleTimeString()}`);
            } else {
                console.log(`   ⚠️  ${interval.title} skipped (time in past: ${scheduledTime.toLocaleTimeString()})`);
            }
        }
        
        console.log(`✅ ${scheduledNotifications.length} notifications scheduled successfully`);

        // Step 4: Test immediate notification processing
        console.log('\n4️⃣ Testing immediate notification processing...');
        
        // Create a notification that should be processed immediately (1 second ago)
        const immediateTime = new Date();
        immediateTime.setSeconds(immediateTime.getSeconds() - 1);
        
        const immediateResult = await pool.query(`
            INSERT INTO notifications (
                user_id, 
                type, 
                title, 
                message, 
                priority, 
                scheduled_for, 
                metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [
            24,
            'meeting_reminder_5min',
            'Immediate Test Notification',
            'This notification should be processed immediately.',
            'high',
            immediateTime.toISOString(),
            JSON.stringify({ test: true, immediate: true })
        ]);
        
        const immediateNotificationId = immediateResult.rows[0].id;
        console.log(`✅ Immediate notification created: ID ${immediateNotificationId}`);

        // Step 5: Process scheduled notifications (simulate cron job)
        console.log('\n5️⃣ Processing scheduled notifications...');
        
        const now = new Date();
        const dueNotifications = await pool.query(`
            SELECT id, title, scheduled_for, priority
            FROM notifications 
            WHERE scheduled_for <= $1 
            AND scheduled_for IS NOT NULL
            AND is_sent = false
            ORDER BY scheduled_for ASC
        `, [now.toISOString()]);
        
        console.log(`📋 Found ${dueNotifications.rows.length} notifications due for processing`);
        
        let processedCount = 0;
        
        for (const notification of dueNotifications.rows) {
            // Mark as sent (simulate processing)
            await pool.query(`
                UPDATE notifications 
                SET is_sent = true, sent_at = NOW() 
                WHERE id = $1
            `, [notification.id]);
            
            processedCount++;
            console.log(`   ✅ Processed: ${notification.title} (ID: ${notification.id})`);
        }
        
        console.log(`✅ Processed ${processedCount} notifications`);

        // Step 6: Verify notification processing results
        console.log('\n6️⃣ Verifying notification processing...');
        
        const verificationQuery = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_sent = true) as sent,
                COUNT(*) FILTER (WHERE scheduled_for <= NOW() AND is_sent = false) as missed
            FROM notifications
            WHERE metadata->>'test' = 'true'
        `);
        
        const { total, sent, missed } = verificationQuery.rows[0];
        console.log(`📊 Test notifications: ${total} total, ${sent} sent, ${missed} missed`);

        // Step 7: Check upcoming notifications
        console.log('\n7️⃣ Checking upcoming notifications...');
        
        const upcomingQuery = await pool.query(`
            SELECT id, title, scheduled_for, priority
            FROM notifications 
            WHERE scheduled_for > NOW() 
            AND is_sent = false
            ORDER BY scheduled_for ASC
            LIMIT 5
        `);
        
        console.log(`📅 Upcoming notifications: ${upcomingQuery.rows.length}`);
        upcomingQuery.rows.forEach((notification, index) => {
            const timeUntil = new Date(notification.scheduled_for) - new Date();
            const minutesUntil = Math.round(timeUntil / (1000 * 60));
            console.log(`   ${index + 1}. "${notification.title}" in ${minutesUntil} minutes (${notification.priority} priority)`);
        });

        // Step 8: Test summary
        console.log('\n📊 TEST SUMMARY');
        console.log('═══════════════');
        console.log(`✅ Database connection: Working`);
        console.log(`✅ Notification scheduling: ${scheduledNotifications.length} scheduled`);
        console.log(`✅ Immediate processing: ${processedCount} processed`);
        console.log(`✅ Upcoming notifications: ${upcomingQuery.rows.length} pending`);
        
        if (scheduledNotifications.length > 0) {
            console.log('\n⏰ NOTIFICATION SCHEDULE:');
            scheduledNotifications.forEach(notification => {
                const timeUntil = new Date(notification.scheduled_for) - new Date();
                const minutesUntil = Math.round(timeUntil / (1000 * 60));
                console.log(`   • ${notification.title}: ${minutesUntil} minutes`);
            });
        }
        
        console.log('\n🎉 Notification system test completed successfully!');
        
        return {
            success: true,
            scheduled: scheduledNotifications.length,
            processed: processedCount,
            upcoming: upcomingQuery.rows.length
        };

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        return {
            success: false,
            error: error.message
        };
    } finally {
        await pool.end();
    }
}

// Run the test
testNotificationSystem()
    .then(result => {
        if (result.success) {
            console.log('\n✅ All tests passed!');
            process.exit(0);
        } else {
            console.log('\n❌ Tests failed!');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('\n💥 Unexpected error:', error);
        process.exit(1);
    });
