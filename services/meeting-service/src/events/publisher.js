import { publisher } from '../config/redis.js';

// Event channel names
const CHANNELS = {
    MEETING_EVENTS: 'talktime:meeting:events'
};

/**
 * Publish a meeting event to Redis
 * @param {string} eventType - Type of event
 * @param {Object} data - Event data
 */
export const publishMeetingEvent = async (eventType, data) => {
    const event = {
        type: eventType,
        timestamp: new Date().toISOString(),
        data
    };

    try {
        await publisher.publish(CHANNELS.MEETING_EVENTS, JSON.stringify(event));
        console.log(`[Meeting Service] Published event: ${eventType}`, { meetingId: data.meetingId });
    } catch (error) {
        console.error('[Meeting Service] Failed to publish event:', error.message);
    }
};

// Event types
export const MeetingEventTypes = {
    MEETING_CREATED: 'meeting.created',
    MEETING_RESCHEDULED: 'meeting.rescheduled',
    MEETING_CANCELED: 'meeting.canceled',
    MEETING_ENDED: 'meeting.ended',
    MEETING_MISSED: 'meeting.missed',
    MEETING_STARTED: 'meeting.started'
};

/**
 * Publish meeting.created event
 */
export const publishMeetingCreated = async (meeting, volunteer, student) => {
    await publishMeetingEvent(MeetingEventTypes.MEETING_CREATED, {
        meetingId: meeting.id,
        volunteerId: meeting.volunteer_id,
        studentId: meeting.student_id,
        scheduledTime: meeting.scheduled_time,
        roomId: meeting.room_id,
        volunteerName: volunteer?.full_name,
        studentName: student?.full_name
    });
};

/**
 * Publish meeting.rescheduled event
 */
export const publishMeetingRescheduled = async (meeting, oldTime, newTime, rescheduledBy) => {
    await publishMeetingEvent(MeetingEventTypes.MEETING_RESCHEDULED, {
        meetingId: meeting.id,
        volunteerId: meeting.volunteer_id,
        studentId: meeting.student_id,
        oldTime,
        newTime,
        rescheduledBy,
        roomId: meeting.room_id
    });
};

/**
 * Publish meeting.canceled event
 */
export const publishMeetingCanceled = async (meeting, canceledBy) => {
    await publishMeetingEvent(MeetingEventTypes.MEETING_CANCELED, {
        meetingId: meeting.id,
        volunteerId: meeting.volunteer_id,
        studentId: meeting.student_id,
        canceledBy,
        originalTime: meeting.scheduled_time,
        roomId: meeting.room_id
    });
};

/**
 * Publish meeting.ended event
 */
export const publishMeetingEnded = async (meeting, duration, status) => {
    await publishMeetingEvent(MeetingEventTypes.MEETING_ENDED, {
        meetingId: meeting.id,
        volunteerId: meeting.volunteer_id,
        studentId: meeting.student_id,
        duration,
        status,
        roomId: meeting.room_id
    });
};

/**
 * Publish meeting.missed event
 */
export const publishMeetingMissed = async (meeting, reason = 'timeout') => {
    await publishMeetingEvent(MeetingEventTypes.MEETING_MISSED, {
        meetingId: meeting.id,
        volunteerId: meeting.volunteer_id,
        studentId: meeting.student_id,
        scheduledTime: meeting.scheduled_time,
        reason,
        roomId: meeting.room_id
    });
};

export default {
    publishMeetingEvent,
    publishMeetingCreated,
    publishMeetingRescheduled,
    publishMeetingCanceled,
    publishMeetingEnded,
    publishMeetingMissed,
    MeetingEventTypes
};
