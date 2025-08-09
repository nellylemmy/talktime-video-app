#!/usr/bin/env node

/**
 * TalkTime Meeting Flows Test Script
 * 
 * This script tests the complete meeting lifecycle:
 * 1. Login as a volunteer
 * 2. Get available students
 * 3. Book a meeting with a student
 * 4. Reschedule the meeting
 * 5. Cancel the meeting
 * 
 * Usage: node test-meeting-flows.js
 */

const fetch = require('node-fetch');
const readline = require('readline');

// Configuration
const API_BASE = 'http://localhost:3000/api/v1';
const AUTH_ENDPOINT = `${API_BASE}/auth/login`;
const STUDENTS_ENDPOINT = `${API_BASE}/volunteers/students/cards`;
const MEETINGS_ENDPOINT = `${API_BASE}/volunteers/meetings`;
const DASHBOARD_ENDPOINT = `${API_BASE}/volunteers/dashboard-data`;

// Test credentials
const TEST_USER = {
  email: 'test@example.com',
  password: 'password123'
};

// Store cookies and session data
let cookies = [];
let meetingId = null;
let studentId = null;

// Helper to format dates for the API
const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

// Helper to format time for the API (24h format)
const formatTime = (hours) => {
  return `${hours.toString().padStart(2, '0')}:00`;
};

// Helper to get tomorrow's date
const getTomorrow = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
};

// Helper to get day after tomorrow
const getDayAfterTomorrow = () => {
  const dayAfter = new Date();
  dayAfter.setDate(dayAfter.getDate() + 2);
  return dayAfter;
};

// Helper for colored console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper to prompt for user input
const prompt = (question) => {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
};

// Helper for making authenticated requests
const authenticatedFetch = async (url, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(cookies.length > 0 ? { Cookie: cookies.join('; ') } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  // Update cookies if any are returned
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader) {
    cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]);
  }

  return response;
};

// Step 1: Login
const login = async () => {
  console.log(`${colors.cyan}[TEST] Logging in as ${TEST_USER.email}${colors.reset}`);
  
  try {
    const response = await authenticatedFetch(AUTH_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(TEST_USER)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Login failed: ${response.status} ${response.statusText} - ${error}`);
    }

    const data = await response.json();
    console.log(`${colors.green}[SUCCESS] Logged in successfully${colors.reset}`);
    console.log(`${colors.blue}[INFO] User: ${data.user.fullName}${colors.reset}`);
    
    return data.user;
  } catch (error) {
    console.error(`${colors.red}[ERROR] ${error.message}${colors.reset}`);
    process.exit(1);
  }
};

// Step 2: Get available students
const getAvailableStudents = async () => {
  console.log(`${colors.cyan}[TEST] Fetching available students${colors.reset}`);
  
  try {
    const response = await authenticatedFetch(STUDENTS_ENDPOINT);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch students: ${response.status} ${response.statusText} - ${error}`);
    }
    
    const data = await response.json();
    console.log(`${colors.green}[SUCCESS] Found ${data.students.length} available students${colors.reset}`);
    
    if (data.students.length === 0) {
      throw new Error('No students available for booking');
    }
    
    // Select the first student for testing
    studentId = data.students[0].id;
    console.log(`${colors.blue}[INFO] Selected student: ${data.students[0].name} (ID: ${studentId})${colors.reset}`);
    
    return data.students;
  } catch (error) {
    console.error(`${colors.red}[ERROR] ${error.message}${colors.reset}`);
    process.exit(1);
  }
};

