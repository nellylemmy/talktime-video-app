import { subscriber } from '../config/redis.js';
import { scheduleMeetingNotifications, cancelMeetingNotifications, sendNotification } from '../services/notificationService.js';
import pool from '../config/database.js';

const CHANNEL = 'talktime:meeting:events';

/**
 * Handle incoming meeting events
 */
const handleMeetingEvent = async (message) => {
    try {
        const event = JSON.parse(message);
        console.log(`[Notification Service] Received event: ${event.type}`);

        switch (event.type) {
            case 'meeting.created':
                await handleMeetingCreated(event.data);
                break;

            case 'meeting.rescheduled':
                await handleMeetingRescheduled(event.data);
                break;

            case 'meeting.canceled':
                await handleMeetingCanceled(event.data);
                break;

            case 'meeting.ended':
                await handleMeetingEnded(event.data);
                break;

            case 'meeting.missed':
                await handleMeetingMissed(event.data);
                break;

            default:
                console.log(`[Notification Service] Unknown event type: ${event.type}`);
        }
    } catch (error) {
        console.error('[Notification Service] Error handling event:', error);
    }
};

/**
 * Format date/time for notifications
 * @param {string|Date} time - The time to format
 * @param {string} timezone - IANA timezone identifier (e.g., 'America/New_York', 'Africa/Nairobi')
 * @returns {string} Formatted time string
 */
const formatTime = (time, timezone = 'UTC') => {
    if (!time) return 'Unknown time';

    // Validate timezone - fall back to UTC if invalid
    let tz = timezone;
    try {
        // Test if timezone is valid by attempting to use it
        new Date().toLocaleString('en-US', { timeZone: tz });
    } catch (e) {
        console.warn(`[Notification Service] Invalid timezone "${timezone}", falling back to UTC`);
        tz = 'UTC';
    }

    return new Date(time).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz
    });
};

/**
 * Get user's timezone from database
 * @param {number} userId - The user ID
 * @returns {Promise<string>} The user's timezone or 'UTC' as default
 */
const getUserTimezone = async (userId) => {
    try {
        const result = await pool.query(
            'SELECT timezone FROM users WHERE id = $1',
            [userId]
        );
        return result.rows[0]?.timezone || 'UTC';
    } catch (error) {
        console.error('[Notification Service] Error fetching user timezone:', error);
        return 'UTC';
    }
};

/**
 * Get participant details from database (includes timezone for each user)
 */
const getParticipantDetails = async (volunteerId, studentId) => {
    // Get volunteer details with timezone
    const volunteerResult = await pool.query(
        'SELECT id, full_name, email, timezone FROM users WHERE id = $1',
        [volunteerId]
    );
    const volunteer = volunteerResult.rows[0];
    if (volunteer) {
        volunteer.timezone = volunteer.timezone || 'UTC';
    }

    // Get student details - handle both users.id and students.id
    let studentResult = await pool.query(
        'SELECT id, full_name, email, timezone FROM users WHERE id = $1 AND role = $2',
        [studentId, 'student']
    );

    // If not found in users table, studentId might be from students table
    if (studentResult.rows.length === 0) {
        const studentsLookup = await pool.query(
            'SELECT u.id, u.full_name, u.email, u.timezone FROM students s JOIN users u ON s.user_id = u.id WHERE s.id = $1',
            [studentId]
        );
        if (studentsLookup.rows.length > 0) {
            studentResult = studentsLookup;
        }
    }

    const student = studentResult.rows[0];
    if (student) {
        student.timezone = student.timezone || 'UTC';
    }

    return { volunteer, student };
};

/**
 * Handle meeting.created event - Send immediate notifications + schedule reminders
 */
