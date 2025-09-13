import axios from 'axios';

/**
 * Real Meeting Scenario Test
 * Creates actual meeting between maina@mail.com (volunteer) and neleki96 (student)
 * Tests complete flow in production-like environment
 */

const API_BASE = 'http://localhost:3000/api/v1';

async function createTestUsers() {
    console.log('🔧 Creating test users for real meeting scenario...');
    
    try {
        // Create volunteer user - maina@mail.com
        const volunteerResponse = await axios.post(`${API_BASE}/auth/register`, {
            email: 'maina@mail.com',
            password: 'neleki96',
            username: 'maina',
            role: 'volunteer',
            firstName: 'Maina',
            lastName: 'Teacher',
            phoneNumber: '+254701234567',
            timezone: 'Africa/Nairobi'
        });
        
        console.log('✅ Volunteer user created:', volunteerResponse.data);
        
        // Create student user - neleki96
        const studentResponse = await axios.post(`${API_BASE}/auth/register`, {
            email: 'neleki96@example.com',
            password: 'neleki96',
            username: 'neleki96',
            role: 'student',
            firstName: 'Nelson',
            lastName: 'Student',
            phoneNumber: '+254709876543',
            timezone: 'Africa/Nairobi'
        });
        
        console.log('✅ Student user created:', studentResponse.data);
        
        return {
            volunteer: volunteerResponse.data,
            student: studentResponse.data
        };
        
    } catch (error) {
        if (error.response?.status === 400 && error.response?.data?.message?.includes('already exists')) {
            console.log('ℹ️ Users already exist, proceeding with existing accounts');
            return await loginTestUsers();
        }
        console.error('❌ Error creating test users:', error.response?.data || error.message);
        throw error;
    }
}

async function loginTestUsers() {
    console.log('🔐 Logging in test users...');
    
    try {
        // Login volunteer
        const volunteerLogin = await axios.post(`${API_BASE}/auth/login`, {
            email: 'maina@mail.com',
            password: 'neleki96'
        });
        
        // Login student
        const studentLogin = await axios.post(`${API_BASE}/auth/login`, {
            email: 'neleki96@example.com',
            password: 'neleki96'
        });
        
        console.log('✅ Both users logged in successfully');
        
        return {
            volunteer: volunteerLogin.data,
            student: studentLogin.data
        };
        
    } catch (error) {
        console.error('❌ Error logging in test users:', error.response?.data || error.message);
        throw error;
    }
}

async function createTestMeeting(users) {
    console.log('📅 Creating test meeting for 5 minutes from now...');
    
    try {
        // Calculate meeting time - 5 minutes from now
        const meetingDate = new Date();
        meetingDate.setMinutes(meetingDate.getMinutes() + 5);
        
        const meetingData = {
            studentId: users.student.user.id,
            volunteerId: users.volunteer.user.id,
            scheduledAt: meetingDate.toISOString(),
            duration: 40, // 40 minutes
            topic: 'Real Meeting Test - Notification & Timer Flow',
            status: 'scheduled'
        };
        
        // Create meeting using volunteer's token
        const response = await axios.post(`${API_BASE}/meetings`, meetingData, {
            headers: {
                'Authorization': `Bearer ${users.volunteer.token}`
            }
        });
        
        console.log('✅ Test meeting created:', {
            meetingId: response.data.id,
            scheduledAt: meetingDate.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }),
            participants: {
                volunteer: 'maina@mail.com',
                student: 'neleki96'
            }
        });
        
        return response.data;
        
    } catch (error) {
        console.error('❌ Error creating test meeting:', error.response?.data || error.message);
        throw error;
    }
}

async function scheduleNotifications(meeting, users) {
    console.log('🔔 Scheduling meeting notifications...');
    
    try {
        // Create notifications for both participants
        const notifications = [
            {
                userId: meeting.studentId,
                type: 'meeting_reminder_5min',
                title: 'Meeting Starting Soon!',
                message: `Your English practice session with ${users.volunteer.user.firstName} starts in 5 minutes`,
                meetingId: meeting.id,
                scheduledFor: new Date(new Date(meeting.scheduledAt).getTime() - 5 * 60 * 1000), // 5 min before
                isRead: false
            },
            {
                userId: meeting.volunteerId,
                type: 'meeting_reminder_5min',
                title: 'Meeting Starting Soon!',
                message: `Your teaching session with ${users.student.user.firstName} starts in 5 minutes`,
                meetingId: meeting.id,
                scheduledFor: new Date(new Date(meeting.scheduledAt).getTime() - 5 * 60 * 1000), // 5 min before
                isRead: false
            }
        ];
        
        for (const notification of notifications) {
            const response = await axios.post(`${API_BASE}/notifications`, notification, {
                headers: {
                    'Authorization': `Bearer ${users.volunteer.token}`
                }
            });
            console.log(`📮 Notification scheduled for ${notification.userId === meeting.studentId ? 'student' : 'volunteer'}`);
        }
        
        console.log('✅ All notifications scheduled successfully');
        
    } catch (error) {
        console.error('❌ Error scheduling notifications:', error.response?.data || error.message);
        throw error;
    }
}

async function testRealMeetingScenario() {
    console.log('\n🚀 Starting Real Meeting Scenario Test');
    console.log('=====================================\n');
    
    try {
        // Step 1: Create or login users
        const users = await createTestUsers();
        
        // Step 2: Create test meeting
        const meeting = await createTestMeeting(users);
        
        // Step 3: Schedule notifications
        await scheduleNotifications(meeting, users);
        
        console.log('\n🎉 Real Meeting Scenario Setup Complete!');
        console.log('=========================================');
        console.log('\n📋 Next Steps:');
        console.log('1. 🕐 Wait for notifications (5 minutes from now)');
        console.log('2. 📱 Check test interfaces for phone-like call experience:');
        console.log('   - http://localhost:8080/tests/phone-call-test.html');
        console.log('3. ⏱️ Test 40-minute timer:');
        console.log('   - http://localhost:8080/tests/timer-test.html');
        console.log('4. 🎥 Join actual video call:');
        console.log(`   - http://localhost:8080/call/call.html?meeting=${meeting.id}`);
        console.log('\n🔍 Monitor backend logs for scheduler activity:');
        console.log('   docker-compose logs -f backend');
        
        return {
            meeting,
            users,
            testUrls: {
                phoneCallTest: 'http://localhost:8080/tests/phone-call-test.html',
                timerTest: 'http://localhost:8080/tests/timer-test.html',
                actualCall: `http://localhost:8080/call/call.html?meeting=${meeting.id}`,
                meetingNotificationTest: 'http://localhost:8080/tests/meeting-notification-test.html'
            }
        };
        
    } catch (error) {
        console.error('\n❌ Real Meeting Scenario Test failed:', error.message);
        throw error;
    }
}

// Run the test
testRealMeetingScenario()
    .then((result) => {
        console.log('\n✨ Test setup completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Test setup failed:', error.message);
        process.exit(1);
    });
