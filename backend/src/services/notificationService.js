/**
 * Notification Service
 * Handles sending notifications through various channels
 */
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Meeting from '../models/Meeting.js';
import { sendEmail } from '../utils/emailSender.js';
import { sendSMS } from '../utils/smsSender.js';
import { formatDate, formatTime } from '../utils/dateFormatter.js';

/**
 * Send a notification through specified channels
 * @param {Object} notification - Notification data
 * @param {Array} channels - Channels to send through ('in-app', 'email', 'sms', 'push')
 * @returns {Object} Created notification
 */
export const sendNotification = async (notification, channels = ['in-app']) => {
    try {
        // Create in-app notification
        const createdNotification = await Notification.create({
            ...notification,
            channel: channels.join(',')
        });
        
        // Get user details for external notifications
        const user = await User.findById(notification.userId);
        if (!user) {
            console.error(`User not found for notification: ${notification.userId}`);
            return createdNotification;
        }
        
        // Send through each requested channel
        for (const channel of channels) {
            switch (channel) {
                case 'email':
                    if (user.email) {
                        await sendEmail({
                            to: user.email,
                            subject: notification.title,
                            html: `<h1>${notification.title}</h1><p>${notification.message}</p>`
                        });
                    }
                    break;
                    
                case 'sms':
                    if (user.phone) {
                        await sendSMS({
                            to: user.phone,
                            body: `${notification.title}: ${notification.message}`
                        });
                    }
                    break;
                    
                case 'push':
                    // Push notifications would be implemented here
                    // This would typically use web push notifications API
                    // or a service like Firebase Cloud Messaging
                    break;
                    
                default:
                    // in-app notifications are handled by default through the database
                    break;
            }
        }
        
        return createdNotification;
    } catch (error) {
        console.error('Error sending notification:', error);
        throw error;
    }
};

/**
 * Schedule meeting notifications for both volunteer and student
 * @param {Object} meeting - Meeting data
 * @returns {Array} Created notifications
 */
export const scheduleMeetingNotifications = async (meeting) => {
    try {
        const meetingTime = new Date(meeting.scheduledTime);
        const meetingDate = formatDate(meetingTime);
        const meetingTimeStr = formatTime(meetingTime);
        
        // Get meeting participants
        const volunteer = await User.findById(meeting.volunteerId);
        const student = await User.findById(meeting.studentId);
        
        if (!volunteer || !student) {
            console.error('Could not find meeting participants');
            return [];
        }
        
        const notifications = [];
        
        // Schedule notifications for both participants at different time intervals
        const intervals = [
            { minutes: 60, title: '1-Hour Meeting Reminder', priority: 'low', channels: ['email', 'in-app'] },
            { minutes: 30, title: '30-Minute Meeting Reminder', priority: 'medium', channels: ['email', 'in-app', 'push'] },
            { minutes: 5, title: '5-Minute Meeting Reminder', priority: 'high', channels: ['in-app', 'push', 'sms'] }
        ];
        
        for (const interval of intervals) {
            const scheduledTime = new Date(meetingTime.getTime() - (interval.minutes * 60 * 1000));
            
            // Only schedule if the notification time is in the future
            if (scheduledTime > new Date()) {
                // Create volunteer notification
                const volunteerNotification = await Notification.create({
                    userId: volunteer.id,
                    type: 'meeting-reminder',
                    title: interval.title,
                    message: `Your meeting with ${student.firstName} ${student.lastName} is starting in ${interval.minutes} minutes on ${meetingDate} at ${meetingTimeStr}.`,
                    meetingId: meeting.id,
                    priority: interval.priority,
                    scheduledFor: scheduledTime.toISOString()
                });
                
                notifications.push(volunteerNotification);
                
                // Create student notification
                const studentNotification = await Notification.create({
                    userId: student.id,
                    type: 'meeting-reminder',
                    title: interval.title,
                    message: `Your meeting with ${volunteer.firstName} ${volunteer.lastName} is starting in ${interval.minutes} minutes on ${meetingDate} at ${meetingTimeStr}.`,
                    meetingId: meeting.id,
                    priority: interval.priority,
                    scheduledFor: scheduledTime.toISOString()
                });
                
                notifications.push(studentNotification);
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
        
        // Find notifications scheduled for now or earlier that haven't been processed
        const result = await db.query(
            `SELECT * FROM notifications 
            WHERE scheduled_for <= $1 
            AND scheduled_for IS NOT NULL
            AND channel IS NULL`,
            [now.toISOString()]
        );
        
        let count = 0;
        
        for (const dbNotification of result.rows) {
            const notification = Notification.mapNotificationFromDb(dbNotification);
            
            // Determine channels based on notification priority
            let channels = ['in-app'];
            
            if (notification.priority === 'medium' || notification.priority === 'high') {
                channels.push('email');
                channels.push('push');
            }
            
            if (notification.priority === 'high') {
                channels.push('sms');
            }
            
            // Send the notification through appropriate channels
            await sendNotification(notification, channels);
            
            // Mark as processed by setting channel
            await db.query(
                `UPDATE notifications 
                SET channel = $1 
                WHERE id = $2`,
                [channels.join(','), notification.id]
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
 * Cancel all notifications for a meeting
 * Used when a meeting is cancelled or rescheduled
 * @param {string} meetingId - Meeting ID
 * @returns {boolean} Success status
 */
export const cancelMeetingNotifications = async (meetingId) => {
    try {
        return await Notification.deleteByMeetingId(meetingId);
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
                    Your child, <strong>${userData.full_name}</strong> (${userData.email}), has signed up to become a volunteer with TalkTime, 
                    a platform that connects Maasai students in Kenya with global volunteers for English language practice.
                </p>
                
                <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                    Since your child is under 18, we require your explicit approval before they can participate in our program.
                </p>
                
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #374151; margin-top: 0;">What TalkTime Offers:</h3>
                    <ul style="color: #4b5563; line-height: 1.6;">
                        <li>Safe, supervised video conversations with Maasai students</li>
                        <li>Flexible scheduling that works with your child's availability</li>
                        <li>Community service hours and official documentation</li>
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
        
        const smsMessage = `TalkTime: Your child ${userData.full_name} needs parental approval to volunteer. Click: ${approvalLink} (Expires in 7 days)`;
        
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
                    Great news! Your parent/guardian has approved your participation in TalkTime. 
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
                body: `TalkTime: Your parent approved your volunteer account! You can now start scheduling conversations. Login at ${process.env.BASE_URL || 'http://localhost:3000'}`
            });
        }
        
        return true;
    } catch (error) {
        console.error('Error sending parental approval confirmation:', error);
        throw error;
    }
};
