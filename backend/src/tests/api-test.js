/**
 * TalkTime API Test Script
 * 
 * This script tests the TalkTime API endpoints to ensure they work correctly
 * with both web and mobile clients.
 */

import axios from 'axios';
import chalk from 'chalk';

// Base URL for API requests
const BASE_URL = 'http://localhost:3000/api/v1';

// Test credentials
const TEST_USER = {
  email: 'test@example.com',
  password: 'password123',
  fullName: 'Test User'
};

// Store session cookie
let sessionCookie = '';

/**
 * Helper function to make API requests
 */
async function makeRequest(method, endpoint, data = null, withAuth = false) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {};
  
  if (withAuth && sessionCookie) {
    headers.Cookie = sessionCookie;
  }
  
  try {
    const response = await axios({
      method,
      url,
      data,
      headers,
      withCredentials: true
    });
    
    // Store session cookie if it's in the response
    if (response.headers['set-cookie']) {
      sessionCookie = response.headers['set-cookie'][0];
    }
    
    return {
      success: true,
      data: response.data,
      status: response.status
    };
  } catch (error) {
    return {
      success: false,
      error: error.response ? error.response.data : error.message,
      status: error.response ? error.response.status : 500
    };
  }
}

/**
 * Test authentication endpoints
 */
async function testAuthEndpoints(chalk) {
  console.log(chalk.blue('\n=== Testing Authentication Endpoints ==='));
  
  // Test registration
  console.log(chalk.yellow('\nTesting registration...'));
  const registerResult = await makeRequest('post', '/auth/register', TEST_USER);
  console.log(registerResult.success 
    ? chalk.green(`✓ Registration successful (${registerResult.status})`) 
    : chalk.red(`✗ Registration failed: ${JSON.stringify(registerResult.error)}`));
  
  // Test login
  console.log(chalk.yellow('\nTesting login...'));
  const loginResult = await makeRequest('post', '/auth/login', {
    email: TEST_USER.email,
    password: TEST_USER.password
  });
  console.log(loginResult.success 
    ? chalk.green(`✓ Login successful (${loginResult.status})`) 
    : chalk.red(`✗ Login failed: ${JSON.stringify(loginResult.error)}`));
  
  // Test get current user
  console.log(chalk.yellow('\nTesting get current user...'));
  const meResult = await makeRequest('get', '/auth/me', null, true);
  console.log(meResult.success 
    ? chalk.green(`✓ Get current user successful (${meResult.status})`) 
    : chalk.red(`✗ Get current user failed: ${JSON.stringify(meResult.error)}`));
  
  return loginResult.success;
}

/**
 * Test student endpoints
 */
async function testStudentEndpoints(chalk) {
  console.log(chalk.blue('\n=== Testing Student Endpoints ==='));
  
  // Test get all students
  console.log(chalk.yellow('\nTesting get all students...'));
  const studentsResult = await makeRequest('get', '/students', null, true);
  console.log(studentsResult.success 
    ? chalk.green(`✓ Get all students successful (${studentsResult.status})`) 
    : chalk.red(`✗ Get all students failed: ${JSON.stringify(studentsResult.error)}`));
  
  // Test get available students
  console.log(chalk.yellow('\nTesting get available students...'));
  const availableStudentsResult = await makeRequest('get', '/students/available', null, true);
  console.log(availableStudentsResult.success 
    ? chalk.green(`✓ Get available students successful (${availableStudentsResult.status})`) 
    : chalk.red(`✗ Get available students failed: ${JSON.stringify(availableStudentsResult.error)}`));
  
  return studentsResult.success;
}

/**
 * Test meeting endpoints
 */
async function testMeetingEndpoints(chalk) {
  console.log(chalk.blue('\n=== Testing Meeting Endpoints ==='));
  
  // Test get all meetings
  console.log(chalk.yellow('\nTesting get all meetings...'));
  const meetingsResult = await makeRequest('get', '/meetings', null, true);
  console.log(meetingsResult.success 
    ? chalk.green(`✓ Get all meetings successful (${meetingsResult.status})`) 
    : chalk.red(`✗ Get all meetings failed: ${JSON.stringify(meetingsResult.error)}`));
  
  // Test create meeting (assuming we have a student ID)
  let studentId = null;
  try {
    const studentsResult = await makeRequest('get', '/students/available', null, true);
    if (studentsResult.success && studentsResult.data.students.length > 0) {
      studentId = studentsResult.data.students[0].id;
    }
  } catch (error) {
    console.log(chalk.red('Could not get student ID for meeting creation test'));
  }
  
  if (studentId) {
    console.log(chalk.yellow('\nTesting create meeting...'));
    const createMeetingResult = await makeRequest('post', '/meetings', {
      studentId,
      scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      duration: 40
    }, true);
    console.log(createMeetingResult.success 
      ? chalk.green(`✓ Create meeting successful (${createMeetingResult.status})`) 
      : chalk.red(`✗ Create meeting failed: ${JSON.stringify(createMeetingResult.error)}`));
    
    // If meeting creation was successful, test other meeting endpoints
    if (createMeetingResult.success && createMeetingResult.data.meeting) {
      const meetingId = createMeetingResult.data.meeting.id;
      
      // Test get meeting by ID
      console.log(chalk.yellow('\nTesting get meeting by ID...'));
      const getMeetingResult = await makeRequest('get', `/meetings/${meetingId}`, null, true);
      console.log(getMeetingResult.success 
        ? chalk.green(`✓ Get meeting by ID successful (${getMeetingResult.status})`) 
        : chalk.red(`✗ Get meeting by ID failed: ${JSON.stringify(getMeetingResult.error)}`));
      
      // Test update meeting
      console.log(chalk.yellow('\nTesting update meeting...'));
      const updateMeetingResult = await makeRequest('put', `/meetings/${meetingId}`, {
        duration: 60
      }, true);
      console.log(updateMeetingResult.success 
        ? chalk.green(`✓ Update meeting successful (${updateMeetingResult.status})`) 
        : chalk.red(`✗ Update meeting failed: ${JSON.stringify(updateMeetingResult.error)}`));
      
      // Test join meeting
      console.log(chalk.yellow('\nTesting join meeting...'));
      const joinMeetingResult = await makeRequest('get', `/meetings/${meetingId}/join`, null, true);
      console.log(joinMeetingResult.success 
        ? chalk.green(`✓ Join meeting successful (${joinMeetingResult.status})`) 
        : chalk.red(`✗ Join meeting failed: ${JSON.stringify(joinMeetingResult.error)}`));
      
      // Test cancel meeting
      console.log(chalk.yellow('\nTesting cancel meeting...'));
      const cancelMeetingResult = await makeRequest('delete', `/meetings/${meetingId}`, null, true);
      console.log(cancelMeetingResult.success 
        ? chalk.green(`✓ Cancel meeting successful (${cancelMeetingResult.status})`) 
        : chalk.red(`✗ Cancel meeting failed: ${JSON.stringify(cancelMeetingResult.error)}`));
    }
  } else {
    console.log(chalk.yellow('\nSkipping meeting creation tests (no student ID available)'));
  }
  
  return meetingsResult.success;
}

