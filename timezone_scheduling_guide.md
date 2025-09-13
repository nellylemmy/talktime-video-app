# Dynamic Timezone Meeting Scheduling with Node.js & PostgreSQL

## Overview

This guide shows how to build a production-ready meeting scheduling system where users can:
1. Choose their preferred timezone during signup
2. Schedule meetings with people in different timezones (e.g., Kenya)
3. Have meetings automatically adjust to their current location
4. Maintain accuracy whether they travel or not

## Core Architecture

### Libraries Required

```bash
npm install luxon pg bcrypt jsonwebtoken express
npm install --save-dev @types/node
```

**Key Libraries:**
- **Luxon**: Modern timezone handling
- **PostgreSQL**: Database with `timestamptz` support
- **Express**: API framework

## Database Schema

```sql
-- Users table with timezone preference
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    preferred_timezone VARCHAR(100) NOT NULL, -- IANA timezone like 'America/New_York'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meetings table
CREATE TABLE meetings (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    host_id INTEGER REFERENCES users(id),
    participant_id INTEGER REFERENCES users(id),
    
    -- Core scheduling fields
    scheduled_at TIMESTAMPTZ NOT NULL,           -- Always stored in UTC
    scheduled_timezone VARCHAR(100) NOT NULL,    -- Original timezone it was scheduled for
    duration_minutes INTEGER DEFAULT 60,
    
    -- Meeting details
    status VARCHAR(20) DEFAULT 'scheduled',      -- scheduled, completed, cancelled
    meeting_link VARCHAR(500),                   -- Zoom, Meet, etc.
    
    -- Tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timezone tracking for users (optional - tracks user's current location)
CREATE TABLE user_timezone_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    timezone VARCHAR(100) NOT NULL,
    detected_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_meetings_scheduled_at ON meetings(scheduled_at);
CREATE INDEX idx_meetings_host_id ON meetings(host_id);
CREATE INDEX idx_meetings_participant_id ON meetings(participant_id);
```

## Core Implementation

### 1. User Registration with Timezone Selection

```javascript
// controllers/authController.js
const { DateTime } = require('luxon');
const bcrypt = require('bcrypt');

// Get list of common timezones for signup form
const getCommonTimezones = () => {
  return [
    { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
    { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
    { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
    { value: 'Europe/London', label: 'London' },
    { value: 'Europe/Paris', label: 'Paris, Berlin, Rome' },
    { value: 'Africa/Nairobi', label: 'Nairobi, Kenya' },
    { value: 'Asia/Dubai', label: 'Dubai' },
    { value: 'Asia/Kolkata', label: 'Mumbai, Delhi, Kolkata' },
    { value: 'Asia/Shanghai', label: 'Beijing, Shanghai' },
    { value: 'Asia/Tokyo', label: 'Tokyo' },
    { value: 'Australia/Sydney', label: 'Sydney' },
  ];
};

const registerUser = async (req, res) => {
  try {
    const { email, password, firstName, lastName, preferredTimezone } = req.body;
    
    // Validate timezone
    if (!DateTime.now().setZone(preferredTimezone).isValid) {
      return res.status(400).json({ error: 'Invalid timezone' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Create user
    const query = `
      INSERT INTO users (email, password_hash, first_name, last_name, preferred_timezone) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING id, email, first_name, last_name, preferred_timezone
    `;
    
    const result = await db.query(query, [
      email, passwordHash, firstName, lastName, preferredTimezone
    ]);
    
    const user = result.rows[0];
    
    // Log initial timezone
    await db.query(
      'INSERT INTO user_timezone_history (user_id, timezone) VALUES ($1, $2)',
      [user.id, preferredTimezone]
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        preferredTimezone: user.preferred_timezone
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
};
```

### 2. Dynamic Meeting Scheduling