const handleMeetingCreated = async (data) => {
    console.log('[Notification Service] Processing new meeting:', data.meetingId);

    const { volunteer, student } = await getParticipantDetails(data.volunteerId, data.studentId);

    if (!volunteer || !student) {
        console.error('[Notification Service] Could not find participants for meeting notification');
        return;
    }

    // Format time in each recipient's timezone
    const scheduledTimeForStudent = formatTime(data.scheduledTime, student.timezone);
    const scheduledTimeForVolunteer = formatTime(data.scheduledTime, volunteer.timezone);

    // IMMEDIATE notification to STUDENT - Meeting has been scheduled for you
    await sendNotification({
        recipient_id: student.id,
        recipient_role: 'student',
        title: 'New Meeting Scheduled!',
        message: `${volunteer.full_name} has scheduled a meeting with you for ${scheduledTimeForStudent}. Make sure to be ready!`,
        type: 'meeting_scheduled',
        priority: 'high',
        metadata: {
            meeting_id: data.meetingId,
            room_id: data.roomId,
            scheduled_time: data.scheduledTime,
            volunteer_id: data.volunteerId,
            volunteer_name: volunteer.full_name
        }
    }, ['in-app', 'push'], {
        persistent: true,
        require_interaction: true,
        action_url: '/student/dashboard.html',
        tag: `meeting-scheduled-${data.meetingId}`
    });

    // IMMEDIATE notification to VOLUNTEER - Confirmation of meeting scheduled
    await sendNotification({
        recipient_id: volunteer.id,
        recipient_role: 'volunteer',
        title: 'Meeting Scheduled Successfully',
        message: `Your meeting with ${student.full_name} is confirmed for ${scheduledTimeForVolunteer}.`,
        type: 'meeting_scheduled_confirmation',
        priority: 'medium',
        metadata: {
            meeting_id: data.meetingId,
            room_id: data.roomId,
            scheduled_time: data.scheduledTime,
            student_id: data.studentId,
            student_name: student.full_name
        }
    }, ['in-app', 'push'], {
        persistent: true,
        action_url: '/volunteer/dashboard/upcoming.html',
        tag: `meeting-scheduled-${data.meetingId}`
    });

    // Schedule reminder notifications (30min, 10min, 5min before)
    await scheduleMeetingNotifications({
        id: data.meetingId,
        volunteer_id: data.volunteerId,
        student_id: student.id, // Use resolved student ID
        scheduled_time: data.scheduledTime,
        room_id: data.roomId,
        volunteerName: volunteer.full_name,
        studentName: student.full_name
    });

    console.log(`[Notification Service] Sent scheduled notifications to student ${student.id} and volunteer ${volunteer.id}`);
};

/**
 * Handle meeting.rescheduled event
 */
const handleMeetingRescheduled = async (data) => {
    console.log('[Notification Service] Handling reschedule for meeting:', data.meetingId);

    // Cancel old notifications
    await cancelMeetingNotifications(data.meetingId);

    const { volunteer, student } = await getParticipantDetails(data.volunteerId, data.studentId);

    if (!volunteer || !student) {
        console.error('[Notification Service] Could not find participants for reschedule notification');
        return;
    }

    // Get rescheduler name
    const reschedulerResult = await pool.query(
        'SELECT full_name, role FROM users WHERE id = $1',
        [data.rescheduledBy]
    );
    const rescheduler = reschedulerResult.rows[0];
    const reschedulerName = rescheduler?.full_name || 'Someone';

    // Format times in each recipient's timezone
    const oldTimeForStudent = formatTime(data.oldTime, student.timezone);
    const newTimeForStudent = formatTime(data.newTime, student.timezone);
    const oldTimeForVolunteer = formatTime(data.oldTime, volunteer.timezone);
    const newTimeForVolunteer = formatTime(data.newTime, volunteer.timezone);

    // Notify STUDENT about reschedule
    await sendNotification({
        recipient_id: student.id,
        recipient_role: 'student',
        title: 'Meeting Rescheduled',
        message: `Your meeting with ${volunteer.full_name} has been rescheduled from ${oldTimeForStudent} to ${newTimeForStudent}.`,
        type: 'meeting_rescheduled',
        priority: 'high',
        metadata: {
            meeting_id: data.meetingId,
            room_id: data.roomId,
            original_time: data.oldTime,
            new_time: data.newTime,
            rescheduled_by: reschedulerName,
            volunteer_name: volunteer.full_name
        }
    }, ['in-app', 'push'], {
        persistent: true,
        require_interaction: true,
        action_url: '/student/dashboard.html',
        tag: `meeting-reschedule-${data.meetingId}`
    });

    // Notify VOLUNTEER about reschedule confirmation
    await sendNotification({
        recipient_id: volunteer.id,
        recipient_role: 'volunteer',
        title: 'Meeting Rescheduled',
        message: `Your meeting with ${student.full_name} has been rescheduled to ${newTimeForVolunteer}.`,
        type: 'meeting_rescheduled',
        priority: 'high',
        metadata: {
            meeting_id: data.meetingId,
            room_id: data.roomId,
            original_time: data.oldTime,
            new_time: data.newTime,
            student_name: student.full_name
        }
    }, ['in-app', 'push'], {
        persistent: true,
        action_url: '/volunteer/dashboard/upcoming.html',
        tag: `meeting-reschedule-${data.meetingId}`
    });

    // Schedule new reminder notifications for the new time
    await scheduleMeetingNotifications({
        id: data.meetingId,
        volunteer_id: data.volunteerId,
        student_id: student.id,
        scheduled_time: data.newTime,
        room_id: data.roomId
    });

    console.log(`[Notification Service] Reschedule notifications sent to student ${student.id} and volunteer ${volunteer.id}`);
};

