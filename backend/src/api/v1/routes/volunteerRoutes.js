/**
 * Volunteer API Routes
 * RESTful API endpoints for volunteer functionality
 */
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from '../../../config/database.js';
import { createJWTMiddleware } from '../../../utils/jwt.js';
import Meeting from '../../../models/Meeting.js';
import * as notificationService from '../../../services/notificationService.js';

const router = express.Router();
const volunteerJWTMiddleware = createJWTMiddleware(['volunteer']);

import * as volunteerController from '../controllers/volunteerController.js';

console.log('Volunteer routes file loaded');

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/profiles';
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename: volunteerId-timestamp.extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `volunteer-${req.user.id}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        // Accept only image files
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
        }
    }
});

/**
 * @route   GET /api/v1/volunteers/profile
 * @desc    Get volunteer profile data
 * @access  Private (Volunteers only)
 */
router.get('/profile', volunteerController.getVolunteerProfile);

/**
 * @route   PUT /api/v1/volunteers/profile
 * @desc    Update volunteer profile data
 * @access  Private (Volunteers only)
 */
router.put('/profile', volunteerController.updateVolunteerProfile);

/**
 * @route   POST /api/v1/volunteers/profile/image
 * @desc    Upload volunteer profile image
 * @access  Private (Volunteers only)
 */
router.post('/profile/image', upload.single('profileImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const volunteerId = req.user.id;
        const imageUrl = `/uploads/profiles/${req.file.filename}`;

        // Import pool for database update
        const { default: pool } = await import('../../../config/database.js');

        // Update volunteer profile with new image URL
        const updateQuery = `
            UPDATE users
            SET profile_image = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND role = 'volunteer'
            RETURNING id, profile_image
        `;

        const result = await pool.query(updateQuery, [imageUrl, volunteerId]);

        if (result.rows.length === 0) {
            // Delete uploaded file if database update failed
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Volunteer not found' });
        }

        // Return success with the new image URL
        res.json({
            success: true,
            profileImage: imageUrl,
            message: 'Profile image uploaded successfully'
        });

    } catch (error) {
        console.error('Error uploading profile image:', error);

        // Clean up uploaded file on error
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkErr) {
                console.error('Error deleting uploaded file:', unlinkErr);
            }
        }

        res.status(500).json({ error: 'Failed to upload profile image' });
    }
});

/**
 * @route   DELETE /api/v1/volunteers/profile/image
 * @desc    Delete volunteer profile image
 * @access  Private (Volunteers only)
 */
router.delete('/profile/image', async (req, res) => {
    try {
        const volunteerId = req.user.id;

        // Import pool for database operations
        const { default: pool } = await import('../../../config/database.js');

        // First, get the current image path to delete the file
        const selectQuery = `
            SELECT profile_image
            FROM users
            WHERE id = $1 AND role = 'volunteer'
        `;

        const selectResult = await pool.query(selectQuery, [volunteerId]);

        if (selectResult.rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }

        const currentImagePath = selectResult.rows[0].profile_image;

        // Delete the physical file if it exists
        if (currentImagePath) {
            const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..', currentImagePath);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (fileErr) {
                console.error('Error deleting image file:', fileErr);
                // Continue even if file deletion fails
            }
        }

        // Update database to remove image reference
        const updateQuery = `
            UPDATE users
            SET profile_image = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND role = 'volunteer'
            RETURNING id
        `;

        await pool.query(updateQuery, [volunteerId]);

        res.json({
            success: true,
            message: 'Profile image removed successfully'
        });

    } catch (error) {
        console.error('Error removing profile image:', error);
        res.status(500).json({ error: 'Failed to remove profile image' });
    }
});

/**
 * @route   GET /api/v1/volunteers/profile/completion
 * @desc    Get volunteer profile completion percentage
 * @access  Private (Volunteers only)
 */
router.get('/profile/completion', volunteerController.getProfileCompletion);

/**
 * @route   GET /api/v1/volunteers/dashboard-data
 * @desc    Get volunteer dashboard data including name and meetings
 * @access  Private (Volunteers only)
 */
router.get('/dashboard-data', volunteerController.getDashboardData);

/**
 * @route   GET /api/v1/volunteers/performance
 * @desc    Get volunteer performance metrics, reputation score, and impact data
 * @access  Private (Volunteers only)
 */
router.get('/performance', volunteerController.getVolunteerPerformance);

/**
 * @route   GET /api/v1/volunteers/test
 * @desc    Test endpoint to verify route registration
 * @access  Private (Volunteers only)
 */
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Volunteer routes are working', user: req.user });
});

/**
 * @route   GET /api/v1/volunteers/ping
 * @desc    Public test endpoint to verify route registration
 * @access  Public
 */
router.get('/ping', (req, res) => {
    res.json({ success: true, message: 'Volunteer routes are registered and working' });
});

/**
 * @route   GET /api/v1/volunteers/students/cards
 * @desc    Get available student cards HTML
 * @access  Private (Volunteers only)
 */
router.get('/students/cards', volunteerController.getStudentCards);

/**
 * @route   POST /api/v1/volunteers/students/online-status
 * @desc    Check online status for a list of student IDs
 * @access  Private (Volunteers only)
 */
router.post('/students/online-status', async (req, res) => {
    try {
        const { studentIds } = req.body;
        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            return res.json({ online: {} });
        }

        const { getIO } = await import('../../../socket.js');
        const io = getIO();
        if (!io) {
            return res.json({ online: {} });
        }

        // Map students.id → users.id (students join socket rooms with their user_id)
        const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(',');
        const { rows } = await pool.query(
            `SELECT id, user_id FROM students WHERE id IN (${placeholders})`,
            studentIds
        );
        const studentToUser = {};
        rows.forEach(r => { studentToUser[r.id] = r.user_id; });

        const online = {};
        for (const studentId of studentIds) {
            const userId = studentToUser[studentId] || studentId;
            // Check all possible rooms a student might be in
            const rooms = [
                `notifications_student_${userId}`,
                `student_${userId}`,
                `user_${userId}`,
                `student-${userId}`
            ];
            let found = false;
            for (const room of rooms) {
                const sockets = await io.in(room).fetchSockets();
                if (sockets.length > 0) {
                    found = true;
                    break;
                }
            }
            online[studentId] = found;
        }

        res.json({ online });
    } catch (error) {
        console.error('Error checking student online status:', error);
        res.json({ online: {} });
    }
});

/**
 * @route   GET /api/v1/volunteers/students/:id/profile
 * @desc    Get detailed student profile data for volunteers
 * @access  Private (Volunteers only)
 */
router.get('/students/:id/profile', volunteerController.getStudentProfile);

/**
 * @route   POST /api/v1/volunteers/meetings
 * @desc    Create a new meeting between volunteer and student
 * @access  Private (Volunteers only)
 */
router.post('/meetings', volunteerController.createMeeting);

/**
 * @route   GET /api/v1/volunteers/settings
 * @desc    Get volunteer settings
 * @access  Private (Volunteers only)
 */
router.get('/settings', async (req, res) => {
    // Temporary inline implementation to bypass export issues
    try {
        const volunteerId = req.user.id;
        const { default: pool } = await import('../../../config/database.js');

        // First check if settings exist for this volunteer
        const checkQuery = `
            SELECT * FROM volunteer_settings
            WHERE volunteer_id = $1
        `;

        let result = await pool.query(checkQuery, [volunteerId]);

        // If no settings exist, create default settings
        if (result.rows.length === 0) {
            const insertQuery = `
                INSERT INTO volunteer_settings (volunteer_id)
                VALUES ($1)
                RETURNING *
            `;
            result = await pool.query(insertQuery, [volunteerId]);
        }

        const settings = result.rows[0];

        // Format the response
        res.json({
            success: true,
            settings: {
                // Accessibility
                theme_mode: settings.theme_mode || 'light',
                font_size: settings.font_size || 'medium',
                zoom_level: settings.zoom_level || 100,

                // Availability
                max_meetings_per_day: settings.max_meetings_per_day || 3,
                max_meetings_per_week: settings.max_meetings_per_week || 15,
                advance_notice_hours: settings.advance_notice_hours || 2,
                auto_accept_meetings: settings.auto_accept_meetings || false,

                // Timezone
                primary_timezone: settings.primary_timezone || 'UTC',
                display_timezone_preference: settings.display_timezone_preference || 'local',
                dst_handling: settings.dst_handling !== false,

                // Notifications
                email_notifications: settings.email_notifications || {
                    meeting_scheduled: true,
                    meeting_reminder: true,
                    meeting_cancelled: true,
                    meeting_rescheduled: true,
                    system_updates: false,
                    new_student_alerts: false
                },
                sms_notifications: settings.sms_notifications || {
                    meeting_reminder: false,
                    urgent_changes: false
                },
                browser_notifications: settings.browser_notifications || {
                    meeting_reminder: true,
                    meeting_scheduled: true,
                    instant_calls: true
                },
                reminder_timings: settings.reminder_timings || [60, 30, 5]
            }
        });
    } catch (error) {
        console.error('Error fetching volunteer settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

/**
 * @route   PUT /api/v1/volunteers/settings
 * @desc    Update volunteer settings
 * @access  Private (Volunteers only)
 */
router.put('/settings', async (req, res) => {
    // Temporary inline implementation to bypass export issues
    try {
        const volunteerId = req.user.id;
        const updates = req.body;
        const { default: pool } = await import('../../../config/database.js');

        // Build update query dynamically
        const updateFields = [];
        const values = [];
        let paramCount = 1;

        // Map of allowed fields to update
        const allowedFields = [
            'theme_mode', 'font_size', 'zoom_level',
            'max_meetings_per_day', 'max_meetings_per_week',
            'advance_notice_hours', 'auto_accept_meetings',
            'primary_timezone', 'display_timezone_preference', 'dst_handling',
            'email_notifications', 'sms_notifications', 'browser_notifications',
            'reminder_timings'
        ];

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                updateFields.push(`${field} = $${paramCount}`);
                // Handle JSONB fields
                if (['email_notifications', 'sms_notifications', 'browser_notifications'].includes(field)) {
                    values.push(JSON.stringify(updates[field]));
                } else {
                    values.push(updates[field]);
                }
                paramCount++;
            }
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        values.push(volunteerId);

        const updateQuery = `
            UPDATE volunteer_settings
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE volunteer_id = $${paramCount}
            RETURNING *
        `;

        const result = await pool.query(updateQuery, values);

        if (result.rows.length === 0) {
            // Settings don't exist, create them first
            const insertQuery = `
                INSERT INTO volunteer_settings (volunteer_id)
                VALUES ($1)
                RETURNING *
            `;
            await pool.query(insertQuery, [volunteerId]);

            // Now update with the new values
            const retryResult = await pool.query(updateQuery, values);
            const settings = retryResult.rows[0];

            return res.json({
                success: true,
                settings: {
                    theme_mode: settings.theme_mode || 'light',
                    font_size: settings.font_size || 'medium',
                    zoom_level: settings.zoom_level || 100,
                    max_meetings_per_day: settings.max_meetings_per_day || 3,
                    max_meetings_per_week: settings.max_meetings_per_week || 15,
                    advance_notice_hours: settings.advance_notice_hours || 2,
                    auto_accept_meetings: settings.auto_accept_meetings || false,
                    primary_timezone: settings.primary_timezone || 'UTC',
                    display_timezone_preference: settings.display_timezone_preference || 'local',
                    dst_handling: settings.dst_handling !== false,
                    email_notifications: settings.email_notifications || {
                        meeting_scheduled: true,
                        meeting_reminder: true,
                        meeting_cancelled: true,
                        meeting_rescheduled: true,
                        system_updates: false,
                        new_student_alerts: false
                    },
                    sms_notifications: settings.sms_notifications || {
                        meeting_reminder: false,
                        urgent_changes: false
                    },
                    browser_notifications: settings.browser_notifications || {
                        meeting_reminder: true,
                        meeting_scheduled: true,
                        instant_calls: true
                    },
                    reminder_timings: settings.reminder_timings || [60, 30, 5]
                }
            });
        }

        const settings = result.rows[0];

        res.json({
            success: true,
            settings: {
                theme_mode: settings.theme_mode || 'light',
                font_size: settings.font_size || 'medium',
                zoom_level: settings.zoom_level || 100,
                max_meetings_per_day: settings.max_meetings_per_day || 3,
                max_meetings_per_week: settings.max_meetings_per_week || 15,
                advance_notice_hours: settings.advance_notice_hours || 2,
                auto_accept_meetings: settings.auto_accept_meetings || false,
                primary_timezone: settings.primary_timezone || 'UTC',
                display_timezone_preference: settings.display_timezone_preference || 'local',
                dst_handling: settings.dst_handling !== false,
                email_notifications: settings.email_notifications || {
                    meeting_scheduled: true,
                    meeting_reminder: true,
                    meeting_cancelled: true,
                    meeting_rescheduled: true,
                    system_updates: false,
                    new_student_alerts: false
                },
                sms_notifications: settings.sms_notifications || {
                    meeting_reminder: false,
                    urgent_changes: false
                },
                browser_notifications: settings.browser_notifications || {
                    meeting_reminder: true,
                    meeting_scheduled: true,
                    instant_calls: true
                },
                reminder_timings: settings.reminder_timings || [60, 30, 5]
            }
        });
    } catch (error) {
        console.error('Error updating volunteer settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

/**
 * @route   POST /api/v1/volunteers/instant-call/notify
 * @desc    Send instant call notification to student (ONLY if student is online)
 * @access  Private (Volunteer only)
 */
router.post('/instant-call/notify', async (req, res) => {
    try {
        const { studentId, studentName, roomId, callUrl, volunteerName, volunteerImage } = req.body;
        const volunteerId = req.user.id;

        console.log('📞 Instant call notification request:', {
            studentId,
            studentName,
            volunteerName,
            roomId
        });

        // Look up the student's user_id for socket notification
        // The students table has a user_id column that links to users table
        const studentQuery = await pool.query(`
            SELECT id as student_id, user_id, full_name
            FROM students
            WHERE id = $1
            LIMIT 1
        `, [studentId]);

        const studentData = studentQuery.rows[0];

        if (!studentData) {
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        // Use user_id for socket notification (for auth room), but keep students.id for data
        const userIdToNotify = studentData.user_id || studentId;

        console.log('📍 Student lookup:', {
            studentId: studentData.student_id,
            userId: userIdToNotify,
            studentName: studentData.full_name
        });

        // Import socket.io instance
        const { getIO } = await import('../../../socket.js');
        const io = getIO();

        if (!io) {
            console.error('Socket.IO not initialized');
            return res.status(500).json({
                success: false,
                error: 'Real-time service unavailable'
            });
        }

        // ============================================================
        // STEP 1: Check if student is ONLINE before proceeding
        // NOTE: No pending call check - instant calls are fire-and-forget
        // Meeting records are only created when both parties actually connect
        // ============================================================
        const studentRooms = [
            `student_${userIdToNotify}`,
            `user_${userIdToNotify}`,
            `student-${userIdToNotify}`
        ];

        let studentIsOnline = false;
        let onlineRoom = null;

        for (const room of studentRooms) {
            const sockets = await io.in(room).fetchSockets();
            console.log(`🔍 Checking room ${room}: ${sockets.length} sockets found`);
            if (sockets.length > 0) {
                studentIsOnline = true;
                onlineRoom = room;
                break;
            }
        }

        // ============================================================
        // STEP 3: If student is NOT online, send missed call notification and return
        // ============================================================
        if (!studentIsOnline) {
            console.log('❌ Student is NOT online - sending missed call notification');

            // Send missed call notification to student
            try {
                await notificationService.sendNotification({
                    recipient_id: userIdToNotify,
                    recipient_role: 'student',
                    title: 'Missed Call',
                    message: `${volunteerName || 'A volunteer'} tried to call you but you were offline.`,
                    type: 'missed_call',
                    priority: 'high',
                    metadata: {
                        volunteerId,
                        volunteerName: volunteerName || req.user.full_name,
                        studentId: studentData.student_id,
                        attemptedAt: new Date().toISOString()
                    }
                }, ['in-app', 'push'], {
                    persistent: true
                });
                console.log('✅ Missed call notification sent to student:', userIdToNotify);
            } catch (notifError) {
                console.error('❌ Failed to send missed call notification:', notifError);
            }

            // Return immediately - DO NOT create meeting, DO NOT redirect volunteer
            return res.json({
                success: false,
                studentOnline: false,
                message: 'Student is not currently online. They have been notified of your missed call.',
                studentName: studentData.full_name || studentName
            });
        }

        // ============================================================
        // STEP 4: Student IS online - proceed with instant call
        // ============================================================
        console.log(`✅ Student is ONLINE in room ${onlineRoom}, proceeding with instant call`);

        // Prepare call data for student
        const callData = {
            roomId,
            callUrl,
            volunteerName: volunteerName || req.user.full_name || 'Volunteer',
            volunteerImage: volunteerImage || '',
            volunteerId,
            studentId: studentData.student_id,
            studentUserId: userIdToNotify,
            studentName: studentData.full_name || studentName,
            timestamp: new Date().toISOString(),
            type: 'instant_call',
            volunteer: {
                id: volunteerId,
                name: volunteerName || req.user.full_name || 'Volunteer',
                photo: volunteerImage || '',
                profile_image: volunteerImage || ''
            }
        };

        // Send Socket.IO notification to online student
        io.to(onlineRoom).emit('incoming-enhanced-instant-call', {
            volunteer: callData.volunteer,
            callData: {
                ...callData,
                timeoutSeconds: 180,  // 3 minutes for student to respond
                message: `${volunteerName} is calling you`
            },
            actions: {
                accept: callUrl,
                reject: null,
                message: null
            }
        });
        console.log(`📞 Instant call notification sent to room: ${onlineRoom}`);

        // Create persistent notification as backup
        try {
            await notificationService.sendNotification({
                recipient_id: userIdToNotify,
                recipient_role: 'student',
                title: 'Incoming Call',
                message: `${volunteerName || 'A volunteer'} is calling you now!`,
                type: 'instant_call_request',
                priority: 'high',
                metadata: {
                    roomId,
                    callUrl,
                    volunteerId,
                    volunteerName: volunteerName || req.user.full_name,
                    studentId: studentData.student_id,
                    action_url: callUrl
                }
            }, ['in-app', 'push'], {
                vibrate: true,
                sound: 'call',
                requireInteraction: true,
                persistent: true,
                actions: [
                    { action: 'accept', title: 'Answer Call' },
                    { action: 'decline', title: 'Decline' }
                ]
            });
        } catch (notifError) {
            console.error('❌ Failed to send instant call notification:', notifError);
        }

        // NOTE: Meeting record is NOT created here
        // It will only be created when both parties actually connect in the call room
        // This prevents orphaned "pending" meetings when calls are not answered

        res.json({
            success: true,
            studentOnline: true,
            message: 'Call notification sent to online student',
            callUrl,
            roomId
        });

    } catch (error) {
        console.error('Error sending instant call notification:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send notification'
        });
    }
});

/**
 * @route   GET /api/v1/volunteers/me/messages
 * @desc    Get current volunteer's messages
 * @access  Private (Volunteer only)
 */
router.get('/me/messages', async (req, res) => {
    try {
        const volunteerId = req.user.id;

        // Query joins both users and students tables to get correct names
        // Students have their real names in the students table, not users table
        const query = `
            SELECT
                m.id,
                m.sender_id,
                m.recipient_id,
                m.content,
                m.type,
                m.is_read,
                m.created_at,
                m.meeting_id,
                CASE
                    WHEN m.sender_id = $1 THEN COALESCE(s2.full_name, u2.full_name)
                    ELSE COALESCE(s1.full_name, u1.full_name)
                END as other_person_name,
                CASE
                    WHEN m.sender_id = $1 THEN
                        CASE WHEN s2.id IS NOT NULL THEN 'student' ELSE u2.role END
                    ELSE
                        CASE WHEN s1.id IS NOT NULL THEN 'student' ELSE u1.role END
                END as other_person_role
            FROM messages m
            LEFT JOIN users u1 ON m.sender_id = u1.id
            LEFT JOIN users u2 ON m.recipient_id = u2.id
            LEFT JOIN students s1 ON m.sender_id = s1.user_id
            LEFT JOIN students s2 ON m.recipient_id = s2.user_id
            WHERE m.recipient_id = $1 OR m.sender_id = $1
            ORDER BY m.created_at DESC
            LIMIT 100
        `;

        const { rows } = await pool.query(query, [volunteerId]);

        // Disable caching for messages endpoint
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        });

        res.json({
            success: true,
            data: rows.map(message => ({
                id: message.id,
                senderId: message.sender_id,
                recipientId: message.recipient_id,
                content: message.content,
                type: message.type,
                isRead: message.is_read,
                createdAt: message.created_at,
                meetingId: message.meeting_id,
                otherPersonName: message.other_person_name,
                otherPersonRole: message.other_person_role,
                isSentByMe: message.sender_id === volunteerId
            }))
        });

    } catch (error) {
        console.error('Error fetching volunteer messages:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching messages'
        });
    }
});

/**
 * @route   PATCH /api/v1/volunteers/me/messages/read
 * @desc    Mark messages from a specific sender as read
 * @access  Private (Volunteer only)
 */
router.patch('/me/messages/read', async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const { senderId } = req.body;

        if (!senderId) {
            return res.status(400).json({
                success: false,
                message: 'senderId is required'
            });
        }

        // Mark all messages from this sender to the volunteer as read
        const result = await pool.query(
            `UPDATE messages
             SET is_read = true
             WHERE recipient_id = $1 AND sender_id = $2 AND is_read = false`,
            [volunteerId, senderId]
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
            [volunteerId, senderId.toString()]
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
 * @route   GET /api/v1/volunteers/me/messages/unread-count
 * @desc    Get count of unread messages for the volunteer
 * @access  Private (Volunteer only)
 */
router.get('/me/messages/unread-count', async (req, res) => {
    try {
        const volunteerId = req.user.id;

        const result = await pool.query(
            `SELECT COUNT(*) as count
             FROM messages
             WHERE recipient_id = $1 AND is_read = false`,
            [volunteerId]
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

export default router;
