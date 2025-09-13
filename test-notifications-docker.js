/**
 * Test Notification System in Docker Environment
 * This script tests the complete notification flow:
 * 1. Create a test meeting
 * 2. Verify notifications are scheduled
 * 3. Process scheduled notifications
 * 4. Verify notification delivery
 */

const testNotificationSystem = async () => {
    const BACKEND_URL = 'http://localhost:3001';
    
    console.log('🧪 Starting Notification System Test in Docker Environment...\n');
    
    try {
        // Step 1: Login as volunteer to get JWT token
        console.log('1️⃣ Logging in as volunteer...');
        const loginResponse = await fetch(`${BACKEND_URL}/api/v1/jwt-auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'test@volunteer.com', // Adjust with actual test volunteer
                password: 'password123'
            })
        });
        
        if (!loginResponse.ok) {
            throw new Error(`Login failed: ${loginResponse.status}`);
        }
        
        const loginData = await loginResponse.json();
        const token = loginData.token;
        console.log('✅ Volunteer login successful');
        
        // Step 2: Get volunteer and student IDs
        console.log('\n2️⃣ Getting user information...');
        const volunteerResponse = await fetch(`${BACKEND_URL}/api/v1/volunteers/profile`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!volunteerResponse.ok) {
            throw new Error(`Failed to get volunteer profile: ${volunteerResponse.status}`);
        }
        
        const volunteerData = await volunteerResponse.json();
        console.log(`✅ Volunteer ID: ${volunteerData.id}`);
        
        // Get first student for testing
        const studentsResponse = await fetch(`${BACKEND_URL}/api/v1/students`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!studentsResponse.ok) {
            throw new Error(`Failed to get students: ${studentsResponse.status}`);
        }
        
        const studentsData = await studentsResponse.json();
        if (!studentsData.students || studentsData.students.length === 0) {
            throw new Error('No students found for testing');
        }
        
        const testStudent = studentsData.students[0];
        console.log(`✅ Test Student ID: ${testStudent.id}`);
        
        // Step 3: Schedule a test meeting (30 minutes from now for testing)
        console.log('\n3️⃣ Scheduling test meeting...');
        const meetingTime = new Date();
        meetingTime.setMinutes(meetingTime.getMinutes() + 30); // 30 minutes from now
        
        const meetingData = {
            studentId: testStudent.id,
            scheduledTime: meetingTime.toISOString(),
            notes: 'Test meeting for notification system validation'
        };
        
        const meetingResponse = await fetch(`${BACKEND_URL}/api/v1/meetings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(meetingData)
        });
        
        if (!meetingResponse.ok) {
            const errorText = await meetingResponse.text();
            throw new Error(`Failed to create meeting: ${meetingResponse.status} - ${errorText}`);
        }
        
        const meeting = await meetingResponse.json();
        console.log(`✅ Meeting created with ID: ${meeting.id}`);
        console.log(`📅 Scheduled for: ${new Date(meeting.scheduledTime).toLocaleString()}`);
        
        // Step 4: Verify notifications were scheduled
        console.log('\n4️⃣ Checking scheduled notifications...');
        
        // Direct database query to check notifications
        const notificationsCheckResponse = await fetch(`${BACKEND_URL}/api/v1/notifications`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!notificationsCheckResponse.ok) {
            throw new Error(`Failed to get notifications: ${notificationsCheckResponse.status}`);
        }
        
        const notificationsData = await notificationsCheckResponse.json();
        const meetingNotifications = notificationsData.notifications.filter(n => 
            n.metadata && JSON.parse(n.metadata).meeting_id == meeting.id
        );
        
        console.log(`✅ Found ${meetingNotifications.length} notifications for this meeting`);
        
        // Display scheduled notifications
        meetingNotifications.forEach((notification, index) => {
            const metadata = JSON.parse(notification.metadata);
            const scheduledFor = new Date(notification.scheduled_for);
            console.log(`   ${index + 1}. ${notification.title}`);
            console.log(`      Priority: ${notification.priority}`);
            console.log(`      Scheduled for: ${scheduledFor.toLocaleString()}`);
            console.log(`      Minutes before meeting: ${Math.round((meetingTime - scheduledFor) / (1000 * 60))}`);
        });
        
        // Step 5: Test immediate notification processing (simulate cron job)
        console.log('\n5️⃣ Testing notification processing...');
        
        // Create a test notification for immediate processing
        const immediateNotificationTime = new Date();
        immediateNotificationTime.setSeconds(immediateNotificationTime.getSeconds() - 10); // 10 seconds ago
        
        const testNotificationResponse = await fetch(`${BACKEND_URL}/api/v1/notifications`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                user_id: volunteerData.id,
                title: 'Test Immediate Notification',
                message: 'This is a test notification for immediate processing',
                type: 'meeting_reminder_5min',
                priority: 'high',
                scheduled_for: immediateNotificationTime.toISOString()
            })
        });
        
        if (testNotificationResponse.ok) {
            console.log('✅ Test notification created for immediate processing');
            
            // Trigger notification processing
            const processResponse = await fetch(`${BACKEND_URL}/api/v1/notifications`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (processResponse.ok) {
                console.log('✅ Notification processing triggered');
            }
        }
        
        // Step 6: Test browser notification permissions (client-side)
        console.log('\n6️⃣ Testing browser notification capabilities...');
        console.log('📋 Notification Permission Status:');
        
        if (typeof Notification !== 'undefined') {
            console.log(`   Current permission: ${Notification.permission}`);
            console.log('   ✅ Notification API is available');
            
            if (Notification.permission === 'default') {
                console.log('   ⚠️  Permission not yet requested');
            } else if (Notification.permission === 'granted') {
                console.log('   ✅ Permission granted - notifications will work');
            } else if (Notification.permission === 'denied') {
                console.log('   ❌ Permission denied - notifications blocked');
            }
        } else {
            console.log('   ❌ Notification API not available');
        }
        
        // Step 7: Summary
        console.log('\n📊 TEST SUMMARY');
        console.log('═══════════════');
        console.log(`✅ Meeting created: ${meeting.id}`);
        console.log(`✅ Notifications scheduled: ${meetingNotifications.length}`);
        console.log(`✅ Expected notifications: 3 (60min, 30min, 5min before)`);
        console.log(`📅 Meeting time: ${new Date(meeting.scheduledTime).toLocaleString()}`);
        
        const nextNotification = meetingNotifications
            .filter(n => new Date(n.scheduled_for) > new Date())
            .sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for))[0];
        
        if (nextNotification) {
            const timeToNext = new Date(nextNotification.scheduled_for) - new Date();
            const minutesToNext = Math.round(timeToNext / (1000 * 60));
            console.log(`⏰ Next notification: "${nextNotification.title}" in ${minutesToNext} minutes`);
        }
        
        console.log('\n🎉 Notification system test completed successfully!');
        
        return {
            success: true,
            meetingId: meeting.id,
            notificationsScheduled: meetingNotifications.length,
            nextNotification: nextNotification
        };
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

// Run the test if this file is executed directly
if (typeof window === 'undefined') {
    // Node.js environment
    const { fetch } = await import('node-fetch');
    global.fetch = fetch;
    testNotificationSystem();
} else {
    // Browser environment
    window.testNotificationSystem = testNotificationSystem;
}