```javascript
// controllers/meetingController.js
const { DateTime } = require('luxon');

const scheduleMeeting = async (req, res) => {
  try {
    const hostId = req.user.id; // From JWT token
    const { 
      participantId, 
      title, 
      description, 
      meetingDateTime,      // e.g., "2024-12-15T14:00:00"
      meetingTimezone,      // e.g., "Africa/Nairobi" (where the meeting should happen)
      durationMinutes = 60 
    } = req.body;
    
    // Get participant details to validate
    const participantQuery = await db.query(
      'SELECT id, preferred_timezone, first_name, last_name FROM users WHERE id = $1',
      [participantId]
    );
    
    if (participantQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    
    const participant = participantQuery.rows[0];
    
    // Parse the meeting time in the specified timezone
    const scheduledTime = DateTime.fromISO(meetingDateTime, { 
      zone: meetingTimezone 
    });
    
    if (!scheduledTime.isValid) {
      return res.status(400).json({ error: 'Invalid meeting date/time' });
    }
    
    // Convert to UTC for database storage
    const utcTime = scheduledTime.toUTC();
    
    // Create the meeting
    const meetingQuery = `
      INSERT INTO meetings (
        title, description, host_id, participant_id, 
        scheduled_at, scheduled_timezone, duration_minutes
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING id, scheduled_at, scheduled_timezone
    `;
    
    const meetingResult = await db.query(meetingQuery, [
      title,
      description,
      hostId,
      participantId,
      utcTime.toISO(),
      meetingTimezone,
      durationMinutes
    ]);
    
    const meeting = meetingResult.rows[0];
    
    // Get host details for response
    const hostQuery = await db.query(
      'SELECT preferred_timezone, first_name, last_name FROM users WHERE id = $1',
      [hostId]
    );
    const host = hostQuery.rows[0];
    
    // Prepare response with times in different timezones
    const response = {
      meetingId: meeting.id,
      title,
      description,
      duration: durationMinutes,
      host: {
        name: `${host.first_name} ${host.last_name}`,
        timezone: host.preferred_timezone
      },
      participant: {
        name: `${participant.first_name} ${participant.last_name}`,
        timezone: participant.preferred_timezone
      },
      times: {
        // Original timezone (where meeting is set to happen)
        meetingTimezone: {
          datetime: scheduledTime.toISO(),
          display: scheduledTime.toLocaleString(DateTime.DATETIME_FULL),
          timezone: meetingTimezone
        },
        // Host's preferred timezone
        hostTimezone: {
          datetime: utcTime.setZone(host.preferred_timezone).toISO(),
          display: utcTime.setZone(host.preferred_timezone).toLocaleString(DateTime.DATETIME_FULL),
          timezone: host.preferred_timezone
        },
        // Participant's preferred timezone  
        participantTimezone: {
          datetime: utcTime.setZone(participant.preferred_timezone).toISO(),
          display: utcTime.setZone(participant.preferred_timezone).toLocaleString(DateTime.DATETIME_FULL),
          timezone: participant.preferred_timezone
        },
        // UTC for reference
        utc: utcTime.toISO()
      }
    };
    
    res.status(201).json({
      message: 'Meeting scheduled successfully',
      meeting: response
    });
    
  } catch (error) {
    console.error('Meeting scheduling error:', error);
    res.status(500).json({ error: 'Failed to schedule meeting' });
  }
};
```

### 3. Dynamic Meeting Display (Adapts to Current Location)

```javascript
const getUserMeetings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentTimezone } = req.query; // Optional: user's current location
    
    // Get user's preferred timezone if current not provided
    const userQuery = await db.query(
      'SELECT preferred_timezone FROM users WHERE id = $1',
      [userId]
    );
    const userPreferredTz = userQuery.rows[0].preferred_timezone;
    
    // Use current timezone if provided, otherwise use preferred
    const displayTimezone = currentTimezone || userPreferredTz;
    
    // Validate timezone
    if (!DateTime.now().setZone(displayTimezone).isValid) {
      return res.status(400).json({ error: 'Invalid current timezone' });
    }
    
    // Get upcoming meetings
    const meetingsQuery = `
      SELECT 
        m.id, m.title, m.description, m.scheduled_at, 
        m.scheduled_timezone, m.duration_minutes, m.status,
        h.first_name as host_first_name, h.last_name as host_last_name,
        p.first_name as participant_first_name, p.last_name as participant_last_name,
        CASE 
          WHEN m.host_id = $1 THEN 'host'
          ELSE 'participant'
        END as user_role
      FROM meetings m
      JOIN users h ON m.host_id = h.id
      JOIN users p ON m.participant_id = p.id
      WHERE (m.host_id = $1 OR m.participant_id = $1)
        AND m.scheduled_at > NOW()
        AND m.status = 'scheduled'
      ORDER BY m.scheduled_at ASC
    `;
    
    const result = await db.query(meetingsQuery, [userId]);
    
    // Transform meetings with dynamic timezone display
    const meetings = result.rows.map(meeting => {
      const utcTime = DateTime.fromISO(meeting.scheduled_at, { zone: 'utc' });
      const displayTime = utcTime.setZone(displayTimezone);
      const originalTime = utcTime.setZone(meeting.scheduled_timezone);
      
      // Calculate time until meeting
      const now = DateTime.now().setZone(displayTimezone);
      const timeUntil = displayTime.diff(now, ['days', 'hours', 'minutes']);
      
      return {
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        duration: meeting.duration_minutes,
        userRole: meeting.user_role,
        otherPerson: meeting.user_role === 'host' 
          ? `${meeting.participant_first_name} ${meeting.participant_last_name}`
          : `${meeting.host_first_name} ${meeting.host_last_name}`,
        
        // Dynamic time display
        displayTime: {
          datetime: displayTime.toISO(),
          formatted: displayTime.toLocaleString(DateTime.DATETIME_FULL),
          timezone: displayTimezone,
          isUserCurrent: displayTimezone !== userPreferredTz
        },
        
        // Original scheduled timezone
        originalTime: {
          datetime: originalTime.toISO(), 
          formatted: originalTime.toLocaleString(DateTime.DATETIME_FULL),
          timezone: meeting.scheduled_timezone
        },
        
        // Time until meeting
        timeUntil: {
          days: Math.floor(timeUntil.days),
          hours: Math.floor(timeUntil.hours),
          minutes: Math.floor(timeUntil.minutes),
          humanReadable: timeUntil.days >= 1 
            ? `${Math.floor(timeUntil.days)} day(s)`
            : timeUntil.hours >= 1 
              ? `${Math.floor(timeUntil.hours)} hour(s)`
              : `${Math.floor(timeUntil.minutes)} minute(s)`
        }
      };
    });
    
    res.json({
      meetings,
      displayTimezone,
      userPreferredTimezone: userPreferredTz,
      totalMeetings: meetings.length
    });
    
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
};
```

### 4. Frontend Integration for Dynamic Timezone Detection

```javascript
// frontend/js/meetings.js

class MeetingScheduler {
  constructor() {
    this.userPreferredTimezone = null;
    this.currentTimezone = this.detectCurrentTimezone();
    this.init();
  }
  
  detectCurrentTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  
  async init() {
    await this.loadUserProfile();
    await this.loadMeetings();
    this.startTimezoneMonitoring();
  }
  
  async loadUserProfile() {
    try {
      const response = await fetch('/api/user/profile');
      const user = await response.json();
      this.userPreferredTimezone = user.preferredTimezone;
    } catch (error) {
      console.error('Failed to load user profile:', error);
    }
  }
  
  async loadMeetings() {
    try {
      const params = new URLSearchParams();
      
      // Send current timezone if different from preferred
      if (this.currentTimezone !== this.userPreferredTimezone) {
        params.append('currentTimezone', this.currentTimezone);
      }
      
      const response = await fetch(`/api/meetings?${params}`);
      const data = await response.json();
      
      this.displayMeetings(data.meetings);
      this.showTimezoneInfo(data);
      
    } catch (error) {
      console.error('Failed to load meetings:', error);
    }
  }
  
  displayMeetings(meetings) {
    const container = document.getElementById('meetings-container');
    
    if (meetings.length === 0) {
      container.innerHTML = '<p>No upcoming meetings</p>';
      return;
    }
    
    const html = meetings.map(meeting => `
      <div class="meeting-card" data-meeting-id="${meeting.id}">
        <div class="meeting-header">
          <h3>${meeting.title}</h3>
          <span class="role-badge ${meeting.userRole}">${meeting.userRole}</span>
        </div>
        
        <div class="meeting-details">
          <p><strong>With:</strong> ${meeting.otherPerson}</p>
          <p><strong>Duration:</strong> ${meeting.duration} minutes</p>
          
          ${meeting.description ? `<p><strong>Description:</strong> ${meeting.description}</p>` : ''}
        </div>
        
        <div class="time-info">
          <div class="primary-time">
            <strong>Your Time:</strong> ${meeting.displayTime.formatted}
            ${meeting.displayTime.isUserCurrent ? 
              `<span class="timezone-badge current">Current Location</span>` : 
              `<span class="timezone-badge preferred">Preferred</span>`
            }
          </div>
          
          <div class="original-time">
            <small>Originally scheduled for: ${meeting.originalTime.formatted} (${meeting.originalTime.timezone})</small>
          </div>
          
          <div class="time-until">
            <strong>In ${meeting.timeUntil.humanReadable}</strong>
          </div>
        </div>
        
        <div class="meeting-actions">
          <button class="btn-primary" onclick="joinMeeting('${meeting.id}')">Join Meeting</button>
          <button class="btn-secondary" onclick="editMeeting('${meeting.id}')">Edit</button>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = html;
  }
  
  showTimezoneInfo(data) {
    const infoContainer = document.getElementById('timezone-info');
    
    if (data.displayTimezone !== data.userPreferredTimezone) {
      infoContainer.innerHTML = `
        <div class="timezone-notice">
          <i class="icon-location"></i>
          <span>Showing times in your current location (${data.displayTimezone}). 
                Your preferred timezone is ${data.userPreferredTimezone}.</span>
        </div>
      `;
    } else {
      infoContainer.innerHTML = '';
    }
  }
  
  // Monitor for timezone changes (when user travels)
  startTimezoneMonitoring() {
    setInterval(() => {
      const newTimezone = this.detectCurrentTimezone();
      if (newTimezone !== this.currentTimezone) {
        console.log(`Timezone changed from ${this.currentTimezone} to ${newTimezone}`);
        this.currentTimezone = newTimezone;
        this.loadMeetings(); // Refresh meetings with new timezone
        
        // Optional: Update user's timezone history
        this.updateTimezoneHistory(newTimezone);
      }
    }, 60000); // Check every minute
  }
  
  async updateTimezoneHistory(newTimezone) {
    try {
      await fetch('/api/user/timezone-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: newTimezone })
      });
    } catch (error) {
      console.error('Failed to update timezone history:', error);
    }
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  new MeetingScheduler();
});
```

### 5. Meeting Creation Form

```html
<!-- frontend/schedule-meeting.html -->
<form id="meeting-form" class="meeting-form">
  <div class="form-group">
    <label for="participant">Meeting With (Kenya-based users):</label>
    <select id="participant" required>
      <option value="">Select a person...</option>
      <!-- Populated dynamically with Kenya users -->
    </select>
  </div>
  
  <div class="form-group">
    <label for="title">Meeting Title:</label>
    <input type="text" id="title" required>
  </div>
  
  <div class="form-group">
    <label for="description">Description (optional):</label>
    <textarea id="description" rows="3"></textarea>
  </div>
  
  <div class="form-row">
    <div class="form-group">
      <label for="meeting-date">Date:</label>
      <input type="date" id="meeting-date" required>
    </div>
    
    <div class="form-group">
      <label for="meeting-time">Time:</label>
      <input type="time" id="meeting-time" required>
    </div>
  </div>
  
  <div class="form-group">
    <label for="meeting-timezone">Meeting Timezone:</label>
    <select id="meeting-timezone" required>
      <option value="Africa/Nairobi">Nairobi Time (Kenya)</option>
      <option value="America/New_York">Eastern Time (US)</option>
      <option value="America/Los_Angeles">Pacific Time (US)</option>
      <option value="Europe/London">London Time</option>
      <!-- Add more as needed -->
    </select>
    <small class="form-hint">The timezone where the meeting should occur</small>
  </div>
  
  <div class="form-group">
    <label for="duration">Duration:</label>
    <select id="duration">
      <option value="30">30 minutes</option>
      <option value="60" selected>1 hour</option>
      <option value="90">1.5 hours</option>
      <option value="120">2 hours</option>
    </select>
  </div>
  
  <!-- Preview section -->
  <div id="meeting-preview" class="meeting-preview" style="display: none;">
    <h4>Meeting Preview:</h4>
    <div id="preview-content"></div>
  </div>
  
  <button type="submit" class="btn-primary">Schedule Meeting</button>
