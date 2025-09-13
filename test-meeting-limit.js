#!/usr/bin/env node

/**
 * Test script to verify that 3-meeting limit only counts successful meetings
 * This script tests the meeting counting logic for the 3-meeting limit feature
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api/v1';

// Test credentials (you may need to adjust these)
const TEST_VOLUNTEER = {
    email: 'volunteer@test.com',
    password: 'password123'
};

const TEST_STUDENT_ID = 1; // Adjust as needed

async function authenticateVolunteer() {
    console.log('🔐 Authenticating volunteer...');
    
    const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email: TEST_VOLUNTEER.email,
            password: TEST_VOLUNTEER.password,
            role: 'volunteer'
        })
    });
    
    if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Volunteer authenticated successfully');
    return data.token;
}

async function createMeeting(token, scheduledTime) {
    console.log(`📅 Creating meeting for ${scheduledTime}...`);
    
    const response = await fetch(`${API_BASE}/meetings`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            studentId: TEST_STUDENT_ID,
            scheduledTime: scheduledTime,
            timezone: 'Africa/Nairobi'
        })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        console.log(`❌ Failed to create meeting: ${data.error}`);
        return { success: false, error: data.error, data };
    }
    
    console.log(`✅ Meeting created: ID ${data.meeting.id}`);
    return { success: true, meeting: data.meeting };
}

async function getMeetingsByStudentId(token, studentId) {
    console.log(`📊 Getting meetings for student ID ${studentId}...`);
    
    const response = await fetch(`${API_BASE}/meetings/student/${studentId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to get meetings: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Retrieved meeting data`);
    console.log(`📈 Meeting statistics:`, data.meetingStats);
    
    return data;
}

async function updateMeetingStatus(token, meetingId, status) {
    console.log(`🔄 Updating meeting ${meetingId} status to '${status}'...`);
    
    const response = await fetch(`${API_BASE}/meetings/${meetingId}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            status: status
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        console.log(`❌ Failed to update meeting status: ${error.error}`);
        return false;
    }
    
    console.log(`✅ Meeting ${meetingId} status updated to '${status}'`);
    return true;
}

async function cancelMeeting(token, meetingId) {
    console.log(`❌ Canceling meeting ${meetingId}...`);
    
    const response = await fetch(`${API_BASE}/meetings/${meetingId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        const error = await response.json();
        console.log(`❌ Failed to cancel meeting: ${error.error}`);
        return false;
    }
    
    console.log(`✅ Meeting ${meetingId} canceled`);
    return true;
}

async function runTest() {
    try {
        console.log('🧪 Starting 3-Meeting Limit Test');
        console.log('=' .repeat(50));
        
        // Step 1: Authenticate
        const token = await authenticateVolunteer();
        
        // Step 2: Check initial meeting count
        console.log('\n📊 Checking initial meeting count...');
        let meetingData = await getMeetingsByStudentId(token, TEST_STUDENT_ID);
        const initialCount = meetingData.meetingStats.volunteerStudentMeetingCount;
        console.log(`Initial successful meeting count: ${initialCount}/3`);
        
        // Step 3: Create meetings and test different scenarios
        const meetings = [];
        
        // Create meeting 1 - will be completed (should count)
        console.log('\n🎯 Test 1: Creating meeting that will be marked as completed...');
        const future1 = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
        const result1 = await createMeeting(token, future1.toISOString());
        if (result1.success) {
            meetings.push(result1.meeting);
            // Mark as completed
            await updateMeetingStatus(token, result1.meeting.id, 'completed');
        }
        
        // Check count after first meeting
        meetingData = await getMeetingsByStudentId(token, TEST_STUDENT_ID);
        console.log(`Meeting count after completed meeting: ${meetingData.meetingStats.volunteerStudentMeetingCount}/3`);
        console.log(`Can schedule more: ${meetingData.meetingStats.canScheduleMore}`);
        
        // Create meeting 2 - will be canceled (should NOT count)
        console.log('\n🎯 Test 2: Creating meeting that will be canceled...');
        const future2 = new Date(Date.now() + 25 * 60 * 60 * 1000); // Tomorrow + 1 hour
        const result2 = await createMeeting(token, future2.toISOString());
        if (result2.success) {
            meetings.push(result2.meeting);
            // Cancel it
            await cancelMeeting(token, result2.meeting.id);
        }
        
        // Check count after canceled meeting
        meetingData = await getMeetingsByStudentId(token, TEST_STUDENT_ID);
        console.log(`Meeting count after canceled meeting: ${meetingData.meetingStats.volunteerStudentMeetingCount}/3`);
        console.log(`Can schedule more: ${meetingData.meetingStats.canScheduleMore}`);
        
        // Create meeting 3 - will remain scheduled (should NOT count toward limit)
        console.log('\n🎯 Test 3: Creating meeting that will remain scheduled...');
        const future3 = new Date(Date.now() + 26 * 60 * 60 * 1000); // Tomorrow + 2 hours
        const result3 = await createMeeting(token, future3.toISOString());
        if (result3.success) {
            meetings.push(result3.meeting);
        }
        
        // Check count after scheduled meeting
        meetingData = await getMeetingsByStudentId(token, TEST_STUDENT_ID);
        console.log(`Meeting count after scheduled meeting: ${meetingData.meetingStats.volunteerStudentMeetingCount}/3`);
        console.log(`Can schedule more: ${meetingData.meetingStats.canScheduleMore}`);
        
        // Try to create more meetings until limit is reached
        console.log('\n🎯 Test 4: Testing actual limit enforcement...');
        let attemptCount = 4;
        while (meetingData.meetingStats.canScheduleMore && attemptCount <= 6) {
            console.log(`\n📅 Attempting to create meeting #${attemptCount}...`);
            const futureTime = new Date(Date.now() + (26 + attemptCount) * 60 * 60 * 1000);
            const result = await createMeeting(token, futureTime.toISOString());
            
            if (result.success) {
                meetings.push(result.meeting);
                // Mark as completed to count toward limit
                await updateMeetingStatus(token, result.meeting.id, 'completed');
                
                // Check updated count
                meetingData = await getMeetingsByStudentId(token, TEST_STUDENT_ID);
                console.log(`Meeting count: ${meetingData.meetingStats.volunteerStudentMeetingCount}/3`);
                console.log(`Can schedule more: ${meetingData.meetingStats.canScheduleMore}`);
            } else {
                console.log(`🚫 Meeting creation blocked: ${result.error}`);
                break;
            }
            
            attemptCount++;
        }
        
        // Final test: Try to create one more meeting after limit is reached
        if (!meetingData.meetingStats.canScheduleMore) {
            console.log('\n🎯 Test 5: Verifying limit enforcement...');
            const futureTime = new Date(Date.now() + 30 * 60 * 60 * 1000);
            const limitResult = await createMeeting(token, futureTime.toISOString());
            
            if (!limitResult.success && limitResult.error.includes('3-meeting limit')) {
                console.log('✅ Limit enforcement working correctly!');
            } else {
                console.log('❌ Limit enforcement may not be working properly');
            }
        }
        
        // Summary
        console.log('\n' + '=' .repeat(50));
        console.log('📋 TEST SUMMARY');
        console.log('=' .repeat(50));
        
        const finalData = await getMeetingsByStudentId(token, TEST_STUDENT_ID);
        console.log(`Final meeting count: ${finalData.meetingStats.volunteerStudentMeetingCount}/3`);
        console.log(`Can schedule more: ${finalData.meetingStats.canScheduleMore}`);
        console.log(`Total meetings created in test: ${meetings.length}`);
        
        // Show all meetings and their statuses
        console.log('\n📊 All meetings between this volunteer and student:');
        finalData.volunteerStudentMeetings.forEach((meeting, index) => {
            console.log(`  ${index + 1}. Meeting ID ${meeting.id}: ${meeting.status} (${meeting.realTimeStatus || 'no real-time status'})`);
        });
        
        console.log('\n✅ Test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run the test
runTest();
