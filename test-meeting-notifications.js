/**
 * Test script to create a meeting scheduled for 3 minutes from now
 * This will test the notification auto-launch functionality
 */

const axios = require('axios');

// Create a meeting 3 minutes from now
const now = new Date();
const meetingTime = new Date(now.getTime() + 3 * 60 * 1000); // 3 minutes from now

console.log('🧪 Creating test meeting...');
console.log('📅 Current time:', now.toISOString());
console.log('📅 Meeting scheduled for:', meetingTime.toISOString());

const testData = {
    studentId: 29, // Using existing student ID from logs
    scheduledTime: meetingTime.toISOString(),
    timezone: 'Africa/Nairobi',
    eatTime: {
        hour: meetingTime.getHours(),
        minute: meetingTime.getMinutes()
    }
};

// Mock volunteer auth - using volunteer ID 54 from logs
const authHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTQsImVtYWlsIjoibWFpbmFAbWFpbC5jb20iLCJyb2xlIjoidm9sdW50ZWVyIiwiZnVsbE5hbWUiOiJtYWluYSBqb2huIiwiZnVsbF9uYW1lIjoibWFpbmEgam9obiIsInVzZXJuYW1lIjoiam9uaSIsInZvbHVudGVlcklkIjo1NCwidm9sdW50ZWVyX3R5cGUiOiJzdHVkZW50X3ZvbHVudGVlciIsImlzU3R1ZGVudFZvbHVudGVlciI6ZmFsc2UsImlzX2FwcHJvdmVkIjp0cnVlLCJpYXQiOjE3NTc2ODMyNjIsImV4cCI6MTc1Nzc2OTY2MiwiYXVkIjoidGFsa3RpbWUtY2xpZW50cyIsImlzcyI6InRhbGt0aW1lLWFwaSJ9.dummy'; // This would be a real JWT

async function createTestMeeting() {
    try {
        const response = await axios.post(
            'http://localhost:3001/api/v1/meetings',
            testData,
            {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ Test meeting created successfully!');
        console.log('📋 Meeting details:', response.data);
        console.log('⏰ Watch for notifications in approximately 2 minutes (5-minute reminder)');
        console.log('🎯 Meeting auto-launch should happen at:', new Date(meetingTime.getTime() - 5 * 60 * 1000).toISOString());
        
    } catch (error) {
        console.error('❌ Error creating test meeting:', error.response?.data || error.message);
        
        // Try a simple test notification instead
        console.log('🔄 Trying alternative: triggering notification directly...');
        await testNotificationDirect();
    }
}

async function testNotificationDirect() {
    try {
        // Trigger notification processing directly
        const response = await axios.get('http://localhost:3001/api/v1/test/notifications');
        console.log('📨 Direct notification test triggered');
    } catch (error) {
        console.log('ℹ️ Direct notification endpoint not available, that\'s okay');
    }
}

// Run the test
createTestMeeting();
