# TalkTime Testing Plan: Booking, Rescheduling, and Cancellation Flows

This document outlines the testing procedures for the core meeting management flows in the TalkTime application.

## 1. Meeting Booking Flow

### Test Cases

1. **Basic Booking**
   - Navigate to the volunteer dashboard
   - Click "Find Students" to view available students
   - Select a student card to view their profile
   - Click "Schedule a Call" to open the scheduler
   - Select a date and time slot
   - Confirm the booking
   - Verify the meeting appears in the upcoming meetings list
   - Verify the meeting details (student name, date, time) are correct

2. **Validation Testing**
   - Attempt to book without selecting a date
   - Attempt to book without selecting a time
   - Verify appropriate error messages are shown
   - Verify the book button is disabled until all required fields are filled

3. **Edge Cases**
   - Test booking at the boundary of available time slots
   - Test booking with different timezones
   - Verify fully booked days are properly marked and not selectable

## 2. Meeting Rescheduling Flow

### Test Cases

1. **Basic Rescheduling**
   - Navigate to the volunteer dashboard
   - Find an existing meeting in the upcoming meetings list
   - Click the three dots menu and select "Reschedule"
   - Select a new date and time
   - Confirm the reschedule
   - Verify the meeting is updated with the new time (not duplicated)
   - Verify the meeting details are correct after rescheduling

2. **Validation Testing**
   - Attempt to reschedule without selecting a new date/time
   - Verify appropriate error messages are shown
   - Verify the same meeting ID is used (check network requests)

3. **Edge Cases**
   - Reschedule a meeting to the same day but different time
   - Reschedule a meeting to a different day
   - Verify the meeting link (roomId) remains the same after rescheduling

## 3. Meeting Cancellation Flow

### Test Cases

1. **Basic Cancellation**
   - Navigate to the volunteer dashboard
   - Find an existing meeting in the upcoming meetings list
   - Click the three dots menu and select "Cancel Meeting"
   - Confirm the cancellation in the dialog
   - Verify the meeting is removed from the upcoming meetings list

2. **Validation Testing**
   - Verify cancellation confirmation dialog works correctly
   - Verify cancelled meetings don't appear in upcoming meetings

## 4. API Integration Tests

### Test Cases

1. **Meeting Creation API**
   - Verify POST `/api/v1/volunteers/meetings` returns 201 Created
   - Verify response contains meeting details with correct format

2. **Meeting Update API**
   - Verify PUT `/api/v1/meetings/:id` returns 200 OK
   - Verify response contains updated meeting details

3. **Meeting Cancellation API**
   - Verify DELETE `/api/v1/meetings/:id` returns 200 OK
   - Verify response contains success message

## 5. Security and Authorization Tests

### Test Cases

1. **Authorization Checks**
   - Verify a volunteer can only reschedule/cancel their own meetings
   - Verify appropriate 403 Forbidden responses for unauthorized actions

## 6. UI/UX Tests

### Test Cases

1. **Loading States**
   - Verify appropriate loading indicators during API calls
   - Verify buttons are disabled during processing

2. **Error Handling**
   - Verify user-friendly error messages for API failures
   - Verify form validation errors are clearly displayed

3. **Notifications**
   - Verify success notifications appear after successful actions
   - Verify error notifications appear after failed actions

## 7. Regression Tests

### Test Cases

1. **Dashboard Data Loading**
   - Verify dashboard loads correctly after login
   - Verify upcoming and past meetings are displayed correctly

2. **Student Data Loading**
   - Verify student cards load correctly
   - Verify student profiles display correctly

## Test Execution Checklist

- [ ] All test cases executed successfully
- [ ] No 400/403/500 errors in browser console
- [ ] All API responses return expected data
- [ ] UI updates correctly after all actions
- [ ] No duplicate meetings created during rescheduling
- [ ] Meeting links remain constant after rescheduling
