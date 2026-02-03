import { subClient } from '../config/redis.js';

let io = null;

/**
 * Initialize the meeting event subscriber
 */
export const initializeSubscriber = (socketIo) => {
    io = socketIo;

    // Subscribe to meeting events
    subClient.subscribe('meeting.created', 'meeting.rescheduled', 'meeting.canceled', (err, count) => {
        if (err) {
            console.error('[Call Service] Failed to subscribe to meeting events:', err);
            return;
        }
        console.log(`[Call Service] Subscribed to ${count} meeting event channels`);
    });

    // Handle incoming messages
    subClient.on('message', async (channel, message) => {
        try {
            const event = JSON.parse(message);
            console.log(`[Call Service] Received event: ${channel}`, event);

            switch (channel) {
                case 'meeting.created':
                    await handleMeetingCreated(event);
                    break;
                case 'meeting.rescheduled':
                    await handleMeetingRescheduled(event);
                    break;
                case 'meeting.canceled':
                    await handleMeetingCanceled(event);
                    break;
            }
        } catch (error) {
            console.error('[Call Service] Error processing event:', error);
        }
    });
};

/**
 * Handle meeting created event
 * Notify participants about the new meeting
 */
const handleMeetingCreated = async (event) => {
    const { meetingId, volunteerId, studentId, scheduledTime, roomId } = event;

    if (!io) return;

    // Notify volunteer
    io.to(`user_${volunteerId}`).emit('meeting-created', {
        meetingId,
        studentId,
        scheduledTime,
        roomId,
        message: 'New meeting scheduled'
    });

    // Notify student
    io.to(`user_${studentId}`).emit('meeting-created', {
        meetingId,
        volunteerId,
        scheduledTime,
        roomId,
        message: 'A volunteer has scheduled a meeting with you'
    });

    console.log(`[Call Service] Notified users about new meeting ${meetingId}`);
};

/**
 * Handle meeting rescheduled event
 */
const handleMeetingRescheduled = async (event) => {
    const { meetingId, volunteerId, studentId, oldTime, newTime, roomId, rescheduledBy } = event;

    if (!io) return;

    const message = `Meeting rescheduled from ${new Date(oldTime).toLocaleString()} to ${new Date(newTime).toLocaleString()}`;

    // Notify both participants
    io.to(`user_${volunteerId}`).emit('meeting-rescheduled', {
        meetingId,
        oldTime,
        newTime,
        roomId,
        rescheduledBy,
        message
    });

    io.to(`user_${studentId}`).emit('meeting-rescheduled', {
        meetingId,
        oldTime,
        newTime,
        roomId,
        rescheduledBy,
        message
    });

    console.log(`[Call Service] Notified users about rescheduled meeting ${meetingId}`);
};

/**
 * Handle meeting canceled event
 */
const handleMeetingCanceled = async (event) => {
    const { meetingId, volunteerId, studentId, canceledBy, reason } = event;

    if (!io) return;

    // Notify both participants
    io.to(`user_${volunteerId}`).emit('meeting-canceled', {
        meetingId,
        canceledBy,
        reason,
        message: 'Meeting has been canceled'
    });

    io.to(`user_${studentId}`).emit('meeting-canceled', {
        meetingId,
        canceledBy,
        reason,
        message: 'Meeting has been canceled'
    });

    console.log(`[Call Service] Notified users about canceled meeting ${meetingId}`);
};

export default { initializeSubscriber };
