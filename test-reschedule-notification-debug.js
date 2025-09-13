/**
 * Test reschedule notification flow and debug sound issues
 */

const axios = require('axios');
const socketIOClient = require('socket.io-client');

const BASE_URL = 'http://localhost:3001';

// Test user credentials (you can change these to match your test users)
const testVolunteer = {
    email: 'test.volunteer@example.com',
    password: 'volunteer123'
};

const testStudent = {
    email: 'test.student@example.com', 
    password: 'student123'
};

let volunteerToken = null;
let studentToken = null;
let testMeetingId = null;

async function authenticateUser(credentials, role) {
    try {
        console.log(`🔐 Authenticating ${role}...`);
        const response = await axios.post(`${BASE_URL}/api/v1/auth/login`, credentials);
        
        if (response.data.token) {
            console.log(`✅ ${role} authenticated successfully`);
            return response.data.token;
        } else {
            throw new Error('No token received');
        }
    } catch (error) {
        console.error(`❌ ${role} authentication failed:`, error.response?.data || error.message);
        return null;
    }
}

async function createTestMeeting(token) {
    try {
        console.log('📅 Creating test meeting...');
        
        // First get a test student
        const studentsResponse = await axios.get(`${BASE_URL}/api/v1/meetings/students`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!studentsResponse.data.students || studentsResponse.data.students.length === 0) {
            throw new Error('No students available for testing');
        }
        
        const testStudent = studentsResponse.data.students[0];
        console.log('📚 Using test student:', testStudent.full_name);
        
        // Create a meeting scheduled for 2 hours from now
        const scheduledTime = new Date();
        scheduledTime.setHours(scheduledTime.getHours() + 2);
        
        const meetingData = {
            studentId: testStudent.id,
            scheduledTime: scheduledTime.toISOString(),
            duration: 40,
            description: 'Test meeting for sound debugging'
        };
        
        const response = await axios.post(`${BASE_URL}/api/v1/meetings`, meetingData, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.meeting) {
            console.log('✅ Test meeting created:', response.data.meeting.id);
            return {
                meetingId: response.data.meeting.id,
                studentId: testStudent.id,
                originalTime: scheduledTime
            };
        } else {
            throw new Error('Meeting creation failed');
        }
    } catch (error) {
        console.error('❌ Error creating test meeting:', error.response?.data || error.message);
        return null;
    }
}

async function rescheduleMeeting(token, meetingId, originalTime) {
    try {
        console.log('🔄 Rescheduling meeting...');
        
        // Reschedule to 3 hours from now
        const newTime = new Date();
        newTime.setHours(newTime.getHours() + 3);
        
        const updateData = {
            scheduledTime: newTime.toISOString(),
            description: 'Rescheduled test meeting for sound debugging'
        };
        
        console.log('📝 Reschedule data:', {
            meetingId,
            originalTime: originalTime.toISOString(),
            newTime: newTime.toISOString()
        });
        
        const response = await axios.put(`${BASE_URL}/api/v1/meetings/${meetingId}`, updateData, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.meeting) {
            console.log('✅ Meeting rescheduled successfully');
            console.log('📊 Response:', JSON.stringify(response.data, null, 2));
            return {
                success: true,
                meeting: response.data.meeting,
                originalTime,
                newTime
            };
        } else {
            throw new Error('Reschedule failed');
        }
    } catch (error) {
        console.error('❌ Error rescheduling meeting:', error.response?.data || error.message);
        return { success: false, error: error.response?.data || error.message };
    }
}

function setupSocketListener(userRole, token) {
    return new Promise((resolve) => {
        console.log(`🔌 Setting up Socket.IO listener for ${userRole}...`);
        
        const socket = socketIOClient(BASE_URL, {
            auth: {
                token: token
            },
            transports: ['websocket', 'polling']
        });
        
        socket.on('connect', () => {
            console.log(`✅ ${userRole} Socket.IO connected`);
            
            // Join notification room
            socket.emit('join-notification-room', {
                role: userRole,
                token: token
            });
        });
        
        socket.on('disconnect', (reason) => {
            console.log(`❌ ${userRole} Socket.IO disconnected:`, reason);
        });
        
        // Listen for reschedule events
        socket.on('meeting-rescheduled', (data) => {
            console.log(`🔔 [${userRole}] Received meeting-rescheduled event:`, data);
        });
        
        // Listen for notification events
        socket.on('new-notification', (data) => {
            console.log(`📢 [${userRole}] Received new-notification event:`, data);
        });
        
        // Listen for sound trigger events
        socket.on('notification-sound-trigger', (data) => {
            console.log(`🔊 [${userRole}] Received notification-sound-trigger event:`, data);
        });
        
        // Listen for badge updates
        socket.on('notification-badge-update', (data) => {
            console.log(`🔔 [${userRole}] Received badge update:`, data);
        });
        
        // Listen for push notification requests
        socket.on('push-notification-request', (data) => {
            console.log(`🚀 [${userRole}] Received push notification request:`, data);
        });
        
        socket.on('connect_error', (error) => {
            console.error(`❌ ${userRole} Socket.IO connection error:`, error);
        });
        
        setTimeout(() => {
            resolve(socket);
        }, 2000); // Give it time to connect
    });
}

