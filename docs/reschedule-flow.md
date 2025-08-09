# TalkTime Meeting Reschedule Flow Documentation

This document outlines the API and UI implementation for the meeting rescheduling functionality in the TalkTime application.

## API Implementation

### Meeting Update Endpoint

- **Endpoint**: `PUT /api/v1/meetings/:id`
- **Authentication**: Requires authenticated user (volunteer or admin)
- **Authorization**: Only the meeting owner (volunteer) or an admin can update a meeting
- **Controller**: `updateMeeting` in `meetingController.js`

### Request Body

```json
{
  "scheduledTime": "2025-07-20 14:00:00", // New meeting time in ISO format
  "duration": 40,                         // Optional: Meeting duration in minutes
  "status": "scheduled"                   // Optional: Meeting status
}
```

### Response

**Success (200 OK)**:
```json
{
  "meeting": {
    "id": 123,
    "volunteerId": 456,
    "studentId": 789,
    "scheduledTime": "2025-07-20 14:00:00",
    "duration": 40,
    "status": "scheduled",
    "roomId": "unique-room-id-123"
    // other meeting properties
  },
  "message": "Meeting updated successfully"
}
```

**Error Responses**:
- 404 Not Found: Meeting doesn't exist
- 403 Forbidden: User not authorized to update this meeting
- 500 Internal Server Error: Server-side error

## Frontend Implementation

### Rescheduling Flow

1. User clicks the "Reschedule" button on a meeting card in the dashboard
2. The `reschedulingMeetingId` global variable is set to the meeting ID
3. The student profile is loaded and the scheduler page is displayed
4. User selects a new date and time for the meeting
5. When the user confirms the booking:
   - If `reschedulingMeetingId` is set, the `PUT /api/v1/meetings/:id` endpoint is called
   - Otherwise, a new meeting is created via `POST /api/v1/volunteers/meetings`

### Key JavaScript Functions

- `rescheduleMeeting(meetingId, studentId, studentName)`: Initiates the reschedule flow
- `bookCall()`: Handles both new bookings and rescheduling based on `reschedulingMeetingId`

### Important UI Elements

- Meeting dropdown menu with "Reschedule" option
- Scheduler page with date/time selection
- Confirmation modal with booking button

## Key Implementation Details

1. The `roomId` remains unchanged when a meeting is rescheduled, ensuring the meeting link remains constant
2. The frontend uses conditional logic in the `bookCall()` function to determine whether to create a new meeting or update an existing one
3. After successful rescheduling, the dashboard is refreshed to show the updated meeting details
4. The user receives a success notification confirming the meeting has been rescheduled

## Testing

To test the reschedule flow:
1. Log in as a volunteer
2. Schedule a meeting with a student
3. Find the meeting in the upcoming meetings list
4. Click the three dots menu and select "Reschedule"
5. Select a new date and time
6. Confirm the booking
7. Verify that the meeting is updated (not duplicated) in the upcoming meetings list