/**
 * Handle meeting.canceled event
 */
const handleMeetingCanceled = async (data) => {
    console.log('[Notification Service] Handling cancellation for meeting:', data.meetingId);

    // Cancel scheduled reminder notifications
    await cancelMeetingNotifications(data.meetingId);

    const { volunteer, student } = await getParticipantDetails(data.volunteerId, data.studentId);

    if (!volunteer || !student) {
        console.error('[Notification Service] Could not find participants for cancellation notification');
        return;
    }

    // Get canceler details
    const cancelerResult = await pool.query(
        'SELECT full_name, role FROM users WHERE id = $1',
        [data.canceledBy]
    );
    const canceler = cancelerResult.rows[0];
    const cancelerName = canceler?.full_name || 'Someone';
    const canceledByRole = canceler?.role || 'unknown';

    // Format time in each recipient's timezone
    const originalTimeForStudent = formatTime(data.originalTime, student.timezone);
    const originalTimeForVolunteer = formatTime(data.originalTime, volunteer.timezone);

    // Notify STUDENT about cancellation
    const studentMessage = canceledByRole === 'volunteer'
        ? `${volunteer.full_name} has canceled your meeting scheduled for ${originalTimeForStudent}. You can schedule a new meeting anytime.`
        : `Your meeting with ${volunteer.full_name} scheduled for ${originalTimeForStudent} has been canceled.`;

    await sendNotification({
        recipient_id: student.id,
        recipient_role: 'student',
        title: 'Meeting Canceled',
        message: studentMessage,
        type: 'meeting_canceled',
        priority: 'high',
        metadata: {
            meeting_id: data.meetingId,
            original_time: data.originalTime,
            canceled_by: cancelerName,
            canceled_by_role: canceledByRole,
            volunteer_name: volunteer.full_name
        }
    }, ['in-app', 'push'], {
        persistent: true,
        require_interaction: true,
        action_url: '/student/dashboard.html',
        tag: `meeting-canceled-${data.meetingId}`
    });

    // Notify VOLUNTEER about cancellation
    const volunteerMessage = canceledByRole === 'volunteer'
        ? `You canceled your meeting with ${student.full_name} scheduled for ${originalTimeForVolunteer}.`
        : `Your meeting with ${student.full_name} scheduled for ${originalTimeForVolunteer} has been canceled.`;

    await sendNotification({
        recipient_id: volunteer.id,
        recipient_role: 'volunteer',
        title: 'Meeting Canceled',
        message: volunteerMessage,
        type: 'meeting_canceled',
        priority: 'medium',
        metadata: {
            meeting_id: data.meetingId,
            original_time: data.originalTime,
            canceled_by: cancelerName,
            canceled_by_role: canceledByRole,
            student_name: student.full_name
        }
    }, ['in-app', 'push'], {
        persistent: true,
        action_url: '/volunteer/dashboard/upcoming.html',
        tag: `meeting-canceled-${data.meetingId}`
    });

    console.log(`[Notification Service] Cancellation notifications sent to student ${student.id} and volunteer ${volunteer.id}`);
};

/**
 * Handle meeting.ended event
 */