async function checkNotifications(token, role) {
    try {
        console.log(`📋 Checking notifications for ${role}...`);
        const response = await axios.get(`${BASE_URL}/api/v1/notifications`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log(`📊 ${role} notifications:`, response.data.notifications?.length || 0);
        if (response.data.notifications && response.data.notifications.length > 0) {
            const recent = response.data.notifications.slice(0, 3);
            recent.forEach((notif, index) => {
                console.log(`  ${index + 1}. ${notif.title} (${notif.type}) - ${notif.created_at}`);
            });
        }
        
        return response.data.notifications || [];
    } catch (error) {
        console.error(`❌ Error checking ${role} notifications:`, error.response?.data || error.message);
        return [];
    }
}

async function runDebugTest() {
    console.log('🎵 Starting Reschedule Notification Sound Debug Test');
    console.log('='.repeat(60));
    
    try {
        // 1. Authenticate users
        volunteerToken = await authenticateUser(testVolunteer, 'volunteer');
        if (!volunteerToken) {
            console.log('⚠️  Could not authenticate volunteer, continuing with sound debug only...');
            return;
        }
        
        // 2. Set up Socket.IO listeners
        console.log('\n🔌 Setting up Socket.IO connections...');
        const volunteerSocket = await setupSocketListener('volunteer', volunteerToken);
        
        // Wait a bit for connections to stabilize
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 3. Create test meeting
        console.log('\n📅 Creating test meeting...');
        const meetingInfo = await createTestMeeting(volunteerToken);
        if (!meetingInfo) {
            console.log('❌ Could not create test meeting');
            return;
        }
        
        testMeetingId = meetingInfo.meetingId;
        
        // 4. Check initial notifications
        console.log('\n📋 Checking initial notifications...');
        await checkNotifications(volunteerToken, 'volunteer');
        
        // 5. Wait a moment then reschedule
        console.log('\n⏳ Waiting 5 seconds before rescheduling...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('\n🔄 Rescheduling meeting...');
        const rescheduleResult = await rescheduleMeeting(volunteerToken, meetingInfo.meetingId, meetingInfo.originalTime);
        
        if (rescheduleResult.success) {
            console.log('✅ Reschedule completed successfully');
            
            // 6. Wait for notifications to be processed
            console.log('\n⏳ Waiting 10 seconds for notifications to be processed...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // 7. Check notifications after reschedule
            console.log('\n📋 Checking notifications after reschedule...');
            await checkNotifications(volunteerToken, 'volunteer');
            
        } else {
            console.log('❌ Reschedule failed:', rescheduleResult.error);
        }
        
        // 8. Clean up
        console.log('\n🧹 Cleaning up...');
        if (volunteerSocket) {
            volunteerSocket.disconnect();
        }
        
        // 9. Test direct sound system
        console.log('\n🔊 Testing direct sound system integration...');
        console.log('📝 To test sounds manually:');
        console.log('1. Open browser to http://localhost/tests/');
        console.log('2. Go to Sound Integration Test');
        console.log('3. Click "Simulate Real Notification" or "Meeting Rescheduled" buttons');
        console.log('4. Check browser console for sound events');
        console.log('5. Verify sounds are playing');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🏁 Debug test completed');
}

// Run the test
runDebugTest().then(() => {
    console.log('\n🎯 Next steps for debugging:');
    console.log('1. Check if Socket.IO events are being received in browser console');
    console.log('2. Verify sound system is loaded on volunteer dashboard');
    console.log('3. Test manual reschedule from volunteer dashboard');
    console.log('4. Check notification-sound-integration.js is working');
    console.log('5. Verify sound files are accessible');
    
    process.exit(0);
}).catch(error => {
    console.error('❌ Debug test error:', error);
    process.exit(1);
});
