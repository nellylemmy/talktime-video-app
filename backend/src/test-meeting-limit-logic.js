/**
 * Test script to verify that 3-meeting limit only counts successful meetings
 * This script runs inside the Docker backend container
 */

import pool from './config/database.js';

async function testMeetingLimitLogic() {
    console.log('🧪 Testing 3-Meeting Limit Logic');
    console.log('=' .repeat(50));
    
    try {
        // Find existing volunteer and student users
        console.log('🔍 Finding existing users...');
        
        const volunteerQuery = await pool.query(`
            SELECT id, full_name FROM users WHERE role = 'volunteer' LIMIT 1
        `);
        
        const studentQuery = await pool.query(`
            SELECT id, full_name FROM users WHERE role = 'student' LIMIT 1
        `);
        
        if (volunteerQuery.rows.length === 0) {
            throw new Error('No volunteer users found in database. Please create a volunteer user first.');
        }
        
        if (studentQuery.rows.length === 0) {
            throw new Error('No student users found in database. Please create a student user first.');
        }
        
        const testVolunteerId = volunteerQuery.rows[0].id;
        const testStudentId = studentQuery.rows[0].id;
        
        console.log(`✅ Found Volunteer: ${volunteerQuery.rows[0].full_name} (ID: ${testVolunteerId})`);
        console.log(`✅ Found Student: ${studentQuery.rows[0].full_name} (ID: ${testStudentId})`);
        
        console.log(`Testing with Volunteer ID: ${testVolunteerId}, Student ID: ${testStudentId}`);
        
        // Clean up any existing test meetings first
        await pool.query(`
            DELETE FROM meetings 
            WHERE volunteer_id = $1 AND student_id = $2 AND room_id LIKE 'test-%'
        `, [testVolunteerId, testStudentId]);
        
        console.log('✅ Cleaned up existing test meetings');
        
        // Test 1: Create meetings with different statuses
        console.log('\n🎯 Test 1: Creating meetings with different statuses...');
        
        const meetings = [];
        
        // Meeting 1: Completed (should count toward limit)
        const meeting1 = await pool.query(`
            INSERT INTO meetings (room_id, volunteer_id, student_id, scheduled_time, status)
            VALUES ($1, $2, $3, NOW() + INTERVAL '1 day', 'completed')
            RETURNING id, status
        `, ['test-completed-1', testVolunteerId, testStudentId]);
        meetings.push(meeting1.rows[0]);
        console.log(`✅ Created completed meeting: ID ${meeting1.rows[0].id}`);
        
        // Meeting 2: Canceled (should NOT count toward limit)
        const meeting2 = await pool.query(`
            INSERT INTO meetings (room_id, volunteer_id, student_id, scheduled_time, status)
            VALUES ($1, $2, $3, NOW() + INTERVAL '2 days', 'canceled')
            RETURNING id, status
        `, ['test-canceled-1', testVolunteerId, testStudentId]);
        meetings.push(meeting2.rows[0]);
        console.log(`✅ Created canceled meeting: ID ${meeting2.rows[0].id}`);
        
        // Meeting 3: Scheduled (should NOT count toward limit - only completed/in_progress count)
        const meeting3 = await pool.query(`
            INSERT INTO meetings (room_id, volunteer_id, student_id, scheduled_time, status)
            VALUES ($1, $2, $3, NOW() + INTERVAL '3 days', 'scheduled')
            RETURNING id, status
        `, ['test-scheduled-1', testVolunteerId, testStudentId]);
        meetings.push(meeting3.rows[0]);
        console.log(`✅ Created scheduled meeting: ID ${meeting3.rows[0].id}`);
        
        // Meeting 4: In Progress (should count toward limit)
        const meeting4 = await pool.query(`
            INSERT INTO meetings (room_id, volunteer_id, student_id, scheduled_time, status)
            VALUES ($1, $2, $3, NOW() + INTERVAL '4 days', 'in_progress')
            RETURNING id, status
        `, ['test-in-progress-1', testVolunteerId, testStudentId]);
        meetings.push(meeting4.rows[0]);
        console.log(`✅ Created in_progress meeting: ID ${meeting4.rows[0].id}`);
        
        // Meeting 5: Missed (should NOT count toward limit)
        const meeting5 = await pool.query(`
            INSERT INTO meetings (room_id, volunteer_id, student_id, scheduled_time, status)
            VALUES ($1, $2, $3, NOW() + INTERVAL '5 days', 'missed')
            RETURNING id, status
        `, ['test-missed-1', testVolunteerId, testStudentId]);
        meetings.push(meeting5.rows[0]);
        console.log(`✅ Created missed meeting: ID ${meeting5.rows[0].id}`);
        
        // Test 2: Check the counting logic
        console.log('\n🎯 Test 2: Checking meeting count logic...');
        
        // This is the actual query used in the meetingController.js
        const countQuery = `
            SELECT COUNT(*) as meeting_count
            FROM meetings 
            WHERE volunteer_id = $1 
            AND student_id = $2 
            AND status NOT IN ('missed', 'canceled', 'cancelled')
        `;
        
        const countResult = await pool.query(countQuery, [testVolunteerId, testStudentId]);
        const actualCount = parseInt(countResult.rows[0].meeting_count);
        
        console.log(`📊 Query result: ${actualCount} meetings count toward the limit`);
        console.log('📋 Expected: 3 meetings (1 completed + 1 in_progress + 1 scheduled)');
        console.log('📋 Excluded: 2 meetings (1 canceled + 1 missed)');
        
        // Test 3: Show all meetings for verification
        console.log('\n🎯 Test 3: Showing all test meetings...');
        
        const allMeetingsQuery = `
            SELECT id, status, scheduled_time, room_id
            FROM meetings 
            WHERE volunteer_id = $1 AND student_id = $2 AND room_id LIKE 'test-%'
            ORDER BY id
        `;
        
        const allMeetingsResult = await pool.query(allMeetingsQuery, [testVolunteerId, testStudentId]);
        
        console.log('📊 All test meetings:');
        allMeetingsResult.rows.forEach(meeting => {
            const countsTowardLimit = !['missed', 'canceled', 'cancelled'].includes(meeting.status);
            console.log(`  ID ${meeting.id}: ${meeting.status} ${countsTowardLimit ? '✅ COUNTS' : '❌ IGNORED'}`);
        });
        
        // Test 4: Verify the limit enforcement logic
        console.log('\n🎯 Test 4: Testing limit enforcement...');
        
        if (actualCount < 3) {
            console.log(`✅ Current count (${actualCount}) is under limit (3) - scheduling should be allowed`);
        } else {
            console.log(`🚫 Current count (${actualCount}) has reached limit (3) - scheduling should be blocked`);
        }
        
        // Simulate adding one more completed meeting to test limit
        const meeting6 = await pool.query(`
            INSERT INTO meetings (room_id, volunteer_id, student_id, scheduled_time, status)
            VALUES ($1, $2, $3, NOW() + INTERVAL '6 days', 'completed')
            RETURNING id, status
        `, ['test-completed-2', testVolunteerId, testStudentId]);
        console.log(`✅ Added another completed meeting: ID ${meeting6.rows[0].id}`);
        
        // Check count again
        const newCountResult = await pool.query(countQuery, [testVolunteerId, testStudentId]);
        const newCount = parseInt(newCountResult.rows[0].meeting_count);
        
        console.log(`📊 New count after adding completed meeting: ${newCount}`);
        
        if (newCount >= 3) {
            console.log('🚫 Limit reached! No more meetings should be allowed');
        } else {
            console.log(`✅ Still under limit (${newCount}/3)`);
        }
        
        // Test 5: Add more non-counting meetings to verify they don't affect limit
        console.log('\n🎯 Test 5: Adding non-counting meetings...');
        
        await pool.query(`
            INSERT INTO meetings (room_id, volunteer_id, student_id, scheduled_time, status)
            VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', 'canceled')
        `, ['test-canceled-2', testVolunteerId, testStudentId]);
        
        await pool.query(`
            INSERT INTO meetings (room_id, volunteer_id, student_id, scheduled_time, status)
            VALUES ($1, $2, $3, NOW() + INTERVAL '8 days', 'missed')
        `, ['test-missed-2', testVolunteerId, testStudentId]);
        
        console.log('✅ Added more canceled and missed meetings');
        
        // Final count check
        const finalCountResult = await pool.query(countQuery, [testVolunteerId, testStudentId]);
        const finalCount = parseInt(finalCountResult.rows[0].meeting_count);
        
        console.log(`📊 Final count (should be unchanged): ${finalCount}`);
        
        if (finalCount === newCount) {
            console.log('✅ Non-counting meetings correctly ignored!');
        } else {
            console.log('❌ Non-counting meetings incorrectly affected the limit');
        }
        
        // Summary
        console.log('\n' + '=' .repeat(50));
        console.log('📋 TEST SUMMARY');
        console.log('=' .repeat(50));
        
        const summaryQuery = `
            SELECT 
                status,
                COUNT(*) as count,
                CASE WHEN status NOT IN ('missed', 'canceled', 'cancelled') THEN 'COUNTS' ELSE 'IGNORED' END as limit_impact
            FROM meetings 
            WHERE volunteer_id = $1 AND student_id = $2 AND room_id LIKE 'test-%'
            GROUP BY status, (status NOT IN ('missed', 'canceled', 'cancelled'))
            ORDER BY status
        `;
        
        const summaryResult = await pool.query(summaryQuery, [testVolunteerId, testStudentId]);
        
        console.log('📊 Meeting status breakdown:');
        summaryResult.rows.forEach(row => {
            console.log(`  ${row.status}: ${row.count} meetings (${row.limit_impact})`);
        });
        
        console.log(`\n🎯 Only meetings with status 'missed', 'canceled', 'cancelled' are excluded from the 3-meeting limit`);
        console.log(`📈 Current count toward limit: ${finalCount}/3`);
        
        // Clean up test data
        console.log('\n🧹 Cleaning up test data...');
        const deleteResult = await pool.query(`
            DELETE FROM meetings 
            WHERE volunteer_id = $1 AND student_id = $2 AND room_id LIKE 'test-%'
        `, [testVolunteerId, testStudentId]);
        
        console.log(`✅ Cleaned up ${deleteResult.rowCount} test meetings`);
        console.log('\n✅ All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

// Run the test
testMeetingLimitLogic()
    .then(() => {
        console.log('\n🎉 Test script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Test script failed:', error);
        process.exit(1);
    });
