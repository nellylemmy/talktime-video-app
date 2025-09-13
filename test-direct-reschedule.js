/**
 * Direct test of the reschedule notification system
 * This bypasses authentication and directly tests the notification flow
 */

const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: 'db',
  port: 5432,
  database: 'talktimedb_dev',
  user: 'user',
  password: 'password'
});

async function testRescheduleNotificationFlow() {
    console.log('🧪 Testing Direct Reschedule Notification Flow\n');
    
    try {
        // Step 1: Get a meeting to reschedule
        console.log('📅 Step 1: Getting meeting to reschedule...');
        const meetingResult = await pool.query(
            'SELECT * FROM meetings WHERE status = $1 ORDER BY scheduled_time LIMIT 1',
            ['scheduled']
        );
        
        if (meetingResult.rows.length === 0) {
            console.log('❌ No scheduled meetings found to test with');
            return;
        }
        
        const meeting = meetingResult.rows[0];
        console.log('📋 Selected meeting:', {
            id: meeting.id,
            volunteer_id: meeting.volunteer_id,
            student_id: meeting.student_id,
            scheduled_time: meeting.scheduled_time
        });
        
        // Step 2: Get volunteer and student information
        console.log('\n👥 Step 2: Getting participant information...');
        const volunteerResult = await pool.query('SELECT * FROM users WHERE id = $1', [meeting.volunteer_id]);
        const studentResult = await pool.query('SELECT * FROM users WHERE id = $1', [meeting.student_id]);
        
        if (volunteerResult.rows.length === 0 || studentResult.rows.length === 0) {
            console.log('❌ Could not find volunteer or student information');
            return;
        }
        
        const volunteer = volunteerResult.rows[0];
        const student = studentResult.rows[0];
        
        console.log('👨‍🏫 Volunteer:', { id: volunteer.id, email: volunteer.email, username: volunteer.username });
        console.log('👨‍🎓 Student:', { id: student.id, email: student.email, username: student.username });
        
        // Step 3: Create reschedule notifications
        console.log('\n🔔 Step 3: Creating reschedule notifications...');
        
        const oldTime = new Date(meeting.scheduled_time);
        const newTime = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours from now
        
        // Create notification for volunteer
        const volunteerNotificationResult = await pool.query(`
            INSERT INTO notifications (
                user_id, type, title, message, data, 
                is_read, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) 
            RETURNING *
        `, [
            volunteer.id,
            'meeting_rescheduled',
            'Meeting Rescheduled',
            `Your meeting with ${student.username || student.email} has been rescheduled from ${oldTime.toLocaleString()} to ${newTime.toLocaleString()}`,
            JSON.stringify({
                meeting_id: meeting.id,
                old_time: oldTime.toISOString(),
                new_time: newTime.toISOString(),
                participant_name: student.username || student.email,
                action_url: `/volunteer/meetings.html?meeting=${meeting.id}`
            }),
            false
        ]);
        
        // Create notification for student
        const studentNotificationResult = await pool.query(`
            INSERT INTO notifications (
                user_id, type, title, message, data, 
                is_read, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) 
            RETURNING *
        `, [
            student.id,
            'meeting_rescheduled',
            'Meeting Rescheduled',
            `Your meeting with ${volunteer.username || volunteer.email} has been rescheduled from ${oldTime.toLocaleString()} to ${newTime.toLocaleString()}`,
            JSON.stringify({
                meeting_id: meeting.id,
                old_time: oldTime.toISOString(),
                new_time: newTime.toISOString(),
                participant_name: volunteer.username || volunteer.email,
                action_url: `/student/meetings.html?meeting=${meeting.id}`
            }),
            false
        ]);
        
        console.log('✅ Volunteer notification created:', volunteerNotificationResult.rows[0].id);
        console.log('✅ Student notification created:', studentNotificationResult.rows[0].id);
        
        // Step 4: Test notification retrieval
        console.log('\n📋 Step 4: Testing notification retrieval...');
        
        const volunteerNotifications = await pool.query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
            [volunteer.id]
        );
        
        const studentNotifications = await pool.query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
            [student.id]
        );
        
        console.log(`📧 Volunteer has ${volunteerNotifications.rows.length} total notifications`);
        console.log(`📧 Student has ${studentNotifications.rows.length} total notifications`);
        
        console.log('\n🎯 Latest volunteer notifications:');
        volunteerNotifications.rows.slice(0, 2).forEach(n => {
            console.log(`  - ${n.type}: ${n.title} (${n.created_at})`);
        });
        
        console.log('\n🎯 Latest student notifications:');
        studentNotifications.rows.slice(0, 2).forEach(n => {
            console.log(`  - ${n.type}: ${n.title} (${n.created_at})`);
        });
        
        console.log('\n✅ Test completed! To verify the full system:');
        console.log('   1. 📄 Check /volunteer/notifications.html - should show the new notification');
        console.log('   2. 📄 Check /student/notifications.html - should show the new notification');
        console.log('   3. 🔔 Check browser notifications (if permission granted)');
        console.log('   4. 🔴 Check bell badge for notification count');
        
        // Simulate Socket.IO notifications (just console output)
        console.log('\n📡 Simulated real-time events that would be sent:');
        console.log(`   🔔 socket.to('user_${volunteer.id}').emit('new-notification', ...)`);
        console.log(`   🔔 socket.to('user_${student.id}').emit('new-notification', ...)`);
        console.log(`   🔔 socket.to('user_${volunteer.id}').emit('meeting-rescheduled', ...)`);
        console.log(`   🔔 socket.to('user_${student.id}').emit('meeting-rescheduled', ...)`);
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await pool.end();
    }
}

// Run the test
testRescheduleNotificationFlow();
