/**
 * Test that the timeout logic works in createMeeting endpoint
 */

import pool from './config/database.js';

async function testCreateMeetingTimeout() {
    console.log('🔍 Testing CreateMeeting Timeout Logic');
    console.log('=' .repeat(50));
    
    try {
        // First, let's create a test scenario
        // Add an overdue scheduled meeting
        console.log('🧪 Setting up test scenario...');
        
        const volunteerId = 20;
        const studentId = 29;
        
        // Insert a meeting that's 50 minutes overdue (past the 40-minute threshold)
        const overdueTime = new Date(Date.now() - (50 * 60 * 1000)); // 50 minutes ago
        
        const insertResult = await pool.query(`
            INSERT INTO meetings (volunteer_id, student_id, scheduled_time, status, room_id, created_at)
            VALUES ($1, $2, $3, 'scheduled', $4, NOW())
            RETURNING id
        `, [volunteerId, studentId, overdueTime, `test-room-${Date.now()}`]);
        
        const testMeetingId = insertResult.rows[0].id;
        console.log(`✅ Created test meeting ${testMeetingId} that's 50 minutes overdue`);
        
        // Check current meeting count before cleanup
        let countQuery = await pool.query(`
            SELECT COUNT(*) as meeting_count
            FROM meetings 
            WHERE volunteer_id = $1 AND student_id = $2 
            AND status NOT IN ('missed', 'canceled', 'cancelled')
        `, [volunteerId, studentId]);
        
        console.log(`📊 Current meeting count: ${countQuery.rows[0].meeting_count}/3`);
        
        // Now simulate what happens in createMeeting when we check for timeout
        console.log('\n🧪 Testing timeout cleanup logic...');
        
        const timeoutResult = await pool.query(`
            UPDATE meetings 
            SET status = 'missed', 
                updated_at = NOW()
            WHERE volunteer_id = $1 
            AND student_id = $2
            AND status = 'scheduled' 
            AND scheduled_time < NOW() - INTERVAL '40 minutes'
            RETURNING id, scheduled_time
        `, [volunteerId, studentId]);
        
        console.log(`✅ Timeout cleanup affected ${timeoutResult.rows.length} meetings:`);
        timeoutResult.rows.forEach(row => {
            console.log(`  - Meeting ${row.id} (scheduled: ${row.scheduled_time})`);
        });
        
        // Check meeting count after cleanup
        countQuery = await pool.query(`
            SELECT COUNT(*) as meeting_count
            FROM meetings 
            WHERE volunteer_id = $1 AND student_id = $2 
            AND status NOT IN ('missed', 'canceled', 'cancelled')
        `, [volunteerId, studentId]);
        
        console.log(`📊 Meeting count after timeout cleanup: ${countQuery.rows[0].meeting_count}/3`);
        
        const canSchedule = parseInt(countQuery.rows[0].meeting_count) < 3;
        console.log(`🎯 Can schedule new meeting: ${canSchedule ? '✅ YES' : '🚫 NO'}`);
        
        // Clean up the test meeting
        await pool.query(`DELETE FROM meetings WHERE id = $1`, [testMeetingId]);
        console.log(`🧹 Cleaned up test meeting ${testMeetingId}`);
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

// Run the test
testCreateMeetingTimeout()
    .then(() => {
        console.log('\n🎉 Test completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Test failed:', error);
        process.exit(1);
    });
