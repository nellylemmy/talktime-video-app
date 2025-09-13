/**
 * Notification Service
 * Handles sending notifications through various channels
 */
import { Pool } from 'pg';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { getIO } from '../socket.js';

// Database connection
const pool = new Pool({
    user: process.env.DB_USER || 'user',
    host: process.env.DB_HOST || 'db',
    database: process.env.DB_DATABASE || 'talktimedb_dev',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

// Cache for user notification preferences to reduce database hits
const notificationPrefsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Email transporter setup
let emailTransporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    emailTransporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

// SMS client setup
let smsClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    smsClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Get user notification preferences with caching
 * @param {number} userId - User ID
 * @returns {Object} Notification preferences
 */
const getUserNotificationPreferences = async (userId) => {
    const cacheKey = `prefs_${userId}`;
    const cached = notificationPrefsCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.preferences;
    }
    
    try {
        const prefsQuery = `SELECT email_notifications, sms_notifications, 
                           COALESCE(push_notifications, '{}'::jsonb) as push_notifications 
                           FROM volunteer_settings WHERE volunteer_id = $1`;
        const prefsResult = await pool.query(prefsQuery, [userId]);
        
        let preferences = {
            email_notifications: {},
            sms_notifications: {},
            push_notifications: {}
        };
        
        if (prefsResult.rows.length > 0) {
            const settings = prefsResult.rows[0];
            preferences = {
                email_notifications: settings.email_notifications || {},
                sms_notifications: settings.sms_notifications || {},
                push_notifications: settings.push_notifications || {}
            };
        }
        
        // Cache the result
        notificationPrefsCache.set(cacheKey, {
            preferences,
            timestamp: Date.now()
        });
        
        return preferences;
    } catch (error) {
        console.error('Error fetching notification preferences:', error);
        return {
            email_notifications: {},
            sms_notifications: {},
            push_notifications: {}
        };
    }
};

/**
 * Clear notification preferences cache for a user
 * @param {number} userId - User ID
 */
export const clearNotificationPrefsCache = (userId) => {
    const cacheKey = `prefs_${userId}`;
    notificationPrefsCache.delete(cacheKey);
};

/**
 * Send notification through multiple channels with persistent storage
 * @param {Object} notificationData - Notification content and metadata
 * @param {Array} channels - Delivery channels ['in-app', 'email', 'sms', 'push']
 * @param {Object} options - Additional options like persistence, auto-delete, etc.
 * @returns {Object} Created notification record
 */
export const sendNotification = async (notificationData, channels = ['in-app', 'push'], options = {}) => {
    try {
        const {
            recipient_id,
            recipient_role,
            title,
            message,
            type = 'general',
            priority = 'medium',
            metadata = {},
            expires_at = null
        } = notificationData;

        const {
            persistent = true,           // Make notifications persistent by default
            auto_delete_after = null,    // Auto-delete after duration (in minutes)
            require_interaction = false, // Require user interaction to dismiss
            action_url = null,          // URL to navigate when clicked
            icon_url = '/favicon.ico',  // Notification icon
            badge_url = '/favicon.ico', // Badge icon
            tag = null                  // Notification tag for grouping
        } = options;

        // Create notification record in database with persistence settings
        const insertQuery = `
            INSERT INTO notifications (
                recipient_id, 
                recipient_role, 
                title, 
                message, 
                type, 
                priority, 
                metadata, 
                expires_at,
                is_persistent,
                auto_delete_after,
                require_interaction,
                action_url,
                icon_url,
                badge_url,
                tag,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
            RETURNING *
        `;

        const result = await pool.query(insertQuery, [
            recipient_id,
            recipient_role,
            title,
            message,
            type,
            priority,
            JSON.stringify(metadata),
            expires_at,
            persistent,
            auto_delete_after ? new Date(Date.now() + auto_delete_after * 60000).toISOString() : null,
            require_interaction,
            action_url,
            icon_url,
            badge_url,
            tag
        ]);

        const createdNotification = result.rows[0];

        // Send real-time notification via Socket.IO with enhanced data
        try {
            const io = getIO();
            const notificationRoom = `notifications_${recipient_role}_${recipient_id}`;
            
            const socketData = {
                notification: {
                    ...createdNotification,
                    action_url,
                    icon_url,
                    badge_url,
                    require_interaction
                },
                timestamp: new Date().toISOString(),
                channels_used: channels,
                priority_level: priority,
                // Add sound metadata for frontend
                sound_enabled: true,
                sound_type: type,
                sound_priority: priority
            };
            
            io.to(notificationRoom).emit('new-notification', socketData);
            
            // Also emit to general user room for cross-tab notifications
            io.to(`user_${recipient_id}`).emit('notification-update', socketData);
            
            // Emit sound event for frontend sound manager
            io.to(`user_${recipient_id}`).emit('notification-sound-trigger', {
                type,
                priority,
                metadata,
                notification_id: createdNotification.id,
                channels,
                timestamp: new Date().toISOString()
            });
            
            console.log(`📡 Real-time notification sent to room: ${notificationRoom}`);
        } catch (error) {
            console.error('❌ Error emitting real-time notification:', error);
            // Don't fail the entire notification if Socket.IO fails
        }

        // Get user details for external notifications
        const userQuery = `SELECT * FROM users WHERE id = $1 AND role = $2`;
        const userResult = await pool.query(userQuery, [recipient_id, recipient_role]);
        
        if (userResult.rows.length === 0) {
            console.error(`User not found for notification: ${recipient_id} with role ${recipient_role}`);
            return createdNotification;
        }

        const user = userResult.rows[0];
        
        // Get user's notification preferences with caching
        let notificationPrefs = {};
        if (recipient_role === 'volunteer') {
            notificationPrefs = await getUserNotificationPreferences(recipient_id);
        }
        
        // Always include push notifications as default channel
        if (!channels.includes('push')) {
            channels.push('push');
        }
        
        // Send through each requested channel with parallel processing
        const channelPromises = channels.map(async (channel) => {
            try {
                switch (channel) {
                    case 'email':
                        if (user.email && shouldSendEmail(notificationPrefs, type)) {
                            await sendEmailNotification(user.email, title, message, metadata);
                            console.log(`📧 Email notification sent to ${user.email}`);
                        }
                        break;
                        
                    case 'sms':
                        if (user.phone && shouldSendSMS(notificationPrefs, type)) {
                            await sendSMSNotification(user.phone, title, message);
                            console.log(`📱 SMS notification sent to ${user.phone}`);
                        }
                        break;
                        
                    case 'push':
                        if (shouldSendPush(notificationPrefs, type)) {
                            await sendPushNotification(user, title, message, {
                                ...metadata,
                                action_url,
                                icon_url,
                                badge_url,
                                tag,
                                require_interaction,
                                priority,
                                type
                            });
                            console.log(`🔔 Push notification sent to user ${user.id}`);
                        }
                        break;
                        
                    case 'in-app':
                        // Already created above
                        console.log(`📱 In-app notification created for user ${user.id}`);
                        break;
                        
                    default:
                        console.warn(`⚠️ Unknown notification channel: ${channel}`);
                }
            } catch (error) {
                console.error(`❌ Error sending notification via ${channel}:`, error);
                // Don't let one channel failure affect others
            }
        });
        
        // Wait for all channels to complete (or fail)
        await Promise.allSettled(channelPromises);
        
        // Update delivery status
        await pool.query(
            `UPDATE notifications SET 
             channels_sent = $1, 
             delivery_status = $2,
             updated_at = NOW()
             WHERE id = $3`,
            [
                channels,
                JSON.stringify({ 
                    sent_at: new Date().toISOString(),
                    channels_attempted: channels.length,
                    status: 'delivered'
                }),
                createdNotification.id
            ]
        );
        
        return createdNotification;
    } catch (error) {
        console.error('❌ Error sending notification:', error);
        throw error;
    }
};

/**
 * Check if email notification should be sent based on user preferences
 */
const shouldSendEmail = (preferences, notificationType) => {
    if (!preferences.email_notifications) return true; // Default to true if no preferences
    
    const emailPrefs = preferences.email_notifications;
    
    // Check specific notification type preferences
    switch (notificationType) {
        case 'meeting':
            return emailPrefs.meeting_notifications !== false;
        case 'reminder':
            return emailPrefs.meeting_reminders !== false;
        case 'system':
            return emailPrefs.system_notifications !== false;
        default:
            return true;
    }
};

/**
 * Check if SMS notification should be sent based on user preferences
 */
const shouldSendSMS = (preferences, notificationType) => {
    if (!preferences.sms_notifications) return false; // Default to false for SMS
    
    const smsPrefs = preferences.sms_notifications;
    
    // Check specific notification type preferences
    switch (notificationType) {
        case 'meeting':
            return smsPrefs.meeting_changes === true;
        case 'reminder':
            return smsPrefs.urgent_reminder === true;
        case 'urgent':
            return smsPrefs.urgent_reminder === true;
        case 'system':
            return smsPrefs.system_alerts === true;
        default:
            return false;
    }
};

/**
 * Check if push notification should be sent based on user preferences
 */
const shouldSendPush = (preferences, notificationType) => {
    // Always send push notifications unless explicitly disabled
    if (!preferences.push_notifications) return true; // Default to true for maximum engagement
    
    const pushPrefs = preferences.push_notifications;
    
    // Check specific notification type preferences
    switch (notificationType) {
        case 'meeting':
        case 'meeting_scheduled':
        case 'meeting_reminder':
        case 'meeting_canceled':
        case 'meeting_rescheduled':
            return pushPrefs.meeting_reminder !== false;
        case 'instant_call':
            return pushPrefs.new_meeting_requests !== false;
        case 'system':
        case 'urgent':
            return pushPrefs.system_alerts !== false;
        default:
            return true; // Send push for all other types by default
    }
};

/**
 * Enhanced Push Notification with rich content and actions
 * @param {Object} user - User object
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} metadata - Enhanced metadata with actions and styling
 */
const sendPushNotification = async (user, title, message, metadata = {}) => {
    try {
        const {
            action_url = null,
            icon_url = '/favicon.ico',
            badge_url = '/favicon.ico',
            tag = 'talktime-notification',
            require_interaction = false,
            priority = 'normal',
            actions = [],
            vibrate = [200, 100, 200],
            sound = 'default',
            meeting_id = null,
            student_name = null,
            volunteer_name = null
        } = metadata;

        // Create rich notification data
        const notificationData = {
            title,
            body: message,
            icon: icon_url,
            badge: badge_url,
            tag,
            requireInteraction: require_interaction,
            data: {
                url: action_url,
                meeting_id,
                student_name,
                volunteer_name,
                timestamp: new Date().toISOString(),
                user_id: user.id,
                user_role: user.role,
                notification_type: metadata.type,
                sound_type: metadata.type || 'default',
                priority
            },
            actions: actions.length > 0 ? actions : [
                {
                    action: 'view',
                    title: '👀 View',
                    icon: '/favicon.ico'
                },
                {
                    action: 'dismiss',
                    title: '✕ Dismiss',
                    icon: '/favicon.ico'
                }
            ],
            vibrate,
            sound
        };

        // Enhance notification based on type
        if (metadata.type === 'meeting_reminder' || metadata.type === 'reminder') {
            notificationData.actions = [
                {
                    action: 'join',
                    title: '🎥 Join Meeting',
                    icon: '/favicon.ico'
                },
                {
                    action: 'remind_later',
                    title: '⏰ Remind Later',
                    icon: '/favicon.ico'
                },
                {
                    action: 'dismiss',
                    title: '✕ Dismiss',
                    icon: '/favicon.ico'
                }
            ];
            notificationData.requireInteraction = true;
            notificationData.vibrate = [100, 50, 100, 50, 100];
        }

        if (metadata.type === 'instant_call') {
            notificationData.actions = [
                {
                    action: 'accept',
                    title: '✅ Accept Call',
                    icon: '/favicon.ico'
                },
                {
                    action: 'decline',
                    title: '❌ Decline',
                    icon: '/favicon.ico'
                }
            ];
            notificationData.requireInteraction = true;
            notificationData.vibrate = [200, 100, 200, 100, 200, 100, 200];
        }

        if (metadata.type === 'meeting_scheduled') {
            notificationData.actions = [
                {
                    action: 'view_details',
                    title: '📅 View Details',
                    icon: '/favicon.ico'
                },
                {
                    action: 'add_calendar',
                    title: '📆 Add to Calendar',
                    icon: '/favicon.ico'
                },
                {
                    action: 'dismiss',
                    title: '✕ Dismiss',
                    icon: '/favicon.ico'
                }
            ];
        }

        if (metadata.type === 'meeting_rescheduled') {
            notificationData.actions = [
                {
                    action: 'view_details',
                    title: '📅 View Schedule',
                    icon: '/favicon.ico'
                },
                {
                    action: 'add_calendar',
                    title: '📆 Update Calendar',
                    icon: '/favicon.ico'
                },
                {
                    action: 'dismiss',
                    title: '✕ Dismiss',
                    icon: '/favicon.ico'
                }
            ];
            notificationData.requireInteraction = true;
            notificationData.vibrate = [100, 50, 100, 50, 100];
        }

        // 🔔 ACTUAL WEB PUSH NOTIFICATION - Use the push notification API
        try {
            const pushResponse = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3001'}/api/v1/push-notifications/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: user.id,
                    title: title,
                    body: message,
                    data: {
                        ...notificationData.data,
                        notification_type: metadata.type,
                        icon: icon_url,
                        badge: badge_url,
                        actions: notificationData.actions,
                        requireInteraction: require_interaction,
                        tag: tag
                    }
                })
            });

            if (pushResponse.ok) {
                console.log(`🔔 Web push notification sent successfully to user ${user.id}`);
            } else {
                console.warn(`⚠️ Push notification API responded with status: ${pushResponse.status}`);
            }
        } catch (pushError) {
            console.error('❌ Error sending web push notification:', pushError);
            // Continue with socket notification even if push fails
        }

        // 📡 REAL-TIME SOCKET NOTIFICATION for immediate UI updates
        const io = getIO();
        io.to(`user_${user.id}`).emit('push-notification-request', {
            notificationData,
            metadata,
            priority,
            timestamp: new Date().toISOString()
        });
        
        console.log(`🔔 Enhanced push notification prepared for user ${user.id} (${user.role})`);
        return true;
    } catch (error) {
        console.error('❌ Error sending push notification:', error);
        throw error;
    }
};

