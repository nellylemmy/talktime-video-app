/**
 * Simple test to directly create reschedule notifications
 * This bypasses the complex scheduling issues and focuses on the core requirement
 */

import pg from 'pg';
const { Pool } = pg;

// Database connection  
const pool = new Pool({
  host: 'db',
  port: 5432,
  database: 'talktimedb_dev',
  user: 'user',
  password: 'password'
});

async function createSimpleRescheduleNotifications() {
    console.log('🧪 Creating Simple Reschedule Notifications\n');
    
    try {
        // Meeting 106: volunteer_id=53 (sara), student_id=23
        const meetingId = 106;
        const volunteerId = 53;
        const studentId = 23;
        
        console.log(`📅 Creating reschedule notifications for meeting ${meetingId}`);
        console.log(`   👨‍🏫 Volunteer ID: ${volunteerId} (sara)`);
        console.log(`   👨‍🎓 Student ID: ${studentId}`);
        
        // Get current meeting details
        const meetingResult = await pool.query('SELECT * FROM meetings WHERE id = $1', [meetingId]);
        if (meetingResult.rows.length === 0) {
            console.log('❌ Meeting not found');
            return;
        }
        
        const meeting = meetingResult.rows[0];
        console.log(`   📊 Meeting scheduled for: ${meeting.scheduled_time}`);
        
        // Get participant names
        const volunteerResult = await pool.query('SELECT username, email FROM users WHERE id = $1', [volunteerId]);
        const studentResult = await pool.query('SELECT username, email FROM users WHERE id = $1', [studentId]);
        
        const volunteer = volunteerResult.rows[0];
        const student = studentResult.rows[0];
        
        console.log(`   👨‍🏫 Volunteer: ${volunteer.username} (${volunteer.email})`);
        console.log(`   👨‍🎓 Student: ${student.username} (${student.email})`);
        
        const oldTime = "2025-09-12T16:00:00.000Z"; // Previous time
        const newTime = meeting.scheduled_time; // Current time
        
        // Create notification for volunteer
        console.log('\n🔔 Creating volunteer notification...');
        const volunteerNotification = await pool.query(`
            INSERT INTO notifications (
                user_id, type, title, message, metadata, 
                is_read, created_at, updated_at, is_persistent,
                recipient_role, action_url, priority
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, $8, $9, $10) 
            RETURNING *
        `, [
            volunteerId,
            'meeting_rescheduled',
            '📅 Meeting Rescheduled',
            `Your meeting with ${student.username || student.email} has been rescheduled to ${new Date(newTime).toLocaleString()}. Click to view details.`,
            JSON.stringify({
                meeting_id: meetingId,
                old_time: oldTime,
                new_time: newTime,
                participant_name: student.username || student.email,
                rescheduled_by: 'volunteer'
            }),
            false, // not read
            true,  // persistent
            'volunteer',
            `/volunteer/meetings.html?meeting=${meetingId}`,
            'normal'
        ]);
        
        console.log(`   ✅ Volunteer notification created: ID ${volunteerNotification.rows[0].id}`);
        
        // Create notification for student
        console.log('\n🔔 Creating student notification...');
        const studentNotification = await pool.query(`
            INSERT INTO notifications (
                user_id, type, title, message, metadata, 
                is_read, created_at, updated_at, is_persistent,
                recipient_role, action_url, priority
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, $8, $9, $10) 
            RETURNING *
        `, [
            studentId,
            'meeting_rescheduled',
            '📅 Meeting Rescheduled',
            `Your meeting with ${volunteer.username || volunteer.email} has been rescheduled to ${new Date(newTime).toLocaleString()}. Click to view details.`,
            JSON.stringify({
                meeting_id: meetingId,
                old_time: oldTime,
                new_time: newTime,
                participant_name: volunteer.username || volunteer.email,
                rescheduled_by: 'volunteer'
            }),
            false, // not read
            true,  // persistent  
            'student',
            `/student/meetings.html?meeting=${meetingId}`,
            'normal'
        ]);
        
        console.log(`   ✅ Student notification created: ID ${studentNotification.rows[0].id}`);
        
        console.log('\n🎯 Test Results:');
        console.log('   📄 Check /volunteer/notifications.html - should show new notification');
        console.log('   📄 Check /student/notifications.html - should show new notification');
        console.log('   🔔 Check browser for push notifications (if permission granted)');
        console.log('   🔴 Check bell badge for notification count');
        
        // Display notification IDs for verification
        console.log('\n📊 Created notification IDs:');
        console.log(`   👨‍🏫 Volunteer notification: ${volunteerNotification.rows[0].id}`);
        console.log(`   👨‍🎓 Student notification: ${studentNotification.rows[0].id}`);
        
    } catch (error) {
        console.error('❌ Error creating notifications:', error);
    } finally {
        await pool.end();
    }
}

// Run the test
createSimpleRescheduleNotifications();
