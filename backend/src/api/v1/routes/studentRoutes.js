/**
 * Student Data Routes
 * Unified system using users table with role='student'
 */
import express from 'express';
import pool from '../../../config/database.js';
import { createJWTMiddleware } from '../../../utils/jwt.js';

const router = express.Router();

// Create JWT middleware for student authentication
const studentJWTMiddleware = createJWTMiddleware(['student']);

/**
 * @route   GET /api/v1/students/me/info
 * @desc    Get current student's info (all relevant fields)
 * @access  Private (Student only)
 */
router.get('/me/info', studentJWTMiddleware, async (req, res) => {
    try {
        const studentId = req.user.id;

        // Select all relevant fields (exclude sensitive data like password_hash)
        const query = `
            SELECT
                id, username, full_name, email, role,
                profile_image, age, gender, phone, timezone,
                school_name, created_at, updated_at
            FROM users
            WHERE id = $1 AND role = $2
        `;
        const { rows } = await pool.query(query, [studentId, 'student']);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        const student = rows[0];
        res.json({
            success: true,
            data: {
                id: student.id,
                fullName: student.full_name,
                username: student.username,
                admissionNumber: student.username,
                email: student.email,
                role: student.role,
                profileImage: student.profile_image || null,
                age: student.age || null,
                gender: student.gender || null,
                phone: student.phone || null,
                timezone: student.timezone || 'UTC',
                schoolName: student.school_name || null,
                createdAt: student.created_at,
                updatedAt: student.updated_at
            }
        });

    } catch (error) {
        console.error('Error fetching student info:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching student information'
        });
    }
});

/**
 * @route   GET /api/v1/students/me/meetings/upcoming
 * @desc    Get current student's upcoming meetings
 * @access  Private (Student only)
 */
router.get('/me/meetings/upcoming', studentJWTMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get the student's ID from the students table via the user_id link
        const studentLookup = await pool.query(
            'SELECT id FROM students WHERE user_id = $1 LIMIT 1',
            [userId]
        );
        const studentsTableId = studentLookup.rows.length > 0 ? studentLookup.rows[0].id : null;

        console.log('📅 Fetching upcoming meetings for student:', {
            userId,
            studentsTableId
        });

        // Query meetings where student_id matches either users.id OR students.id
        // This handles both instant calls (which use users.id) and scheduled meetings (which may use students.id)
        const query = `
            SELECT
                m.id,
                m.scheduled_time,
                m.status,
                m.reschedule_count,
                m.room_id,
                m.volunteer_id,
                m.created_at,
                v.full_name as volunteer_name,
                v.email as volunteer_email,
                v.profile_image as volunteer_image
            FROM meetings m
            JOIN users v ON m.volunteer_id = v.id
            WHERE (m.student_id = $1 OR m.student_id = $2)
            AND m.scheduled_time > NOW()
            AND m.status IN ('scheduled', 'confirmed', 'pending')
            AND m.is_instant = FALSE
            ORDER BY m.scheduled_time ASC
        `;

        const { rows } = await pool.query(query, [userId, studentsTableId]);

        res.json({
            success: true,
            data: rows.map(meeting => ({
                id: meeting.id,
                scheduledTime: meeting.scheduled_time,
                status: meeting.status,
                rescheduleCount: meeting.reschedule_count || 0,
                roomId: meeting.room_id,
                volunteerId: meeting.volunteer_id,
                volunteerName: meeting.volunteer_name,
                volunteerEmail: meeting.volunteer_email,
                volunteerImage: meeting.volunteer_image,
                createdAt: meeting.created_at
            }))
        });

    } catch (error) {
        console.error('Error fetching upcoming meetings:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching upcoming meetings'
        });
    }
});

/**
 * @route   GET /api/v1/students/me/meetings/history
 * @desc    Get current student's meeting history
 * @access  Private (Student only)
 */
router.get('/me/meetings/history', studentJWTMiddleware, async (req, res) => {
    try {
        const studentId = req.user.id;
        
        const query = `
            SELECT 
                m.id,
                m.scheduled_time,
                m.status,
                m.reschedule_count,
                m.created_at,
                v.full_name as volunteer_name,
                v.email as volunteer_email
            FROM meetings m
            JOIN users v ON m.volunteer_id = v.id
            WHERE m.student_id = $1
            AND (m.scheduled_time < NOW() OR m.status IN ('completed', 'cancelled', 'missed', 'declined'))
            ORDER BY m.scheduled_time DESC
            LIMIT 50
        `;
        
        const { rows } = await pool.query(query, [studentId]);
        
        res.json({
            success: true,
            data: rows.map(meeting => ({
                id: meeting.id,
                scheduledTime: meeting.scheduled_time,

                status: meeting.status,
                rescheduleCount: meeting.reschedule_count || 0,
                volunteerName: meeting.volunteer_name,
                volunteerEmail: meeting.volunteer_email,
                createdAt: meeting.created_at
            }))
        });
        
    } catch (error) {
        console.error('Error fetching meeting history:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching meeting history'
        });
    }
});

