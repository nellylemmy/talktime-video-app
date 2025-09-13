/**
 * Debug specific meeting timeout logic
 */

import pool from './config/database.js';

async function debugMeetingTimeout() {
    console.log('🔍 Debugging Meeting Timeout Logic');
    console.log('=' .repeat(50));
    
    try {
        // Check meeting 66 specifically
        const meetingId = 66;
        
        const meetingQuery = await pool.query(`
            SELECT 
                id,
                status,
                scheduled_time,
                room_id,
                volunteer_id,
                student_id,
                created_at,
                updated_at,
                EXTRACT(EPOCH FROM (NOW() - scheduled_time))/60 as minutes_from_scheduled,
                NOW() as current_time
            FROM meetings 
            WHERE id = $1
        `, [meetingId]);
        
        if (meetingQuery.rows.length === 0) {
            console.log(`❌ Meeting ${meetingId} not found`);
            return;
        }
        
        const meeting = meetingQuery.rows[0];
        const minutesFromScheduled = Math.floor(meeting.minutes_from_scheduled);
        
        console.log(`📊 Meeting ${meetingId} Details:`);
        console.log(`  Status: ${meeting.status}`);
        console.log(`  Scheduled Time: ${meeting.scheduled_time}`);
        console.log(`  Current Time: ${meeting.current_time}`);
        console.log(`  Minutes from scheduled: ${minutesFromScheduled}`);
        console.log(`  Should timeout: ${minutesFromScheduled > 40 && meeting.status === 'scheduled'}`);
        
        // Test the timeout logic
        if (minutesFromScheduled > 40 && meeting.status === 'scheduled') {
            console.log('\n🚨 Meeting should be marked as missed!');
            console.log('📝 Applying timeout logic...');
            
            const updateResult = await pool.query(`
                UPDATE meetings 
                SET status = 'missed', 
                    updated_at = NOW()
                WHERE id = $1 AND status = 'scheduled'
                RETURNING id, status, updated_at
            `, [meetingId]);
            
            if (updateResult.rows.length > 0) {
                console.log('✅ Meeting successfully marked as missed');
                console.log('  New status:', updateResult.rows[0].status);
                console.log('  Updated at:', updateResult.rows[0].updated_at);
            } else {
                console.log('❌ No rows were updated');
            }
        } else {
            console.log('\n✅ Meeting does not need timeout');
        }
        
        // Now check the count again
        console.log('\n🔄 Rechecking meeting count...');
        
        const countQuery = await pool.query(`
            SELECT COUNT(*) as meeting_count
            FROM meetings 
            WHERE volunteer_id = $1 AND student_id = $2 
            AND status NOT IN ('missed', 'canceled', 'cancelled')
        `, [meeting.volunteer_id, meeting.student_id]);
        
        console.log(`📈 New meeting count: ${countQuery.rows[0].meeting_count}/3`);
        const canSchedule = parseInt(countQuery.rows[0].meeting_count) < 3;
        console.log(`🎯 Can schedule new meeting: ${canSchedule ? '✅ YES' : '🚫 NO'}`);
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
        throw error;
    }
}

// Run the debug
debugMeetingTimeout()
    .then(() => {
        console.log('\n🎉 Debug completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Debug failed:', error);
        process.exit(1);
    });
