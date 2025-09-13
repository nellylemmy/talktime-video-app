#!/usr/bin/env node

/**
 * Test script to debug reschedule notification creation
 * This simulates a reschedule and monitors the process
 */

const path = require('path');

// API Configuration
const API_BASE = 'http://localhost/api/v1';

/**
 * Test the reschedule process for meeting 106
 */
async function testRescheduleProcess() {
    console.log('🔍 Testing Reschedule Process Debug');
    console.log('=====================================\n');

    try {
        // First, let's get the current state of meeting 106
        console.log('📊 Step 1: Getting current meeting state...');
        
        // Since we need authentication, let's test with a different approach
        // Let's check the backend logs while we reschedule manually
        
        console.log('📋 Current Meeting 106 Info:');
        console.log('- Meeting ID: 106');
        console.log('- Volunteer ID: 53 (sara@mail.com)');
        console.log('- Student ID: 23');
        console.log('- Current reschedule count: 21');
        console.log('- Current time: 2025-09-12 13:00:00+00');
        
        console.log('\n🚀 Manual Test Instructions:');
        console.log('1. Open http://localhost/volunteer/dashboard/students.html');
        console.log('2. Find the student with ID 23');
        console.log('3. Click to reschedule meeting 106');
        console.log('4. Change the time to a different time');
        console.log('5. Submit the reschedule');
        console.log('6. Watch the backend logs with: docker logs talktime_backend_dev --follow');
        
        console.log('\n🔍 What to look for in logs:');
        console.log('- "DEBUG: Calling createRescheduleNotification"');
        console.log('- "📅 Creating reschedule notifications for meeting 106"');
        console.log('- "✅ Reschedule notifications sent to both student 23 and volunteer 53"');
        console.log('- Any error messages in the createRescheduleNotification function');
        
        console.log('\n📝 After reschedule, run this to check notifications:');
        console.log('docker exec -it talktime_db_dev psql -U user -d talktimedb_dev -c "SELECT id, user_id, recipient_id, meeting_id, type, title, created_at FROM notifications WHERE (user_id = 53 OR recipient_id = 53) OR meeting_id = 106 ORDER BY created_at DESC LIMIT 5;"');
        
    } catch (error) {
        console.error('❌ Error during test:', error);
    }
}

/**
 * Check for common issues in the notification system
 */
async function checkNotificationSystemHealth() {
    console.log('\n🏥 Notification System Health Check');
    console.log('===================================\n');
    
    console.log('✅ Things to verify:');
    console.log('1. Backend container is running: docker ps | grep backend');
    console.log('2. Database is accessible: docker exec -it talktime_db_dev psql -U user -d talktimedb_dev -c "SELECT COUNT(*) FROM notifications;"');
    console.log('3. Socket.IO is working: Check browser console for socket connections');
    console.log('4. JWT authentication is working: Check /volunteer/notifications.html loads correctly');
    
    console.log('\n🐛 Common Issues:');
    console.log('- notificationService import missing in meetingController.js');
    console.log('- Database connection issues');
    console.log('- Incorrect user ID handling (snake_case vs camelCase)');
    console.log('- Socket.IO not properly initialized');
    console.log('- JWT token issues preventing API calls');
    
    console.log('\n📋 Debug Steps:');
    console.log('1. Check if notificationService.sendNotification is working');
    console.log('2. Verify database schema has recipient_id and user_id columns');
    console.log('3. Check if createRescheduleNotification function is actually called');
    console.log('4. Monitor real-time Socket.IO events');
}

// Run the tests
async function main() {
    await testRescheduleProcess();
    await checkNotificationSystemHealth();
    
    console.log('\n🎯 Next Steps:');
    console.log('1. Perform a manual reschedule while monitoring logs');
    console.log('2. Check if notifications are created in database');
    console.log('3. If notifications are created but not showing, check frontend API calls');
    console.log('4. If notifications are not created, debug the createRescheduleNotification function');
}

main().catch(console.error);
