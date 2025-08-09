# TalkTime Meeting Management Flows

This document outlines the complete meeting lifecycle in the TalkTime application, including booking, rescheduling, and cancellation flows.

## 1. Meeting Data Structure

### Meeting Object

```javascript
{
  id: "123",                           // Unique meeting ID
  volunteer_id: "456",                 // ID of the volunteer who scheduled the meeting
  student_id: "789",                   // ID of the student participating
  scheduled_time: "2025-07-17T10:00:00Z", // ISO format date and time
  room_id: "room-abc123",              // Unique, immutable room ID for WebRTC
  status: "scheduled",                 // Status: scheduled, completed, cancelled
  duration: 40                         // Meeting duration in minutes (default: 40)
}
```

## 2. Booking Flow

### Frontend Implementation

1. User navigates to volunteer dashboard
2. User clicks "Find Students" to view available students
3. User selects a student card to view their profile
4. User clicks "Schedule a Call" button
5. Calendar modal opens with available dates and times
6. User selects date and time and clicks "Confirm"
7. Frontend makes POST request to `/api/v1/volunteers/meetings`
8. On success, dashboard is updated with new meeting card

### API Endpoints

**Create Meeting**
- **Endpoint:** `POST /api/v1/volunteers/meetings`
- **Auth:** Required (Volunteer)
- **Request Body:**
  ```json
  {
    "studentId": "789",
    "date": "2025-07-17",
    "time": "10:00",
    "timezone": "Africa/Nairobi"
  }
  ```
- **Response:**
  ```json
  {
    "meeting": {
      "id": "123",
      "scheduledTime": "2025-07-17T10:00:00Z",
      "roomId": "room-abc123",
      "status": "scheduled",
      "student": {
        "id": "789",
        "name": "John Doe"
      }
    }
  }
  ```

## 3. Rescheduling Flow

### Frontend Implementation

1. User navigates to volunteer dashboard
2. User finds the meeting card they want to reschedule
3. User clicks the three-dot menu and selects "Reschedule"
4. Student profile loads with calendar modal
5. User selects new date and time and clicks "Confirm"
6. Frontend makes PUT request to `/api/v1/meetings/:id`
7. On success, dashboard is updated with rescheduled meeting details

### API Endpoints

**Update Meeting**
- **Endpoint:** `PUT /api/v1/meetings/:id`
- **Auth:** Required (Volunteer who created the meeting or Admin)
- **Request Body:**
  ```json
  {
    "scheduledTime": "2025-07-18T14:00:00Z"
  }
  ```
- **Response:**
  ```json
  {
    "meeting": {
      "id": "123",
      "scheduledTime": "2025-07-18T14:00:00Z",
      "roomId": "room-abc123",
      "status": "scheduled"
    },
    "message": "Meeting updated successfully"
  }
  ```

### Important Notes on Rescheduling

1. Rescheduling updates the existing meeting record instead of creating a new one
2. The room ID remains the same after rescheduling, ensuring the meeting link is immutable
3. Only the volunteer who created the meeting or an admin can reschedule it
4. The frontend must send the full ISO datetime string in the `scheduledTime` field

## 4. Cancellation Flow

### Frontend Implementation

1. User navigates to volunteer dashboard
2. User finds the meeting card they want to cancel
3. User clicks the three-dot menu and selects "Cancel Meeting"
4. Confirmation dialog appears
5. User confirms cancellation
6. Frontend makes PUT request to `/api/v1/meetings/:id/cancel`
7. On success, meeting is removed from upcoming meetings list

### API Endpoints

**Cancel Meeting**
- **Endpoint:** `PUT /api/v1/meetings/:id/cancel`
- **Auth:** Required (Volunteer who created the meeting or Admin)
- **Response:**
  ```json
  {
    "message": "Meeting cancelled successfully"
  }
  ```

## 5. Meeting Authorization Rules

1. Volunteers can only view, reschedule, or cancel meetings they created
2. Admins can view, reschedule, or cancel any meeting
3. Students can only view meetings they are participating in

## 6. Common Issues and Solutions

### 403 Forbidden Error When Rescheduling

If you encounter a 403 Forbidden error when attempting to reschedule a meeting, check:

1. The user is authenticated and has a valid session
2. The user is the volunteer who created the meeting or an admin
3. The `volunteer_id` field in the meeting record matches the user's ID

### Meeting Not Appearing After Booking/Rescheduling

If a meeting doesn't appear in the dashboard after booking or rescheduling:

1. Check browser console for API errors
2. Verify the meeting status is "scheduled" (not "cancelled")
3. Ensure the scheduled time is in the future
4. Try refreshing the dashboard data

### Duplicate Meetings After Rescheduling

If duplicate meetings appear after rescheduling:

1. Verify the frontend is using PUT to `/api/v1/meetings/:id` and not creating a new meeting
2. Check that the backend is properly updating the existing record and not creating a new one
3. Ensure the dashboard is correctly refreshing the meeting list after rescheduling

## 7. Testing the Meeting Flows

Use the provided test script to validate the meeting flows:

```bash
# Install dependencies
npm install node-fetch

# Run the test script
node scripts/test-meeting-flows.js
```

The script will:
1. Login as a test user
2. Fetch available students
3. Book a meeting
4. Reschedule the meeting
5. Verify the meeting appears correctly in the dashboard
6. Optionally cancel the meeting

## 8. Future Improvements

1. Add notification support for meeting changes
2. Implement recurring meetings
3. Add meeting notes/feedback functionality
4. Support group meetings with multiple students
