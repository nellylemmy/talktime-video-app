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
 * @desc    Get current student's info
 * @access  Private (Student only)
 */
router.get('/me/info', studentJWTMiddleware, async (req, res) => {
    try {
        const studentId = req.user.id;
        
        const query = 'SELECT id, username, full_name, email, created_at FROM users WHERE id = $1 AND role = $2';
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
                email: student.email,
                admissionNumber: student.username,
                joinedDate: student.created_at
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
            AND m.scheduled_time > NOW()
            AND m.status IN ('scheduled', 'confirmed')
            ORDER BY m.scheduled_time ASC
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
            AND (m.scheduled_time < NOW() OR m.status IN ('completed', 'cancelled', 'missed'))
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
        
        // For now, return empty array as instant calls might be handled differently
        // This can be expanded when instant call functionality is fully implemented
        res.json({
            success: true,
            data: []
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
 * @desc    Get current student's messages
 * @access  Private (Student only)
 */
router.get('/me/messages', studentJWTMiddleware, async (req, res) => {
    try {
        const studentId = req.user.id;
        
        const query = `
            SELECT 
                id,
                sender_id,
                recipient_id,
                content,
                type,
                is_read,
                created_at
            FROM messages 
            WHERE recipient_id = $1 OR sender_id = $1
            ORDER BY created_at DESC
            LIMIT 50
        `;
        
        const { rows } = await pool.query(query, [studentId]);
        
        res.json({
            success: true,
            data: rows.map(message => ({
                id: message.id,
                senderId: message.sender_id,
                recipientId: message.recipient_id,
                content: message.content,
                type: message.type,
                isRead: message.is_read,
                createdAt: message.created_at
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
 * @route   GET /api/v1/students/me/notifications
 * @desc    Get current student's notifications
 * @access  Private (Student only)
 */
router.get('/me/notifications', studentJWTMiddleware, async (req, res) => {
    try {
        const studentId = req.user.id;
        
        const query = `
            SELECT 
                id,
                user_id,
                type,
                title,
                message,
                is_read,
                created_at
            FROM notifications 
            WHERE user_id = $1
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

export default router;