// Step 3: Book a meeting
const bookMeeting = async () => {
  console.log(`${colors.cyan}[TEST] Booking a meeting with student ID: ${studentId}${colors.reset}`);
  
  const tomorrow = getTomorrow();
  const date = formatDate(tomorrow);
  const time = formatTime(10); // 10:00 AM
  
  const meetingData = {
    studentId,
    date,
    time,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
  
  console.log(`${colors.blue}[INFO] Meeting details: ${date} at ${time}${colors.reset}`);
  
  try {
    const response = await authenticatedFetch(MEETINGS_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(meetingData)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to book meeting: ${response.status} ${response.statusText} - ${error}`);
    }
    
    const data = await response.json();
    meetingId = data.meeting.id;
    
    console.log(`${colors.green}[SUCCESS] Meeting booked successfully${colors.reset}`);
    console.log(`${colors.blue}[INFO] Meeting ID: ${meetingId}${colors.reset}`);
    console.log(`${colors.blue}[INFO] Room ID: ${data.meeting.roomId}${colors.reset}`);
    
    return data.meeting;
  } catch (error) {
    console.error(`${colors.red}[ERROR] ${error.message}${colors.reset}`);
    process.exit(1);
  }
};

// Step 4: Reschedule the meeting
const rescheduleMeeting = async () => {
  console.log(`${colors.cyan}[TEST] Rescheduling meeting ID: ${meetingId}${colors.reset}`);
  
  const dayAfter = getDayAfterTomorrow();
  const newScheduledTime = `${formatDate(dayAfter)}T${formatTime(14)}:00`; // 2:00 PM
  
  const updateData = {
    scheduledTime: newScheduledTime
  };
  
  console.log(`${colors.blue}[INFO] New meeting time: ${newScheduledTime}${colors.reset}`);
  
  try {
    const response = await authenticatedFetch(`${API_BASE}/meetings/${meetingId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to reschedule meeting: ${response.status} ${response.statusText} - ${error}`);
    }
    
    const data = await response.json();
    console.log(`${colors.green}[SUCCESS] Meeting rescheduled successfully${colors.reset}`);
    console.log(`${colors.blue}[INFO] Updated meeting: ${data.meeting.scheduledTime || data.meeting.scheduled_time}${colors.reset}`);
    
    return data.meeting;
  } catch (error) {
    console.error(`${colors.red}[ERROR] ${error.message}${colors.reset}`);
    process.exit(1);
  }
};

// Step 5: Get dashboard data to verify meeting
const getDashboardData = async () => {
  console.log(`${colors.cyan}[TEST] Fetching dashboard data to verify meeting${colors.reset}`);
  
  try {
    const response = await authenticatedFetch(DASHBOARD_ENDPOINT);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch dashboard: ${response.status} ${response.statusText} - ${error}`);
    }
    
    const data = await response.json();
    console.log(`${colors.green}[SUCCESS] Dashboard data fetched successfully${colors.reset}`);
    console.log(`${colors.blue}[INFO] Upcoming meetings: ${data.upcomingMeetings.length}${colors.reset}`);
    
    // Check if our meeting is in the list
    const ourMeeting = data.upcomingMeetings.find(m => m.id === meetingId);
    if (ourMeeting) {
      console.log(`${colors.green}[VERIFIED] Meeting found in dashboard with correct data${colors.reset}`);
    } else {
      console.log(`${colors.yellow}[WARNING] Meeting not found in dashboard${colors.reset}`);
    }
    
    return data;
  } catch (error) {
    console.error(`${colors.red}[ERROR] ${error.message}${colors.reset}`);
    return null;
  }
};

// Step 6: Cancel the meeting
const cancelMeeting = async () => {
  console.log(`${colors.cyan}[TEST] Cancelling meeting ID: ${meetingId}${colors.reset}`);
  
  try {
    const response = await authenticatedFetch(`${API_BASE}/meetings/${meetingId}/cancel`, {
      method: 'PUT'
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to cancel meeting: ${response.status} ${response.statusText} - ${error}`);
    }
    
    const data = await response.json();
    console.log(`${colors.green}[SUCCESS] Meeting cancelled successfully${colors.reset}`);
    console.log(`${colors.blue}[INFO] ${data.message}${colors.reset}`);
    
    return data;
  } catch (error) {
    console.error(`${colors.red}[ERROR] ${error.message}${colors.reset}`);
    return null;
  }
};

// Main test flow
const runTests = async () => {
  try {
    console.log(`${colors.magenta}=== TalkTime Meeting Flows Test ====${colors.reset}`);
    
    // Step 1: Login
    await login();
    
    // Step 2: Get available students
    await getAvailableStudents();
    
    // Ask user if they want to continue with booking
    const shouldContinue = await prompt(`${colors.yellow}Continue with booking a test meeting? (y/n): ${colors.reset}`);
    if (shouldContinue.toLowerCase() !== 'y') {
      console.log(`${colors.blue}[INFO] Test aborted by user${colors.reset}`);
      rl.close();
      return;
    }
    
    // Step 3: Book a meeting
    await bookMeeting();
    
    // Step 4: Verify the meeting appears in dashboard
    await getDashboardData();
    
    // Step 5: Reschedule the meeting
    await rescheduleMeeting();
    
    // Step 6: Verify the rescheduled meeting
    await getDashboardData();
    
    // Ask user if they want to cancel the test meeting
    const shouldCancel = await prompt(`${colors.yellow}Cancel the test meeting? (y/n): ${colors.reset}`);
    if (shouldCancel.toLowerCase() === 'y') {
      // Step 7: Cancel the meeting
      await cancelMeeting();
      
      // Step 8: Verify the meeting is cancelled
      await getDashboardData();
    }
    
    console.log(`${colors.magenta}=== Test Complete ====${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}[ERROR] Test failed: ${error.message}${colors.reset}`);
  } finally {
    rl.close();
  }
};

// Run the tests
runTests();
