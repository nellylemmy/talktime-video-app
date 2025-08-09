/**
 * Script to test meeting deletion endpoint and debug the 404 issue
 */
import pool from './config/database.js';

async function testMeetingDeletion() {
    try {
        console.log('🔍 Testing meeting deletion functionality...');
        
        // First, let's check if there are any meetings in the database
        const allMeetings = await pool.query('SELECT id, volunteer_id, student_id, status FROM meetings ORDER BY id DESC LIMIT 5');
        console.log('📋 Recent meetings in database:');
        allMeetings.rows.forEach(meeting => {
            console.log(`   Meeting ID: ${meeting.id}, Volunteer: ${meeting.volunteer_id}, Student: ${meeting.student_id}, Status: ${meeting.status}`);
        });
        
        if (allMeetings.rows.length === 0) {
            console.log('❌ No meetings found in database');
            process.exit(0);
        }
        
        // Test the Meeting.findById method
        const testMeetingId = allMeetings.rows[0].id;
        console.log(`\n🧪 Testing Meeting.findById with ID: ${testMeetingId}`);
        
        // Direct database query to verify meeting exists
        const directQuery = await pool.query('SELECT * FROM meetings WHERE id = $1', [testMeetingId]);
        console.log('📊 Direct database query result:', directQuery.rows.length > 0 ? 'Found' : 'Not found');
        
        if (directQuery.rows.length > 0) {
            console.log('   Meeting data:', {
                id: directQuery.rows[0].id,
                volunteer_id: directQuery.rows[0].volunteer_id,
                student_id: directQuery.rows[0].student_id,
                status: directQuery.rows[0].status,
                scheduled_time: directQuery.rows[0].scheduled_time
            });
        }
        
        // Check if the Meeting model exists and works
        try {
            const { default: Meeting } = await import('./models/Meeting.js');
            console.log('✅ Meeting model imported successfully');
            
            const meetingFromModel = await Meeting.findById(testMeetingId);
            console.log('📊 Meeting.findById result:', meetingFromModel ? 'Found' : 'Not found');
            
            if (meetingFromModel) {
                console.log('   Model returned:', {
                    id: meetingFromModel.id,
                    volunteerId: meetingFromModel.volunteerId || meetingFromModel.volunteer_id,
                    studentId: meetingFromModel.studentId || meetingFromModel.student_id,
                    status: meetingFromModel.status
                });
            }
        } catch (modelError) {
            console.error('❌ Error with Meeting model:', modelError.message);
        }
        
        // Check if the route is properly registered by testing the endpoint structure
        console.log('\n🔍 Checking route registration...');
        console.log('Expected endpoint: DELETE /api/v1/meetings/:id');
        console.log('Route should be mounted at: /api/v1/meetings');
        console.log('Full path should be: DELETE /api/v1/meetings/{meetingId}');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testMeetingDeletion();