</form>

<script>
document.getElementById('meeting-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = {
    participantId: document.getElementById('participant').value,
    title: document.getElementById('title').value,
    description: document.getElementById('description').value,
    meetingDateTime: `${document.getElementById('meeting-date').value}T${document.getElementById('meeting-time').value}:00`,
    meetingTimezone: document.getElementById('meeting-timezone').value,
    durationMinutes: parseInt(document.getElementById('duration').value)
  };
  
  try {
    const response = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      },
      body: JSON.stringify(formData)
    });
    
    if (response.ok) {
      const result = await response.json();
      alert('Meeting scheduled successfully!');
      window.location.href = '/meetings'; // Redirect to meetings list
    } else {
      const error = await response.json();
      alert(`Error: ${error.error}`);
    }
  } catch (error) {
    alert('Failed to schedule meeting');
    console.error(error);
  }
});
</script>
```

## Key Features Summary

1. **User Timezone Selection**: Users choose preferred timezone during registration
2. **Dynamic Meeting Creation**: Schedule meetings for specific timezones (e.g., Kenya time)
3. **Automatic Location Adjustment**: Meetings display in user's current timezone when they travel
4. **Accurate Time Persistence**: Meeting time remains accurate regardless of user location changes
5. **Multi-timezone Display**: Shows meeting time in original timezone, user's preferred, and current location
6. **Travel Detection**: Automatically detects when user changes locations

## Production Considerations

1. **Database Performance**: Add indexes on frequently queried columns
2. **Caching**: Cache user timezones and meeting data for better performance  
3. **Notifications**: Implement push notifications that respect user's current timezone
4. **Error Handling**: Robust validation for timezone inputs and edge cases
5. **Testing**: Test across different timezones and DST transitions
6. **Security**: Validate all timezone inputs to prevent injection attacks

This system ensures that whether you're scheduling from Kenya for a Kenya meeting, or traveling between countries, the meeting times remain accurate and display appropriately for your current context.