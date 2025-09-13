/**
 * Debug script to check meeting count logic
 */

import pool from './config/database.js';

async function debugMeetingCount() {
    console.log('🔍 Debugging Meeting Count Logic');
    console.log('=' .repeat(50));
    
    try {
        // Find the volunteer and student from the URL the user mentioned
        // They mentioned student ID 29 in the error
        const studentId = 29;
        
        // Find volunteer with meetings for this student
        const volunteerQuery = await pool.query(`
            SELECT DISTINCT m.volunteer_id, u.full_name 
            FROM meetings m
            JOIN users u ON m.volunteer_id = u.id 
            WHERE m.student_id = $1 
            ORDER BY m.volunteer_id LIMIT 1
        `, [studentId]);
        
        if (volunteerQuery.rows.length === 0) {
            console.log('❌ No volunteer found with meetings for student 29');
            
            // Let's check if student 29 exists
            const studentCheck = await pool.query(`SELECT id, full_name FROM users WHERE id = $1`, [studentId]);
            if (studentCheck.rows.length === 0) {
                console.log('❌ Student 29 does not exist');
                
                // Find any student with meetings
                const anyStudentQuery = await pool.query(`
                    SELECT DISTINCT m.student_id, u.full_name 
                    FROM meetings m
                    JOIN users u ON m.student_id = u.id 
                    LIMIT 1
                `);
                
                if (anyStudentQuery.rows.length > 0) {
                    console.log(`✅ Using student ${anyStudentQuery.rows[0].student_id}: ${anyStudentQuery.rows[0].full_name}`);
                    return await debugSpecificPair(anyStudentQuery.rows[0].student_id);
                } else {
                    console.log('❌ No meetings found in database');
                    return;
                }
            } else {
                console.log(`✅ Student 29 exists: ${studentCheck.rows[0].full_name}`);
                console.log('❌ But no meetings found for this student');
                return;
            }
        }
        
        const volunteerId = volunteerQuery.rows[0].volunteer_id;
        const volunteerName = volunteerQuery.rows[0].full_name;
        
        console.log(`✅ Found Volunteer: ${volunteerName} (ID: ${volunteerId})`);
        console.log(`✅ Checking meetings with Student ID: ${studentId}`);
        
        return await debugSpecificPair(studentId, volunteerId);
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
        throw error;
    }
}

async function debugSpecificPair(studentId, volunteerId = null) {
    // If no volunteer specified, find one with meetings for this student
    if (!volunteerId) {
        const volunteerQuery = await pool.query(`
            SELECT DISTINCT m.volunteer_id, u.full_name 
            FROM meetings m
            JOIN users u ON m.volunteer_id = u.id 
            WHERE m.student_id = $1 
            ORDER BY m.volunteer_id LIMIT 1
        `, [studentId]);
        
        if (volunteerQuery.rows.length === 0) {
            console.log(`❌ No meetings found for student ${studentId}`);
            return;
        }
        
        volunteerId = volunteerQuery.rows[0].volunteer_id;
    }
    
    console.log(`\n🔍 Analyzing meetings between Volunteer ${volunteerId} and Student ${studentId}`);
    
    // Get all meetings between this volunteer and student
    const meetingsQuery = `
        SELECT 
            id,
            status,
            scheduled_time,
            room_id,
            created_at,
            EXTRACT(EPOCH FROM (NOW() - scheduled_time))/60 as minutes_from_scheduled
        FROM meetings 
        WHERE volunteer_id = $1 AND student_id = $2
        ORDER BY scheduled_time DESC
    `;
    
    const meetingsResult = await pool.query(meetingsQuery, [volunteerId, studentId]);
    const meetings = meetingsResult.rows;
    
    console.log(`📊 Found ${meetings.length} total meetings:`);
    
    let countOldLogic = 0;
    let countNewLogic = 0;
    
    meetings.forEach((meeting, index) => {
        const minutesFromScheduled = Math.floor(meeting.minutes_from_scheduled);
        const timeStatus = minutesFromScheduled < 0 ? `${Math.abs(minutesFromScheduled)} min future` : `${minutesFromScheduled} min past`;
        
        // Old logic (completed + in_progress only)
        const countsOldLogic = meeting.status === 'completed' || meeting.status === 'in_progress';
        if (countsOldLogic) countOldLogic++;
        
        // New logic (exclude only missed, canceled, cancelled)
        const countsNewLogic = meeting.status !== 'missed' && meeting.status !== 'canceled' && meeting.status !== 'cancelled';
        if (countsNewLogic) countNewLogic++;
        
        console.log(`  ${index + 1}. Meeting ${meeting.id}:`);
        console.log(`     Status: ${meeting.status}`);
        console.log(`     Time: ${timeStatus}`);
        console.log(`     Old Logic: ${countsOldLogic ? '✅ COUNTS' : '❌ IGNORED'}`);
        console.log(`     New Logic: ${countsNewLogic ? '✅ COUNTS' : '❌ IGNORED'}`);
        console.log('');
    });
    
    console.log('📈 Count Summary:');
    console.log(`  Old Logic (completed + in_progress only): ${countOldLogic}/3`);
    console.log(`  New Logic (exclude missed + canceled only): ${countNewLogic}/3`);
    
    const canScheduleOld = countOldLogic < 3;
    const canScheduleNew = countNewLogic < 3;
    
    console.log('\n🎯 Scheduling Status:');
    console.log(`  Old Logic: ${canScheduleOld ? '✅ CAN schedule' : '🚫 CANNOT schedule'}`);
    console.log(`  New Logic: ${canScheduleNew ? '✅ CAN schedule' : '🚫 CANNOT schedule'}`);
    
    // Test the actual database queries
    console.log('\n🧪 Testing Database Queries:');
    
    // Old query
    const oldQueryResult = await pool.query(`
        SELECT COUNT(*) as meeting_count
        FROM meetings 
        WHERE volunteer_id = $1 AND student_id = $2 
        AND status IN ('completed', 'in_progress')
    `, [volunteerId, studentId]);
    
    // New query
    const newQueryResult = await pool.query(`
        SELECT COUNT(*) as meeting_count
        FROM meetings 
        WHERE volunteer_id = $1 AND student_id = $2 
        AND status NOT IN ('missed', 'canceled', 'cancelled')
    `, [volunteerId, studentId]);
    
    console.log(`  Old Query Result: ${oldQueryResult.rows[0].meeting_count}`);
    console.log(`  New Query Result: ${newQueryResult.rows[0].meeting_count}`);
    
    // Status breakdown
    console.log('\n📊 Meeting Status Breakdown:');
    const statusQuery = await pool.query(`
        SELECT 
            status,
            COUNT(*) as count
        FROM meetings 
        WHERE volunteer_id = $1 AND student_id = $2
        GROUP BY status
        ORDER BY count DESC
    `, [volunteerId, studentId]);
    
    statusQuery.rows.forEach(row => {
        const countsInNewLogic = row.status !== 'missed' && row.status !== 'canceled' && row.status !== 'cancelled';
        console.log(`  ${row.status}: ${row.count} meeting(s) ${countsInNewLogic ? '✅ COUNTS' : '❌ IGNORED'}`);
    });
}

// Run the debug
debugMeetingCount()
    .then(() => {
        console.log('\n🎉 Debug completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Debug failed:', error);
        process.exit(1);
    });