const handleMeetingEnded = async (data) => {
    console.log('[Notification Service] Handling meeting end:', data.meetingId, 'Status:', data.status);

    const { volunteer, student } = await getParticipantDetails(data.volunteerId, data.studentId);

    if (!volunteer || !student) {
        console.error('[Notification Service] Could not find participants for meeting end notification');
        return;
    }

    const isCompleted = data.status === 'completed';
    const durationText = data.duration ? `${data.duration} minutes` : 'your session';

    // Notify STUDENT about meeting completion
    await sendNotification({
        recipient_id: student.id,
        recipient_role: 'student',
        title: isCompleted ? 'Meeting Completed' : 'Meeting Ended',
        message: isCompleted
            ? `Great job! Your ${durationText} meeting with ${volunteer.full_name} has been completed successfully.`
            : `Your meeting with ${volunteer.full_name} has ended.`,
        type: isCompleted ? 'meeting_completed' : 'meeting_ended',
        priority: 'medium',
        metadata: {
            meeting_id: data.meetingId,
            duration: data.duration,
            status: data.status,
            volunteer_name: volunteer.full_name
        }
    }, ['in-app'], {
        persistent: true,
        action_url: '/student/dashboard.html',
        tag: `meeting-ended-${data.meetingId}`
    });

    // Notify VOLUNTEER about meeting completion
    await sendNotification({
        recipient_id: volunteer.id,
        recipient_role: 'volunteer',
        title: isCompleted ? 'Meeting Completed' : 'Meeting Ended',
        message: isCompleted
            ? `Your ${durationText} meeting with ${student.full_name} has been completed successfully. Great work!`
            : `Your meeting with ${student.full_name} has ended.`,
        type: isCompleted ? 'meeting_completed' : 'meeting_ended',
        priority: 'medium',
        metadata: {
            meeting_id: data.meetingId,
            duration: data.duration,
            status: data.status,
            student_name: student.full_name
        }
    }, ['in-app'], {
        persistent: true,
        action_url: '/volunteer/dashboard/history.html',
        tag: `meeting-ended-${data.meetingId}`
    });

    console.log(`[Notification Service] Meeting end notifications sent to student ${student.id} and volunteer ${volunteer.id}`);
};

/**
 * Handle meeting.missed event
 */
const handleMeetingMissed = async (data) => {
    console.log('[Notification Service] Handling missed meeting:', data.meetingId, 'Reason:', data.reason);

    const { volunteer, student } = await getParticipantDetails(data.volunteerId, data.studentId);

    if (!volunteer || !student) {
        console.error('[Notification Service] Could not find participants for missed meeting notification');
        return;
    }

    // Format time in each recipient's timezone
    const scheduledTimeForStudent = formatTime(data.scheduledTime, student.timezone);
    const scheduledTimeForVolunteer = formatTime(data.scheduledTime, volunteer.timezone);

    // Notify STUDENT about missed meeting
    await sendNotification({
        recipient_id: student.id,
        recipient_role: 'student',
        title: 'Meeting Missed',
        message: `Your meeting with ${volunteer.full_name} scheduled for ${scheduledTimeForStudent} was missed. Please coordinate with your volunteer to reschedule.`,
        type: 'meeting_missed',
        priority: 'high',
        metadata: {
            meeting_id: data.meetingId,
            scheduled_time: data.scheduledTime,
            reason: data.reason,
            volunteer_name: volunteer.full_name
        }
    }, ['in-app', 'push'], {
        persistent: true,
        action_url: '/student/dashboard.html',
        tag: `meeting-missed-${data.meetingId}`
    });

    // Notify VOLUNTEER about missed meeting
    await sendNotification({
        recipient_id: volunteer.id,
        recipient_role: 'volunteer',
        title: 'Meeting Missed',
        message: `Your meeting with ${student.full_name} scheduled for ${scheduledTimeForVolunteer} was missed due to timeout. Please reschedule if needed.`,
        type: 'meeting_missed',
        priority: 'high',
        metadata: {
            meeting_id: data.meetingId,
            scheduled_time: data.scheduledTime,
            reason: data.reason,
            student_name: student.full_name
        }
    }, ['in-app', 'push'], {
        persistent: true,
        action_url: '/volunteer/dashboard/upcoming.html',
        tag: `meeting-missed-${data.meetingId}`
    });

    console.log(`[Notification Service] Missed meeting notifications sent to student ${student.id} and volunteer ${volunteer.id}`);
};

/**
 * Start subscribing to meeting events
 */
export const startMeetingSubscriber = async () => {
    try {
        await subscriber.subscribe(CHANNEL);
        subscriber.on('message', (channel, message) => {
            if (channel === CHANNEL) {
                handleMeetingEvent(message);
            }
        });
        console.log(`[Notification Service] Subscribed to ${CHANNEL}`);
    } catch (error) {
        console.error('[Notification Service] Failed to subscribe:', error);
    }
};

export default { startMeetingSubscriber };