/**
 * Send email notification
 */
const sendEmailNotification = async (email, title, message, metadata = {}) => {
    if (!emailTransporter) {
        console.warn('Email transporter not configured, skipping email notification');
        return;
    }

    try {
        const htmlContent = generateEmailHTML(title, message, metadata);
        
        await emailTransporter.sendMail({
            from: process.env.SMTP_FROM || 'noreply@talktime.adea.ke',
            to: email,
            subject: `TalkTime - ${title}`,
            html: htmlContent
        });
        
        console.log(`Email sent successfully to ${email}`);
    } catch (error) {
        console.error(`Failed to send email to ${email}:`, error);
    }
};

/**
 * Send SMS notification
 */
const sendSMSNotification = async (phoneNumber, title, message) => {
    if (!smsClient) {
        console.warn('SMS client not configured, skipping SMS notification');
        return;
    }

    try {
        const smsBody = `TalkTime: ${title}\n${message}`;
        
        await smsClient.messages.create({
            body: smsBody,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phoneNumber
        });
        
        console.log(`SMS sent successfully to ${phoneNumber}`);
    } catch (error) {
        console.error(`Failed to send SMS to ${phoneNumber}:`, error);
    }
};

/**
 * Generate HTML content for email notifications
 */
const generateEmailHTML = (title, message, metadata) => {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>TalkTime Notification</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
                .content { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .footer { text-align: center; color: #666; font-size: 14px; padding: 20px 0; }
                .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>TalkTime</h1>
                <p>Connecting Maasai Students with Global Volunteers</p>
            </div>
            <div class="content">
                <h2>${title}</h2>
                <p>${message}</p>
                ${metadata.meeting_link ? `<a href="${metadata.meeting_link}" class="button">Join Meeting</a>` : ''}
                ${metadata.dashboard_link ? `<a href="${metadata.dashboard_link}" class="button">View Dashboard</a>` : ''}
            </div>
            <div class="footer">
                <p> 2024 ADEA Foundation - TalkTime Platform</p>
                <p>Empowering Maasai youth through English conversation practice</p>
            </div>
        </body>
        </html>
    `;
};

/**
 * Schedule meeting notifications for both volunteer and student
 * @param {Object} meeting - Meeting data
 * @returns {Array} Created notifications
 */
export const scheduleMeetingNotifications = async (meeting) => {
    try {
        const meetingTime = new Date(meeting.scheduled_time);
        const meetingDate = meetingTime.toLocaleDateString();
        const meetingTimeStr = meetingTime.toLocaleTimeString();
        
        console.log('🔍 Debug: scheduleMeetingNotifications called with meeting:', {
            id: meeting.id,
            volunteer_id: meeting.volunteer_id,
            student_id: meeting.student_id,
            volunteer_id_type: typeof meeting.volunteer_id,
            student_id_type: typeof meeting.student_id,
            allKeys: Object.keys(meeting)
        });
        
        // Handle both camelCase and snake_case column names from database
        const volunteerId = meeting.volunteer_id || meeting.volunteerId;
        const studentId = meeting.student_id || meeting.studentId;
        
        console.log('🔍 Debug: Using IDs:', { volunteerId, studentId });
        
        // Get meeting participants
        const volunteerQuery = `SELECT * FROM users WHERE id = $1 AND role = 'volunteer'`;
        const studentQuery = `SELECT * FROM users WHERE id = $1 AND role = 'student'`;
        
        const [volunteerResult, studentResult] = await Promise.all([
            pool.query(volunteerQuery, [volunteerId]),
            pool.query(studentQuery, [studentId])
        ]);
        
        if (volunteerResult.rows.length === 0 || studentResult.rows.length === 0) {
            console.error('Could not find meeting participants');
            return [];
        }
        
        const volunteer = volunteerResult.rows[0];
        const student = studentResult.rows[0];
        
        const notifications = [];
        
        // Schedule notifications for both participants at different time intervals
        const intervals = [
            { 
                minutes: 30, 
                title: '⏰ 30-Minute Meeting Reminder', 
                priority: 'normal',
                requireInteraction: false,
                autoDeleteAfter: 60, // Auto-delete after 1 hour
                type: 'meeting_reminder_30min'
            },
            { 
                minutes: 10, 
                title: '⏰ 10-Minute Meeting Reminder', 
                priority: 'normal',
                requireInteraction: false,
                autoDeleteAfter: 30, // Auto-delete after 30 minutes
                type: 'meeting_reminder_10min'
            },
            { 
                minutes: 5, 
                title: '🚨 5-Minute Meeting Reminder', 
                priority: 'high',
                requireInteraction: true,
                autoDeleteAfter: 30, // Auto-delete after 30 minutes
                type: 'meeting_reminder_5min'
            }
        ];
        
        const insertQuery = `
            INSERT INTO notifications (
                recipient_id, 
                recipient_role, 
                title, 
                message, 
                type, 
                priority, 
                metadata, 
                scheduled_for,
                is_persistent,
                auto_delete_after,
                require_interaction,
                action_url,
                icon_url,
                badge_url,
                tag
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
        `;
        
        for (const interval of intervals) {
            const scheduledTime = new Date(meetingTime.getTime() - (interval.minutes * 60 * 1000));
            
            // Only schedule if the notification time is in the future
            if (scheduledTime > new Date()) {
                const meetingUrl = `${process.env.BASE_URL || 'http://localhost'}/volunteer/dashboard/upcoming.html`;
                
                // Create volunteer notification
                const volunteerNotification = await pool.query(insertQuery, [
                    volunteer.id,                                              // $1: user_id
                    'volunteer',                                               // $2: recipient_role
                    interval.title,                                            // $3: title
                    `Your meeting with ${student.full_name || student.name} is starting in ${interval.minutes} minutes on ${meetingDate} at ${meetingTimeStr}. Click to join!`, // $4: message
                    interval.type,                                             // $5: type (now using correct DB-allowed type)
                    interval.priority,                                         // $6: priority
                    JSON.stringify({ 
                        meeting_id: meeting.id, 
                        meeting_link: meeting.room_url,
                        student_name: student.full_name || student.name,
                        volunteer_name: volunteer.full_name || volunteer.name,
                        scheduled_time: meeting.scheduled_time,
                        duration: meeting.duration || 40
                    }),                                                        // $7: metadata
                    scheduledTime.toISOString(),                               // $8: scheduled_for (timestamp)
                    true,                                                      // $9: is_persistent
                    new Date(Date.now() + interval.autoDeleteAfter * 60000).toISOString(),  // $10: auto_delete_after (timestamp) 
                    interval.requireInteraction,                               // $11: require_interaction
                    meetingUrl,                                                // $12: action_url
                    '/favicon.ico',                                            // $13: icon_url
                    '/favicon.ico',                                            // $14: badge_url
                    `meeting-${meeting.id}-${interval.minutes}min`            // $15: tag
                ]);
                
                notifications.push(volunteerNotification.rows[0]);
                
                // Create student notification
                const studentNotification = await pool.query(insertQuery, [
                    student.id,                                                // $1: user_id
                    'student',                                                 // $2: recipient_role
                    interval.title,                                            // $3: title
                    `Your meeting with ${volunteer.full_name || volunteer.name} is starting in ${interval.minutes} minutes on ${meetingDate} at ${meetingTimeStr}. Get ready!`, // $4: message
                    interval.type,                                             // $5: type (now using correct DB-allowed type)
                    interval.priority,                                         // $6: priority
                    JSON.stringify({ 
                        meeting_id: meeting.id, 
                        meeting_link: meeting.room_url,
                        student_name: student.full_name || student.name,
                        volunteer_name: volunteer.full_name || volunteer.name,
                        scheduled_time: meeting.scheduled_time,
                        duration: meeting.duration || 40
                    }),                                                        // $7: metadata
                    scheduledTime.toISOString(),                               // $8: scheduled_for (timestamp)
                    true,                                                      // $9: is_persistent
                    new Date(Date.now() + interval.autoDeleteAfter * 60000).toISOString(),  // $10: auto_delete_after (timestamp)
                    interval.requireInteraction,                               // $11: require_interaction
                    `/student/dashboard`,                                      // $12: action_url
                    '/favicon.ico',                                            // $13: icon_url
                    '/favicon.ico',                                            // $14: badge_url
                    `meeting-${meeting.id}-${interval.minutes}min`            // $15: tag
                ]);
                
                notifications.push(studentNotification.rows[0]);
            }
        }
        
        return notifications;
    } catch (error) {
        console.error('Error scheduling meeting notifications:', error);
        throw error;
    }
};

/**
 * Process scheduled notifications that are due
 * This should be called by a cron job or scheduler
 * @returns {number} Number of notifications processed
 */
export const processScheduledNotifications = async () => {
    try {
        const now = new Date();
        
        // Find notifications scheduled for now or earlier that haven't been sent
        const result = await pool.query(
            `SELECT * FROM notifications 
            WHERE scheduled_for <= $1 
            AND scheduled_for IS NOT NULL
            AND is_sent = false`,
            [now.toISOString()]
        );
        
        let count = 0;
        
        for (const notification of result.rows) {
            // Determine channels based on notification priority and type
            let channels = ['in-app'];
            
            // Always add push notifications for meeting reminders
            if (notification.type.includes('meeting_reminder') || notification.type.includes('meeting_')) {
                channels.push('push');
            }
            
            if (notification.priority === 'high' || notification.priority === 'urgent') {
                channels.push('email');
                if (!channels.includes('push')) {
                    channels.push('push');
                }
            }
            
            if (notification.priority === 'urgent') {
                channels.push('sms');
            }
            
            // 🚀 AUTO-LAUNCH LOGIC: Trigger meeting auto-launch for 5-minute reminders
            if (notification.type === 'meeting_reminder_5min') {
                await triggerMeetingAutoLaunch(notification);
            }
            
            // Send the notification through appropriate channels
            await sendNotification({
                recipient_id: notification.recipient_id,
                recipient_role: notification.recipient_role,
                title: notification.title,
                message: notification.message,
                type: notification.type,
                priority: notification.priority,
                metadata: notification.metadata
            }, channels);
            
            // Mark as processed
            await pool.query(
                `UPDATE notifications 
                SET is_sent = true, sent_at = NOW() 
                WHERE id = $1`,
                [notification.id]
            );
            
            count++;
        }
        
        return count;
    } catch (error) {
        console.error('Error processing scheduled notifications:', error);
        throw error;
    }
};

/**
 * Trigger meeting auto-launch when 5-minute reminder is sent
 * Sends Socket.IO events to both participants to auto-open video call
 * @param {Object} notification - The 5-minute reminder notification
 */
const triggerMeetingAutoLaunch = async (notification) => {
    try {
        const metadata = notification.metadata;
        const meetingId = metadata.meeting_id;
        
        console.log(`🚀 Triggering auto-launch for meeting ${meetingId}`);
        
        // Get meeting details from database
        const meetingResult = await pool.query(
            `SELECT m.*, 
                    v.id as volunteer_id, v.full_name as volunteer_name, v.email as volunteer_email,
                    s.id as student_id, s.full_name as student_name, s.email as student_email
            FROM meetings m
            LEFT JOIN users v ON m.volunteer_id = v.id AND v.role = 'volunteer'
            LEFT JOIN users s ON m.student_id = s.id AND s.role = 'student'
            WHERE m.id = $1 AND m.status = 'scheduled'`,
            [meetingId]
        );
        
        if (meetingResult.rows.length === 0) {
            console.log(`❌ Meeting ${meetingId} not found or not scheduled`);
            return;
        }
        
        const meeting = meetingResult.rows[0];
        const meetingUrl = `/call.html?room=${meeting.room_id}&meeting=${meetingId}`;
        
        // Create auto-launch data
        const autoLaunchData = {
            meetingId: meetingId,
            roomId: meeting.room_id,
            meetingUrl: meetingUrl,
            scheduledTime: meeting.scheduled_time,
            duration: meeting.duration || 40,
            volunteer: {
                id: meeting.volunteer_id,
                name: meeting.volunteer_name,
                email: meeting.volunteer_email
            },
            student: {
                id: meeting.student_id,
                name: meeting.student_name,
                email: meeting.student_email
            },
            timestamp: new Date().toISOString(),
            type: 'meeting_auto_launch'
        };
        
        // Send Socket.IO events to both participants
        const io = getIO();
        
        // Send to volunteer
        io.to(`user_${meeting.volunteer_id}`).emit('meeting-auto-launch', {
            ...autoLaunchData,
            userRole: 'volunteer',
            message: `Your meeting with ${meeting.student_name} is starting in 5 minutes! Click to join.`,
            actionUrl: `${meetingUrl}&role=volunteer&studentId=${meeting.student_id}&studentName=${encodeURIComponent(meeting.student_name)}`
        });
        
        // Send to student  
        io.to(`user_${meeting.student_id}`).emit('meeting-auto-launch', {
            ...autoLaunchData,
            userRole: 'student',
            message: `Your meeting with ${meeting.volunteer_name} is starting in 5 minutes! Get ready to join.`,
            actionUrl: `${meetingUrl}&role=student&volunteerId=${meeting.volunteer_id}&volunteerName=${encodeURIComponent(meeting.volunteer_name)}`
        });
        
        // Also emit to notification rooms for real-time updates
        io.to(`notifications_volunteer_${meeting.volunteer_id}`).emit('meeting-ready-to-start', autoLaunchData);
        io.to(`notifications_student_${meeting.student_id}`).emit('meeting-ready-to-start', autoLaunchData);
        
        console.log(`✅ Auto-launch events sent for meeting ${meetingId} to volunteer ${meeting.volunteer_id} and student ${meeting.student_id}`);
        
    } catch (error) {
        console.error('❌ Error triggering meeting auto-launch:', error);
        // Don't throw error - auto-launch failure shouldn't break notification processing
    }
};

/**
 * Cancel all notifications for a meeting
 * Used when a meeting is cancelled or rescheduled
 * @param {string} meetingId - Meeting ID
 * @returns {boolean} Success status
 */
export const cancelMeetingNotifications = async (meetingId) => {
    try {
        const deleteQuery = `
            DELETE FROM notifications 
            WHERE metadata->>'meeting_id' = $1 
            AND scheduled_for IS NOT NULL
            AND sent_at IS NULL
        `;
        
        const result = await pool.query(deleteQuery, [meetingId.toString()]);
        console.log(`🗑️ Cancelled ${result.rowCount} scheduled notifications for meeting ${meetingId}`);
        return result.rowCount > 0;
    } catch (error) {
        console.error('Error cancelling meeting notifications:', error);
        throw error;
    }
};

/**
 * Send parental approval request notification
 * @param {Object} userData - User data requiring approval
 * @param {string} approvalToken - Approval token for the link
 * @returns {boolean} Success status
 */
export const sendParentalApprovalRequest = async (userData, approvalToken) => {
    try {
        const approvalLink = `${process.env.BASE_URL || 'http://localhost:3000'}/api/v1/auth/approve-parent/${approvalToken}`;
        
        const emailSubject = 'TalkTime: Parental Approval Required for Your Child\'s Volunteer Account';
        const emailContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #4f46e5; font-size: 28px; margin: 0;">TALKTIME</h1>
                    <p style="color: #6b7280; margin: 5px 0;">Connecting Hearts, Building Futures</p>
                </div>
                
                <h2 style="color: #374151; margin-bottom: 20px;">Parental Approval Required</h2>
                
                <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                    Dear Parent/Guardian,
                </p>
                
                <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                    Your ${userData.is_under_18 ? 'child' : 'student'}, <strong>${userData.full_name}</strong> (${userData.email}), has signed up to become a volunteer with TalkTime${userData.volunteer_type === 'student_volunteer' ? ' as a student volunteer' : ''}, 
                    a platform that connects Maasai students in Kenya with global volunteers for English language practice.
                </p>
                
                <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                    Since ${userData.volunteer_type === 'student_volunteer' ? 'they are participating as a student volunteer' : userData.is_under_18 ? 'your child is under 18' : 'they are participating in our program'}, we require your explicit approval before they can participate.
                </p>
                
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #374151; margin-top: 0;">What TalkTime Offers:</h3>
                    <ul style="color: #4b5563; line-height: 1.6;">
                        <li>Safe, supervised video conversations with Maasai students</li>
                        <li>Flexible scheduling that works with your schedule</li>
                        ${userData.volunteer_type === 'student_volunteer' ? '<li>Community service hours and official documentation for volunteering</li>' : ''}
                        <li>Cultural exchange and language learning opportunities</li>
                        <li>Professional oversight and safety measures</li>
                    </ul>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${approvalLink}" 
                       style="background-color: #10b981; color: white; padding: 12px 30px; 
                              text-decoration: none; border-radius: 6px; font-weight: bold; 
                              display: inline-block;">APPROVE PARTICIPATION</a>
                </div>
                
                <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin-top: 30px;">
                    <strong>Important:</strong> This approval link will expire in 7 days. If you have any questions 
                    about TalkTime or need more information, please contact us at support@talktime.org
                </p>
                
                <p style="color: #6b7280; font-size: 14px; line-height: 1.5;">
                    If you did not expect this email or believe this is an error, please ignore this message.
                </p>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                
                <div style="text-align: center; color: #9ca3af; font-size: 12px;">
                    <p>TalkTime by ADEA Foundation</p>
                    <p>Empowering Maasai Youth Through English Conversation</p>
                </div>
            </div>
        `;
        
        const smsMessage = `TalkTime: Your ${userData.is_under_18 ? 'child' : 'student'} ${userData.full_name} needs parental approval to volunteer${userData.volunteer_type === 'student_volunteer' ? ' as a student volunteer' : ''}. Click: ${approvalLink} (Expires in 7 days)`;
        
        // Send email notification
        if (userData.parent_email) {
            await sendEmail({
                to: userData.parent_email,
                subject: emailSubject,
                html: emailContent
            });
        }
        
        // Send SMS notification
        if (userData.parent_phone) {
            await sendSMS({
                to: userData.parent_phone,
                body: smsMessage
            });
        }
        
        return true;
    } catch (error) {
        console.error('Error sending parental approval request:', error);
        throw error;
    }
};

/**
 * Send parental approval confirmation notification
 * @param {Object} userData - User data that was approved
 * @returns {boolean} Success status
 */
export const sendParentalApprovalConfirmation = async (userData) => {
    try {
        const emailSubject = 'TalkTime: Parental Approval Confirmed - Welcome to Our Community!';
        const emailContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #4f46e5; font-size: 28px; margin: 0;">TALKTIME</h1>
                    <p style="color: #6b7280; margin: 5px 0;">Connecting Hearts, Building Futures</p>
                </div>
                
                <div style="background-color: #10b981; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
                    <h2 style="margin: 0; font-size: 24px;">🎉 Approval Confirmed!</h2>
                </div>
                
                <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                    Dear ${userData.full_name},
                </p>
                
                <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                    Great news! Your parent/guardian has approved your participation in TalkTime${userData.volunteer_type === 'student_volunteer' ? ' as a student volunteer' : ''}. 
                    You can now start scheduling conversations with Maasai students and making a real difference in their lives.
                </p>
                
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #374151; margin-top: 0;">Next Steps:</h3>
                    <ol style="color: #4b5563; line-height: 1.6;">
                        <li>Log in to your TalkTime dashboard</li>
                        <li>Browse available students and their stories</li>
                        <li>Schedule your first conversation</li>
                        <li>Start making a difference!</li>
                    </ol>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.BASE_URL || 'http://localhost:3000'}/volunteer/dashboard" 
                       style="background-color: #4f46e5; color: white; padding: 12px 30px; 
                              text-decoration: none; border-radius: 6px; font-weight: bold; 
                              display: inline-block;">GO TO DASHBOARD</a>
                </div>
                
                <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin-top: 30px;">
                    If you have any questions or need help getting started, please contact us at support@talktime.org
                </p>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                
                <div style="text-align: center; color: #9ca3af; font-size: 12px;">
                    <p>TalkTime by ADEA Foundation</p>
                    <p>Empowering Maasai Youth Through English Conversation</p>
                </div>
            </div>
        `;
        
        // Send email to the user
        await sendEmail({
            to: userData.email,
            subject: emailSubject,
            html: emailContent
        });
        
        // Send confirmation SMS to user if they have a phone number
        if (userData.phone) {
            await sendSMS({
                to: userData.phone,
                body: `TalkTime: Your parent approved your volunteer account${userData.volunteer_type === 'student_volunteer' ? ' as a student volunteer' : ''}! You can now start scheduling conversations. Login at ${process.env.BASE_URL || 'http://localhost:3000'}`
            });
        }
        
        return true;
    } catch (error) {
        console.error('Error sending parental approval confirmation:', error);
        throw error;
    }
};
