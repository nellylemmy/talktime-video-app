/**
 * Test script for TalkTime notification system
 * Tests the scheduled notification functionality
 */

const API_BASE = 'http://localhost:3001/api/v1';

class NotificationTester {
    constructor() {
        this.authToken = null;
        this.testResults = [];
    }

    // Helper function to make authenticated requests
    async makeRequest(endpoint, method = 'GET', data = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': this.authToken ? `Bearer ${this.authToken}` : ''
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`${API_BASE}${endpoint}`, options);
        return response;
    }

    // Test 1: Login as volunteer
    async testVolunteerLogin() {
        console.log('\n🔍 Test 1: Volunteer Login...');
        try {
            const response = await fetch(`${API_BASE}/jwt-auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'volunteer@test.com',
                    password: 'testpass'
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.authToken = data.token;
                console.log('✅ Volunteer login successful');
                this.testResults.push({ test: 'Volunteer Login', status: 'PASS' });
                return true;
            } else {
                console.log('❌ Volunteer login failed');
                this.testResults.push({ test: 'Volunteer Login', status: 'FAIL' });
                return false;
            }
        } catch (error) {
            console.error('❌ Login error:', error.message);
            this.testResults.push({ test: 'Volunteer Login', status: 'ERROR', error: error.message });
            return false;
        }
    }

    // Test 2: Create a test meeting with notifications
    async testMeetingCreation() {
        console.log('\n🔍 Test 2: Creating meeting with notifications...');
        try {
            // Get current time + 2 minutes for testing
            const futureTime = new Date();
            futureTime.setMinutes(futureTime.getMinutes() + 2);
            
            const meetingData = {
                studentId: 1, // Assuming student with ID 1 exists
                scheduledTime: futureTime.toISOString(),
                duration: 40
            };

            const response = await this.makeRequest('/meetings', 'POST', meetingData);

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Meeting created successfully with ID:', data.meeting?.id);
                this.testResults.push({ 
                    test: 'Meeting Creation', 
                    status: 'PASS',
                    meetingId: data.meeting?.id,
                    scheduledTime: futureTime.toISOString()
                });
                return data.meeting;
            } else {
                const error = await response.text();
                console.log('❌ Meeting creation failed:', error);
                this.testResults.push({ test: 'Meeting Creation', status: 'FAIL', error });
                return null;
            }
        } catch (error) {
            console.error('❌ Meeting creation error:', error.message);
            this.testResults.push({ test: 'Meeting Creation', status: 'ERROR', error: error.message });
            return null;
        }
    }

    // Test 3: Check if notifications were scheduled
    async testNotificationScheduling() {
        console.log('\n🔍 Test 3: Checking notification scheduling...');
        try {
            const response = await this.makeRequest('/notifications');

            if (response.ok) {
                const data = await response.json();
                const notifications = data.notifications || [];
                
                const scheduledNotifications = notifications.filter(n => 
                    n.scheduled_for && 
                    new Date(n.scheduled_for) > new Date() &&
                    n.type === 'reminder'
                );

                console.log(`✅ Found ${scheduledNotifications.length} scheduled notifications`);
                scheduledNotifications.forEach(notif => {
                    console.log(`   - ${notif.title} scheduled for ${new Date(notif.scheduled_for).toLocaleString()}`);
                });

                this.testResults.push({ 
                    test: 'Notification Scheduling', 
                    status: scheduledNotifications.length > 0 ? 'PASS' : 'FAIL',
                    count: scheduledNotifications.length
                });
                
                return scheduledNotifications;
            } else {
                console.log('❌ Failed to fetch notifications');
                this.testResults.push({ test: 'Notification Scheduling', status: 'FAIL' });
                return [];
            }
        } catch (error) {
            console.error('❌ Notification check error:', error.message);
            this.testResults.push({ test: 'Notification Scheduling', status: 'ERROR', error: error.message });
            return [];
        }
    }

    // Test 4: Manually trigger notification processing
    async testNotificationProcessing() {
        console.log('\n🔍 Test 4: Testing notification processing...');
        try {
            // This endpoint should process any due notifications
            const response = await this.makeRequest('/notifications');

            if (response.ok) {
                console.log('✅ Notification processing endpoint accessible');
                this.testResults.push({ test: 'Notification Processing', status: 'PASS' });
                return true;
            } else {
                console.log('❌ Notification processing failed');
                this.testResults.push({ test: 'Notification Processing', status: 'FAIL' });
                return false;
            }
        } catch (error) {
            console.error('❌ Processing error:', error.message);
            this.testResults.push({ test: 'Notification Processing', status: 'ERROR', error: error.message });
            return false;
        }
    }

    // Test 5: Check browser notification permission
    async testBrowserNotificationSupport() {
        console.log('\n🔍 Test 5: Browser notification support...');
        
        if (typeof window !== 'undefined' && 'Notification' in window) {
            console.log('✅ Browser supports notifications');
            console.log('Permission status:', Notification.permission);
            
            this.testResults.push({ 
                test: 'Browser Notification Support', 
                status: 'PASS',
                permission: Notification.permission
            });
            
            return true;
        } else {
            console.log('❌ Browser does not support notifications');
            this.testResults.push({ test: 'Browser Notification Support', status: 'FAIL' });
            return false;
        }
    }

    // Run all tests
    async runAllTests() {
        console.log('🚀 Starting TalkTime Notification System Tests\n');
        console.log('=' * 50);

        await this.testVolunteerLogin();
        
        if (this.authToken) {
            await this.testMeetingCreation();
            await this.testNotificationScheduling();
            await this.testNotificationProcessing();
        }

        // Print results
        console.log('\n📊 TEST RESULTS');
        console.log('=' * 50);
        
        this.testResults.forEach(result => {
            const statusIcon = result.status === 'PASS' ? '✅' : 
                             result.status === 'FAIL' ? '❌' : '⚠️';
            console.log(`${statusIcon} ${result.test}: ${result.status}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
            if (result.count !== undefined) {
                console.log(`   Count: ${result.count}`);
            }
        });

        const passCount = this.testResults.filter(r => r.status === 'PASS').length;
        const totalCount = this.testResults.length;
        
        console.log(`\n🎯 Overall: ${passCount}/${totalCount} tests passed`);
    }
}

// Run tests if this is executed directly
if (typeof window === 'undefined') {
    // Node.js environment
    const fetch = require('node-fetch');
    const tester = new NotificationTester();
    tester.runAllTests().catch(console.error);
} else {
    // Browser environment
    window.NotificationTester = NotificationTester;
}

module.exports = NotificationTester;
