import pool from '../config/database.js';
import { publisher } from '../config/redis.js';

/**
 * Send notification to a user
 */
export const sendNotification = async (notification, channels = ['in-app'], options = {}) => {
    const {
        recipient_id,
        recipient_role,
        title,
        message,
        type,
        priority = 'medium',
        metadata = {}
    } = notification;

    const {
        persistent = true,
        auto_delete_after = null,
        require_interaction = false,
        action_url = null,
        icon_url = '/favicon.ico',
        badge_url = '/favicon.ico',
        tag = null
    } = options;

    try {
        // Store notification in database
        const result = await pool.query(`
            INSERT INTO notifications (
                recipient_id, recipient_role, title, message, type, priority,
                metadata, is_sent, channels_sent, is_persistent,
                auto_delete_after, require_interaction, action_url,
                icon_url, badge_url, tag, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
            RETURNING *
        `, [
            recipient_id, recipient_role, title, message, type, priority,
            JSON.stringify(metadata), channels, persistent,
            auto_delete_after, require_interaction, action_url,
            icon_url, badge_url, tag
        ]);

        const savedNotification = result.rows[0];

        // Emit real-time notification via Redis (for Socket.IO adapter)
        await publisher.publish('talktime:notifications:realtime', JSON.stringify({
            type: 'new-notification',
            recipient_id,
            recipient_role,
            notification: savedNotification
        }));

        console.log(`[Notification Service] Sent notification to ${recipient_role}_${recipient_id}: ${title}`);

        return savedNotification;
    } catch (error) {
        console.error('[Notification Service] Error sending notification:', error);
        throw error;
    }
};

/**
 * Schedule meeting notifications (30min, 10min, 5min before)
 */
export const scheduleMeetingNotifications = async (meeting) => {
    const { id, volunteer_id, student_id, scheduled_time, room_id } = meeting;

    const meetingTime = new Date(scheduled_time);
    const intervals = [
        { minutes: 30, type: 'meeting_reminder_30min' },
        { minutes: 10, type: 'meeting_reminder_10min' },
        { minutes: 5, type: 'meeting_reminder_5min' }
    ];

    const participants = [
        { id: volunteer_id, role: 'volunteer' },
        { id: student_id, role: 'student' }
    ];

    for (const participant of participants) {
        for (const interval of intervals) {
            const scheduledFor = new Date(meetingTime.getTime() - (interval.minutes * 60 * 1000));

            // Only schedule if the scheduled time is in the future
            if (scheduledFor > new Date()) {
                await pool.query(`
                    INSERT INTO notifications (
                        recipient_id, recipient_role, title, message, type, priority,
                        metadata, scheduled_for, is_sent, is_persistent,
                        auto_delete_after, require_interaction, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, true, $9, $10, NOW())
                `, [
                    participant.id,
                    participant.role,
                    `Meeting in ${interval.minutes} minutes`,
                    `Your meeting is starting in ${interval.minutes} minutes. Get ready!`,
                    interval.type,
                    interval.minutes === 5 ? 'urgent' : 'high',
                    JSON.stringify({
                        meeting_id: id,
                        room_id,
                        scheduled_time
                    }),
                    scheduledFor,
                    interval.minutes === 30 ? 60 : 30,
                    interval.minutes === 5
                ]);
            }
        }
    }

    console.log(`[Notification Service] Scheduled reminders for meeting ${id}`);
};

/**
 * Cancel meeting notifications
 */
export const cancelMeetingNotifications = async (meetingId) => {
    try {
        const result = await pool.query(`
            DELETE FROM notifications
            WHERE metadata->>'meeting_id' = $1
            AND is_sent = false
        `, [meetingId.toString()]);

        console.log(`[Notification Service] Canceled ${result.rowCount} notifications for meeting ${meetingId}`);
    } catch (error) {
        console.error('[Notification Service] Error canceling notifications:', error);
    }
};

/**
 * Process scheduled notifications that are due
 */
export const processScheduledNotifications = async () => {
    try {
        const result = await pool.query(`
            SELECT * FROM notifications
            WHERE scheduled_for <= NOW()
            AND is_sent = false
            AND scheduled_for IS NOT NULL
            ORDER BY scheduled_for ASC
            LIMIT 100
        `);

        for (const notification of result.rows) {
            await sendScheduledNotification(notification);
        }

        if (result.rows.length > 0) {
            console.log(`[Notification Service] Processed ${result.rows.length} scheduled notifications`);
        }
    } catch (error) {
        console.error('[Notification Service] Error processing scheduled notifications:', error);
    }
};

/**
 * Send a scheduled notification and trigger auto-launch if applicable
 */
const sendScheduledNotification = async (notification) => {
    try {
        // Mark as sent
        await pool.query(`
            UPDATE notifications
            SET is_sent = true, sent_at = NOW()
            WHERE id = $1
        `, [notification.id]);

        // Emit real-time notification
        await publisher.publish('talktime:notifications:realtime', JSON.stringify({
            type: 'new-notification',
            recipient_id: notification.recipient_id,
            recipient_role: notification.recipient_role,
            notification
        }));

        // If this is a 5-minute reminder, trigger auto-launch
        if (notification.type === 'meeting_reminder_5min') {
            await triggerMeetingAutoLaunch(notification);
        }
    } catch (error) {
        console.error('[Notification Service] Error sending scheduled notification:', error);
    }
};

/**
 * Trigger meeting auto-launch for 5-minute reminders
 */
const triggerMeetingAutoLaunch = async (notification) => {
    try {
        const metadata = notification.metadata || {};
        const meetingId = metadata.meeting_id;

        if (!meetingId) return;

        // Get meeting details
        const meetingResult = await pool.query(`
            SELECT m.*, v.full_name as volunteer_name, s.full_name as student_name
            FROM meetings m
            JOIN users v ON m.volunteer_id = v.id
            JOIN users s ON m.student_id = s.id
            WHERE m.id = $1
        `, [meetingId]);

        if (meetingResult.rows.length === 0) return;

        const meeting = meetingResult.rows[0];

        // Publish auto-launch event
        await publisher.publish('talktime:notifications:realtime', JSON.stringify({
            type: 'meeting-auto-launch',
            data: {
                meetingId: meeting.id,
                roomId: meeting.room_id,
                meetingUrl: `/call/call.html?roomId=${meeting.room_id}`,
                duration: meeting.duration || 40,
                volunteer: {
                    id: meeting.volunteer_id,
                    name: meeting.volunteer_name
                },
                student: {
                    id: meeting.student_id,
                    name: meeting.student_name
                }
            },
            recipients: [
                { id: meeting.volunteer_id, role: 'volunteer' },
                { id: meeting.student_id, role: 'student' }
            ]
        }));

        console.log(`[Notification Service] Triggered auto-launch for meeting ${meetingId}`);
    } catch (error) {
        console.error('[Notification Service] Error triggering auto-launch:', error);
    }
};

export default {
    sendNotification,
    scheduleMeetingNotifications,
    cancelMeetingNotifications,
    processScheduledNotifications
};
