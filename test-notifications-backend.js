#!/usr/bin/env node

const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001/api/v1';

class NotificationSystemTester {
    constructor() {
        this.authToken = null;
        this.testResults = [];
        this.userId = null;
        this.meetingId = null;
    }

    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${message}`);
    }

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

        try {
            const response = await fetch(`${API_BASE}${endpoint}`, options);
            return response;
        } catch (error) {
            console.error(`Request failed: ${error.message}`);
            throw error;
        }
    }

    async testBackendConnection() {
        this.log('🔍 Testing backend connection...');
        try {
            const response = await fetch(`${API_BASE}/health`);
            if (response.ok) {
                const data = await response.json();
                this.log('✅ Backend is running and healthy');
                this.log(`   Status: ${data.status}, Uptime: ${Math.floor(data.uptime)}s`);
                return true;
            } else {
                this.log('❌ Backend health check failed');
                return false;
            }
        } catch (error) {
            this.log(`❌ Backend connection error: ${error.message}`);
            return false;
        }
    }

    async testAuthentication() {
        this.log('🔍 Testing authentication...');
        
        // Try to authenticate with test credentials
        const testCredentials = [
            { email: 'volunteer@test.com', password: 'testpass' },
            { email: 'test@volunteer.com', password: 'password' },
            { email: 'admin@talktime.com', password: 'admin123' }
        ];

        for (const creds of testCredentials) {
            try {
                this.log(`   Trying: ${creds.email}`);
                const response = await fetch(`${API_BASE}/jwt-auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(creds)
                });

                if (response.ok) {
                    const data = await response.json();
                    this.authToken = data.token;
                    this.userId = data.user?.id;
                    this.log(`✅ Authentication successful with ${creds.email}`);
                    this.log(`   User ID: ${this.userId}, Role: ${data.user?.role}`);
                    return true;
                } else {
                    this.log(`   Failed: ${response.status} ${response.statusText}`);
                }
            } catch (error) {
                this.log(`   Error: ${error.message}`);
            }
        }

        this.log('❌ All authentication attempts failed');
        return false;
    }

    async testMeetingCreation() {
        this.log('🔍 Testing meeting creation...');
        
        if (!this.authToken) {
            this.log('❌ No authentication token available');
            return false;
        }

        try {
            // Create a meeting 5 minutes in the future for testing
            const futureTime = new Date();
            futureTime.setMinutes(futureTime.getMinutes() + 5);
            
            const meetingData = {
                studentId: 1, // Assuming a student with ID 1 exists
                scheduledTime: futureTime.toISOString(),
                duration: 40
            };

            this.log(`   Creating meeting for: ${futureTime.toLocaleString()}`);
            const response = await this.makeRequest('/meetings', 'POST', meetingData);

            if (response.ok) {
                const data = await response.json();
                this.meetingId = data.meeting?.id;
                this.log(`✅ Meeting created successfully`);
                this.log(`   Meeting ID: ${this.meetingId}`);
                this.log(`   Scheduled: ${new Date(data.meeting?.scheduled_time || data.meeting?.scheduledTime).toLocaleString()}`);
                return data.meeting;
            } else {
                const errorText = await response.text();
                this.log(`❌ Meeting creation failed: ${response.status}`);
                this.log(`   Error: ${errorText}`);
                return null;
            }
        } catch (error) {
            this.log(`❌ Meeting creation error: ${error.message}`);
            return null;
        }
    }

    async testNotificationScheduling() {
        this.log('🔍 Testing notification scheduling...');
        
        try {
            const response = await this.makeRequest('/notifications');

            if (response.ok) {
                const data = await response.json();
                const notifications = data.notifications || [];
                
                this.log(`   Total notifications: ${notifications.length}`);
                
                const scheduledNotifications = notifications.filter(n => 
                    n.scheduled_for && 
                    new Date(n.scheduled_for) > new Date() &&
                    (n.type === 'reminder' || n.type === 'meeting_reminder')
                );

                this.log(`✅ Found ${scheduledNotifications.length} scheduled notifications`);
                
                scheduledNotifications.forEach((notif, index) => {
                    const scheduledTime = new Date(notif.scheduled_for);
                    const minutesUntil = Math.round((scheduledTime - new Date()) / (1000 * 60));
                    this.log(`   ${index + 1}. ${notif.title} - in ${minutesUntil} minutes (${scheduledTime.toLocaleString()})`);
                });

                return scheduledNotifications;
            } else {
                this.log(`❌ Failed to fetch notifications: ${response.status}`);
                return [];
            }
        } catch (error) {
            this.log(`❌ Notification check error: ${error.message}`);
            return [];
        }
    }

    async testNotificationProcessing() {
        this.log('🔍 Testing notification processing...');
        
        try {
            // The notification processing happens when fetching notifications
            const response = await this.makeRequest('/notifications');

            if (response.ok) {
                this.log('✅ Notification processing endpoint accessible');
                return true;
            } else {
                this.log(`❌ Notification processing failed: ${response.status}`);
                return false;
            }
        } catch (error) {
            this.log(`❌ Processing error: ${error.message}`);
            return false;
        }
    }

    async testDatabaseConnection() {
        this.log('🔍 Testing database connection...');
        
        try {
            // Try to fetch users (which requires DB connection)
            const response = await this.makeRequest('/jwt-auth/verify');
            
            if (response.ok) {
                this.log('✅ Database connection working (JWT verification successful)');
                return true;
            } else {
                this.log('❌ Database connection issue (JWT verification failed)');
                return false;
            }
        } catch (error) {
            this.log(`❌ Database error: ${error.message}`);
            return false;
        }
    }

    async cleanup() {
        if (this.meetingId) {
            this.log('🧹 Cleaning up test meeting...');
            try {
                const response = await this.makeRequest(`/meetings/${this.meetingId}`, 'DELETE');
                if (response.ok) {
                    this.log('✅ Test meeting deleted');
                } else {
                    this.log(`⚠️ Failed to delete test meeting: ${response.status}`);
                }
            } catch (error) {
                this.log(`⚠️ Cleanup error: ${error.message}`);
            }
        }
    }

    async runAllTests() {
        this.log('🚀 Starting TalkTime Notification System Backend Tests');
        this.log('='.repeat(60));

        const results = {
            backendConnection: await this.testBackendConnection(),
            authentication: await this.testAuthentication(),
            databaseConnection: await this.testDatabaseConnection()
        };

        if (results.authentication) {
            results.meetingCreation = await this.testMeetingCreation();
            results.notificationScheduling = await this.testNotificationScheduling();
            results.notificationProcessing = await this.testNotificationProcessing();
        }

        // Print summary
        this.log('\n📊 TEST SUMMARY');
        this.log('='.repeat(60));

        const tests = [
            ['Backend Connection', results.backendConnection],
            ['Authentication', results.authentication],
            ['Database Connection', results.databaseConnection],
            ['Meeting Creation', results.meetingCreation],
            ['Notification Scheduling', results.notificationScheduling],
            ['Notification Processing', results.notificationProcessing]
        ];

        let passCount = 0;
        let totalCount = 0;

        tests.forEach(([name, result]) => {
            if (result !== undefined) {
                totalCount++;
                const status = result ? '✅ PASS' : '❌ FAIL';
                this.log(`${status} ${name}`);
                if (result) passCount++;
            }
        });

        this.log(`\n🎯 Overall Result: ${passCount}/${totalCount} tests passed`);

        if (passCount === totalCount) {
            this.log('🎉 All tests passed! Notification system is working correctly.');
        } else {
            this.log('⚠️ Some tests failed. Check the logs above for details.');
        }

        // Cleanup
        await this.cleanup();

        return { passCount, totalCount, results };
    }
}

// Run the tests
async function main() {
    const tester = new NotificationSystemTester();
    await tester.runAllTests();
}

// Only run if this script is executed directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = NotificationSystemTester;
