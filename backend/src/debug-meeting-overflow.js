/**
 * Debug script to check why we have more than 3 active meetings per student
 */

import pool from './config/database.js';

async function debugMeetingCounts() {
    console.log('🔍 Debugging Why We Have >3 Active Meetings Per Student');
    console.log('=' .repeat(60));
    
    try {
        // Check the specific volunteer-student pair with too many meetings
        const volunteerId = 42; // nelson lemein
        const studentId = 29; // Malei Wycliff (from previous tests)
        
        console.log(`🔍 Analyzing Volunteer ${volunteerId} + Student ${studentId}:`);
        
        // Get all meetings with detailed status
        const allMeetingsQuery = await pool.query(`
            SELECT 
                id,
                status,
                scheduled_time,
                created_at,
                updated_at,
                EXTRACT(EPOCH FROM (NOW() - scheduled_time))/60 as minutes_from_scheduled
            FROM meetings 
            WHERE volunteer_id = $1 AND student_id = $2
            ORDER BY scheduled_time ASC
        `, [volunteerId, studentId]);
        
        const meetings = allMeetingsQuery.rows;
        console.log(`\n📊 Found ${meetings.length} total meetings:`);
        
        let activeCount = 0;
        let inactiveCount = 0;
        
        meetings.forEach((meeting, index) => {
            const minutesFromScheduled = Math.floor(meeting.minutes_from_scheduled);
            const timeStatus = minutesFromScheduled < 0 ? `${Math.abs(minutesFromScheduled)} min future` : `${minutesFromScheduled} min past`;
            
            const isActive = meeting.status !== 'missed' && meeting.status !== 'canceled' && meeting.status !== 'cancelled';
            if (isActive) activeCount++;
            else inactiveCount++;
            
            console.log(`  ${index + 1}. Meeting ${meeting.id}:`);
            console.log(`     Status: ${meeting.status} ${isActive ? '✅ COUNTS' : '❌ IGNORED'}`);
            console.log(`     Scheduled: ${meeting.scheduled_time}`);
            console.log(`     Time Status: ${timeStatus}`);
            console.log(`     Created: ${meeting.created_at}`);
            console.log('');
        });
        
        console.log(`📈 Summary:`);
        console.log(`   Active meetings (count toward limit): ${activeCount}`);
        console.log(`   Inactive meetings (missed/canceled): ${inactiveCount}`);
        console.log(`   Total meetings: ${meetings.length}`);
        
        if (activeCount > 3) {
            console.log(`\n🚨 ISSUE IDENTIFIED: ${activeCount} active meetings > 3 limit!`);
            console.log(`\n🔍 Possible explanations:`);
            console.log(`   1. Meetings were created before the 3-meeting limit was implemented`);
            console.log(`   2. Some meetings should have been auto-marked as missed but weren't`);
            console.log(`   3. The limit enforcement has a bug`);
            
            // Check when meetings were created vs when limit was implemented
            console.log(`\n📅 Meeting Creation Timeline:`);
            meetings.forEach((meeting, index) => {
                console.log(`   ${index + 1}. ${meeting.created_at.toISOString().split('T')[0]} - Meeting ${meeting.id} (${meeting.status})`);
            });
            
            // Check if any scheduled meetings should be timed out
            const overdueScheduled = meetings.filter(m => 
                m.status === 'scheduled' && m.minutes_from_scheduled > 40
            );
            
            if (overdueScheduled.length > 0) {
                console.log(`\n⏰ Found ${overdueScheduled.length} scheduled meetings that should be auto-timed out:`);
                overdueScheduled.forEach(meeting => {
                    console.log(`   - Meeting ${meeting.id}: ${Math.floor(meeting.minutes_from_scheduled)} min overdue`);
                });
                
                console.log(`\n🔧 Applying timeout fix...`);
                const timeoutResult = await pool.query(`
                    UPDATE meetings 
                    SET status = 'missed', 
                        updated_at = NOW()
                    WHERE volunteer_id = $1 
                    AND student_id = $2
                    AND status = 'scheduled' 
                    AND scheduled_time < NOW() - INTERVAL '40 minutes'
                    RETURNING id
                `, [volunteerId, studentId]);
                
                console.log(`✅ Auto-timed out ${timeoutResult.rows.length} meetings`);
                
                // Recount after timeout
                const newCountQuery = await pool.query(`
                    SELECT COUNT(*) as meeting_count
                    FROM meetings 
                    WHERE volunteer_id = $1 AND student_id = $2 
                    AND status NOT IN ('missed', 'canceled', 'cancelled')
                `, [volunteerId, studentId]);
                
                const newCount = parseInt(newCountQuery.rows[0].meeting_count);
                console.log(`📊 New active meeting count: ${newCount}/3`);
                console.log(`🎯 Can schedule more meetings: ${newCount < 3 ? '✅ YES' : '🚫 NO'}`);
            }
        } else {
            console.log(`\n✅ Meeting count is within expected limits`);
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
        throw error;
    }
}

// Run the debug
debugMeetingCounts()
    .then(() => {
        console.log('\n🎉 Debug completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Debug failed:', error);
        process.exit(1);
    });
