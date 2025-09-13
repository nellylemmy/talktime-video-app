import { createRescheduleNotification } from './backend/src/services/notificationService.js';

// Test creating a reschedule notification
async function testRescheduleNotification() {
    try {
        console.log('Creating reschedule notification...');
        
        await createRescheduleNotification({
            volunteer_id: 2, // sara
            student_id: 1,   // test student
            old_time: '2024-12-21 15:00:00',
            new_time: '2024-12-21 16:00:00',
            reschedule_reason: 'Testing frontend notifications',
            meeting_id: 123
        });
        
        console.log('✅ Reschedule notification created successfully');
        console.log('🔔 Check the volunteer notifications page at http://localhost/volunteer/notifications.html');
        console.log('🔔 Also check if the bell badge updated and if a real-time popup appeared');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating notification:', error);
        process.exit(1);
    }
}

testRescheduleNotification();