/**
 * @route   GET /api/v1/students/me/instant-calls
 * @desc    Get current student's instant call history
 * @access  Private (Student only)
 */
router.get('/me/instant-calls', studentJWTMiddleware, async (req, res) => {
    try {
        const studentId = req.user.id;

        // Query instant calls from meetings table where is_instant = true
        const query = `
            SELECT
                m.id,
                m.scheduled_time,
                m.status,
                m.room_id,
                m.created_at,
                m.is_instant,
                v.full_name as volunteer_name,
                v.email as volunteer_email
            FROM meetings m
            JOIN users v ON m.volunteer_id = v.id
            WHERE m.student_id = $1
            AND m.is_instant = TRUE
            ORDER BY m.scheduled_time DESC
            LIMIT 50
        `;

        const { rows } = await pool.query(query, [studentId]);

        res.json({
            success: true,
            data: rows.map(call => ({
                id: call.id,
                scheduledTime: call.scheduled_time,
                status: call.status,
                roomId: call.room_id,
                volunteerName: call.volunteer_name,
                volunteerEmail: call.volunteer_email,
                isInstant: call.is_instant,
                createdAt: call.created_at
            }))
        });

    } catch (error) {
        console.error('Error fetching instant calls:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching instant calls'
        });
    }
});

/**
 * @route   GET /api/v1/students/me/messages
 * @desc    Get current student's messages with sender/recipient info
 * @access  Private (Student only)
 */
router.get('/me/messages', studentJWTMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        console.log('📨 Fetching messages for student:', { userId });

        // Query messages where student (users.id) is sender or recipient
        // Messages are stored with users.id, not students.id
        const query = `
            SELECT
                m.id,
                m.sender_id,
                m.recipient_id,
                m.content,
                m.type,
                m.is_read,
                m.meeting_id,
                m.created_at,
                COALESCE(sender.full_name, 'Unknown') as sender_name,
                sender.profile_image as sender_image,
                COALESCE(sender.role, 'unknown') as sender_role,
                COALESCE(recipient.full_name, 'Unknown') as recipient_name,
                recipient.profile_image as recipient_image,
                COALESCE(recipient.role, 'volunteer') as recipient_role
            FROM messages m
            LEFT JOIN users sender ON m.sender_id = sender.id
            LEFT JOIN users recipient ON m.recipient_id = recipient.id
            WHERE m.sender_id = $1 OR m.recipient_id = $1
            ORDER BY m.created_at DESC
            LIMIT 50
        `;

        const { rows } = await pool.query(query, [userId]);

        res.json({
            success: true,
            data: rows.map(message => ({
                id: message.id,
                senderId: message.sender_id,
                senderName: message.sender_name,
                senderImage: message.sender_image,
                senderRole: message.sender_role,
                recipientId: message.recipient_id,
                recipientName: message.recipient_name,
                recipientImage: message.recipient_image,
                recipientRole: message.recipient_role,
                content: message.content,
                type: message.type,
                meetingId: message.meeting_id,
                isRead: message.is_read,
                createdAt: message.created_at,
                isSentByMe: message.sender_id === userId
            }))
        });

    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching messages'
        });
    }
});

/**
 * @route   PATCH /api/v1/students/me/messages/read
 * @desc    Mark messages from a specific sender as read
 * @access  Private (Student only)
 */
router.patch('/me/messages/read', studentJWTMiddleware, async (req, res) => {
    try {
        const studentId = req.user.id;
        const { senderId } = req.body;

        if (!senderId) {
            return res.status(400).json({
                success: false,
                message: 'senderId is required'
            });
        }

        // Mark all messages from this sender to the student as read
        const result = await pool.query(
            `UPDATE messages
             SET is_read = true
             WHERE recipient_id = $1 AND sender_id = $2 AND is_read = false`,
            [studentId, senderId]
        );

        // Also mark related message notifications as read
        // Notifications have type 'new_message' and metadata containing sender_id
        await pool.query(
            `UPDATE notifications
             SET is_read = true, updated_at = NOW()
             WHERE recipient_id = $1
               AND type = 'new_message'
               AND is_read = false
               AND metadata->>'sender_id' = $2`,
            [studentId, senderId.toString()]
        );

        res.json({
            success: true,
            markedCount: result.rowCount
        });

    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({
            success: false,
            message: 'Server error marking messages as read'
        });
    }
});

