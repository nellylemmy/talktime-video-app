import { subscriber } from '../config/redis.js';
import { scheduleMeetingNotifications, cancelMeetingNotifications } from '../services/notificationService.js';

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
 * Handle meeting.created event
 */
const handleMeetingCreated = async (data) => {
    console.log('[Notification Service] Scheduling notifications for new meeting:', data.meetingId);

    await scheduleMeetingNotifications({
        id: data.meetingId,
        volunteer_id: data.volunteerId,
        student_id: data.studentId,
        scheduled_time: data.scheduledTime,
        room_id: data.roomId,
        volunteerName: data.volunteerName,
        studentName: data.studentName
    });
};

/**
 * Handle meeting.rescheduled event
 */
const handleMeetingRescheduled = async (data) => {
    console.log('[Notification Service] Handling reschedule for meeting:', data.meetingId);

    // Cancel old notifications
    await cancelMeetingNotifications(data.meetingId);

    // Schedule new notifications for the new time
    await scheduleMeetingNotifications({
        id: data.meetingId,
        volunteer_id: data.volunteerId,
        student_id: data.studentId,
        scheduled_time: data.newTime,
        room_id: data.roomId
    });

    // Send reschedule notification to both participants
    // (handled by sendRescheduleNotification)
};

/**
 * Handle meeting.canceled event
 */
const handleMeetingCanceled = async (data) => {
    console.log('[Notification Service] Canceling notifications for meeting:', data.meetingId);

    await cancelMeetingNotifications(data.meetingId);

    // Send cancellation notification to participants
    // (implementation in notificationService)
};

/**
 * Handle meeting.ended event
 */
const handleMeetingEnded = async (data) => {
    console.log('[Notification Service] Meeting ended:', data.meetingId, 'Status:', data.status);

    // Send completion notification
    // (implementation in notificationService)
};

/**
 * Handle meeting.missed event
 */
const handleMeetingMissed = async (data) => {
    console.log('[Notification Service] Meeting missed:', data.meetingId, 'Reason:', data.reason);

    // Send missed meeting notification
    // (implementation in notificationService)
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