/**
 * Test volunteer dashboard endpoints
 */
async function testVolunteerDashboardEndpoints(chalk) {
  console.log(chalk.blue('\n=== Testing Volunteer Dashboard Endpoints ==='));
  
  // Test get dashboard data
  console.log(chalk.yellow('\nTesting get volunteer dashboard data...'));
  const dashboardResult = await makeRequest('get', '/volunteers/dashboard-data', null, true);
  console.log(dashboardResult.success 
    ? chalk.green(`✓ Get dashboard data successful (${dashboardResult.status})`) 
    : chalk.red(`✗ Get dashboard data failed: ${JSON.stringify(dashboardResult.error)}`));
  
  // Test get student cards
  console.log(chalk.yellow('\nTesting get student cards...'));
  const studentCardsResult = await makeRequest('get', '/volunteers/students/cards', null, true);
  console.log(studentCardsResult.success 
    ? chalk.green(`✓ Get student cards successful (${studentCardsResult.status})`) 
    : chalk.red(`✗ Get student cards failed: ${JSON.stringify(studentCardsResult.error)}`));
  
  return dashboardResult.success;
}

/**
 * Test notification endpoints
 */
async function testNotificationEndpoints(chalk) {
  console.log(chalk.blue('\n=== Testing Notification Endpoints ==='));
  
  // Test get user notifications
  console.log(chalk.yellow('\nTesting get user notifications...'));
  const notificationsResult = await makeRequest('get', '/notifications', null, true);
  console.log(notificationsResult.success 
    ? chalk.green(`✓ Get user notifications successful (${notificationsResult.status})`) 
    : chalk.red(`✗ Get user notifications failed: ${JSON.stringify(notificationsResult.error)}`));
  
  // Test mark notification as read (if we have notifications)
  if (notificationsResult.success && notificationsResult.data.notifications && notificationsResult.data.notifications.length > 0) {
    const notificationId = notificationsResult.data.notifications[0].id;
    
    console.log(chalk.yellow('\nTesting mark notification as read...'));
    const markReadResult = await makeRequest('put', `/notifications/${notificationId}/read`, null, true);
    console.log(markReadResult.success 
      ? chalk.green(`✓ Mark notification as read successful (${markReadResult.status})`) 
      : chalk.red(`✗ Mark notification as read failed: ${JSON.stringify(markReadResult.error)}`));
  } else {
    console.log(chalk.yellow('\nSkipping mark notification as read test (no notifications available)'));
  }
  
  return notificationsResult.success;
}



/**
 * Test Swagger documentation
 */
async function testSwaggerDocs(chalk) {
  console.log(chalk.blue('\n=== Testing Swagger Documentation ==='));
  
  // Test access to Swagger docs
  console.log(chalk.yellow('\nTesting access to Swagger docs...'));
  const swaggerResult = await makeRequest('get', '/docs');
  console.log(swaggerResult.success 
    ? chalk.green(`✓ Access to Swagger docs successful (${swaggerResult.status})`) 
    : chalk.red(`✗ Access to Swagger docs failed: ${JSON.stringify(swaggerResult.error)}`));
  
  return swaggerResult.success;
}

/**
 * Run all tests
 */
async function runTests() {
  console.log(chalk.bgBlue.white('\n=== TalkTime API Test Suite ===\n'));
  
  // Test authentication endpoints first to get session cookie
  const authSuccess = await testAuthEndpoints(chalk);
  
  if (authSuccess) {
    // Test other endpoints if authentication was successful
    await testStudentEndpoints(chalk);
    await testMeetingEndpoints(chalk);
    await testNotificationEndpoints(chalk);
    await testVolunteerDashboardEndpoints(chalk);
    await testSwaggerDocs(chalk);
    
    console.log(chalk.green('\n✓ All tests completed!'));
  } else {
    console.log(chalk.red('\n✗ Authentication failed. Skipping other tests.'));
  }
  console.log(chalk.bgBlue.white('\n=== Test Suite Complete ===\n'));
}

// Run the tests
(async () => {
  try {
    await runTests();
  } catch (error) {
    console.error('Test suite error:', error);
  }
})();