/**
 * @route   GET /api/v1/students/me/messages/unread-count
 * @desc    Get count of unread messages for the student
 * @access  Private (Student only)
 */
router.get('/me/messages/unread-count', studentJWTMiddleware, async (req, res) => {
    try {
        const studentId = req.user.id;

        const result = await pool.query(
            `SELECT COUNT(*) as count
             FROM messages
             WHERE recipient_id = $1 AND is_read = false`,
            [studentId]
        );

        // Disable caching
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        });

        res.json({
            success: true,
            unreadCount: parseInt(result.rows[0].count, 10)
        });

    } catch (error) {
        console.error('Error fetching unread message count:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching unread count'
        });
    }
});

/**
 * @route   GET /api/v1/students/me/notifications
 * @desc    Get current student's notifications (excludes future scheduled reminders)
 * @access  Private (Student only)
 */
router.get('/me/notifications', studentJWTMiddleware, async (req, res) => {
    try {
        const studentId = req.user.id;

        // Only show notifications that are:
        // 1. Immediate notifications (scheduled_for IS NULL)
        // 2. Scheduled notifications whose time has passed (scheduled_for <= NOW())
        // 3. Already sent notifications (is_sent = true)
        const query = `
            SELECT
                id,
                COALESCE(user_id, recipient_id) as user_id,
                type,
                title,
                message,
                is_read,
                created_at,
                scheduled_for
            FROM notifications
            WHERE (user_id = $1 OR recipient_id = $1)
            AND (scheduled_for IS NULL OR scheduled_for <= NOW() OR is_sent = true)
            ORDER BY created_at DESC
            LIMIT 50
        `;

        const { rows } = await pool.query(query, [studentId]);

        res.json({
            success: true,
            data: rows.map(notification => ({
                id: notification.id,
                userId: notification.user_id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                isRead: notification.is_read,
                createdAt: notification.created_at
            }))
        });

    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching notifications'
        });
    }
});

/**
 * @route   POST /api/v1/students/me/notifications/read-all
 * @desc    Mark all notifications as read for current student
 * @access  Private (Student only)
 */
router.post('/me/notifications/read-all', studentJWTMiddleware, async (req, res) => {
    try {
        const studentId = req.user.id;

        await pool.query(
            'UPDATE notifications SET is_read = TRUE, updated_at = NOW() WHERE (user_id = $1 OR recipient_id = $1) AND is_read = FALSE',
            [studentId]
        );

        res.json({
            success: true,
            message: 'All notifications marked as read'
        });

    } catch (error) {
        console.error('Error marking notifications read:', error);
        res.status(500).json({
            success: false,
            message: 'Server error marking notifications read'
        });
    }
});

/**
 * @route   GET /api/v1/students/me/notifications/unread-count
 * @desc    Get count of unread notifications for current student (excludes future scheduled)
 * @access  Private (Student only)
 */
router.get('/me/notifications/unread-count', studentJWTMiddleware, async (req, res) => {
    try {
        const studentId = req.user.id;

        // Only count notifications that should be visible (not future scheduled reminders)
        const result = await pool.query(
            `SELECT COUNT(*) as count
             FROM notifications
             WHERE (user_id = $1 OR recipient_id = $1)
             AND is_read = FALSE
             AND (scheduled_for IS NULL OR scheduled_for <= NOW() OR is_sent = true)`,
            [studentId]
        );

        res.json({
            success: true,
            count: parseInt(result.rows[0].count) || 0
        });

    } catch (error) {
        console.error('Error fetching unread notification count:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching unread count',
            count: 0
        });
    }
});

/**
 * @route   POST /api/v1/students/me/notifications/:id/read
 * @desc    Mark a single notification as read
 * @access  Private (Student only)
 */
router.post('/me/notifications/:id/read', studentJWTMiddleware, async (req, res) => {
    try {
        const studentId = req.user.id;
        const notificationId = req.params.id;

        const result = await pool.query(
            'UPDATE notifications SET is_read = TRUE, updated_at = NOW() WHERE id = $1 AND (user_id = $2 OR recipient_id = $2) RETURNING id',
            [notificationId, studentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            message: 'Notification marked as read'
        });

    } catch (error) {
        console.error('Error marking notification read:', error);
        res.status(500).json({
            success: false,
            message: 'Server error marking notification read'
        });
    }
});

export default router;
