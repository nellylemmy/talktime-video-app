/**
 * Meeting API Controller
 * Handles all meeting-related API endpoints
 */
import Meeting from '../../../models/Meeting.js';
// Legacy Student model removed - using unified User model only
import User from '../../../models/User.js';
import { v4 as uuidv4 } from 'uuid';
import * as notificationService from '../../../services/notificationService.js';
import pool from '../../../config/database.js';
// import { generateSecureAccessToken, createMeetingAccessUrl } from '../../../utils/secureTokens.js'; // Temporarily disabled
import { io } from '../../../socket.js';

/**
 * Get all meetings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} List of meetings
 */
export const getAllMeetings = async (req, res) => {
    try {
        const meetings = await Meeting.findAll();
        
        res.json({
            meetings: meetings || []
        });
    } catch (error) {
        console.error('Error fetching meetings:', error);
        res.status(500).json({ error: 'Failed to fetch meetings' });
    }
};

/**
 * Get meeting by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Meeting details
 */
export const getMeetingById = async (req, res) => {
    try {
        const { id } = req.params;
        const meeting = await Meeting.findById(id);
        
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' });
        }
        
        res.json({
            meeting
        });
    } catch (error) {
        console.error('Error fetching meeting:', error);
        res.status(500).json({ error: 'Failed to fetch meeting' });
    }
};

/**
 * Get meeting by room ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Meeting details
 */
export const getMeetingByRoomId = async (req, res) => {
    try {
        const { roomId } = req.params;
        console.log('🔍 Fetching meeting by room ID:', roomId);
        
        const meeting = await Meeting.findOne({ 
            room_id: roomId 
        }).populate('student_id', 'full_name age gender bio photos')
          .populate('volunteer_id', 'full_name email');
        
        if (!meeting) {
            console.log('❌ Meeting not found for room ID:', roomId);
            return res.status(404).json({ error: 'Meeting not found' });
        }
        
        console.log('✅ Meeting found:', meeting);
        
        // Transform the response to match frontend expectations
        const response = {
            id: meeting.id,
            student_id: meeting.student_id?._id || meeting.student_id,
            volunteer_id: meeting.volunteer_id?._id || meeting.volunteer_id,
            studentId: meeting.student_id?._id || meeting.student_id,
            volunteerId: meeting.volunteer_id?._id || meeting.volunteer_id,
            scheduled_time: meeting.scheduled_time,
            scheduledTime: meeting.scheduled_time,
            duration: meeting.duration,
            status: meeting.status,
            room_id: meeting.room_id,
            roomId: meeting.room_id,
            student: meeting.student_id,
            volunteer: meeting.volunteer_id,
            created_at: meeting.created_at,
            updated_at: meeting.updated_at
        };
        
        res.json(response);
    } catch (error) {
        console.error('❌ Error fetching meeting by room ID:', error);
        res.status(500).json({ error: 'Failed to fetch meeting' });
    }
};

/**
 * Create new meeting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Created meeting
 */
export const createMeeting = async (req, res) => {
    try {
        console.log('Meeting creation request received:', req.body);
        
        const { studentId, scheduledTime, timezone, eatTime } = req.body;
        const volunteerId = req.user.id;
        
        console.log('Processing meeting creation with studentId:', studentId, 'volunteerId:', volunteerId);
        
        // Validate required fields
        if (!studentId || !scheduledTime) {
            console.error('Missing required fields:', { studentId, scheduledTime });
            return res.status(400).json({ error: 'Student ID and scheduled time are required' });
        }
        
        // Check if student exists
        const student = await User.findById(studentId);
        
        if (!student) {
            console.error('Student not found with ID:', studentId);
            return res.status(404).json({ error: 'Student not found' });
        }
        
        // Check if volunteer exists
        const volunteer = await User.findById(volunteerId);
        
        if (!volunteer) {
            console.error('Volunteer not found with ID:', volunteerId);
            return res.status(404).json({ error: 'Volunteer not found' });
        }
        
        // CRITICAL: Enforce 1-call-per-day rule - Check if student already has a meeting on this date
        const meetingDate = new Date(scheduledTime);
        const startOfDay = new Date(meetingDate.getFullYear(), meetingDate.getMonth(), meetingDate.getDate());
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);
        
        const existingMeetingQuery = `
            SELECT id, scheduled_time, volunteer_id, status 
            FROM meetings 
            WHERE student_id = $1 
            AND scheduled_time >= $2 
            AND scheduled_time < $3 
            AND status IN ('scheduled', 'in_progress')
        `;
        
        const existingMeetingResult = await pool.query(existingMeetingQuery, [studentId, startOfDay, endOfDay]);
        
        if (existingMeetingResult.rows.length > 0) {
            const existingMeeting = existingMeetingResult.rows[0];
            console.error('Student already has a meeting on this date:', {
                studentId,
                existingMeetingId: existingMeeting.id,
                existingMeetingTime: existingMeeting.scheduled_time,
                requestedTime: scheduledTime
            });
            return res.status(409).json({ 
                error: 'Student already has a meeting scheduled for this date',
                existingMeeting: {
                    id: existingMeeting.id,
                    scheduledTime: existingMeeting.scheduled_time,
                    volunteerId: existingMeeting.volunteer_id
                }
            });
        }
        
        // Generate unique room ID
        const roomId = uuidv4();
        console.log('Generated room ID:', roomId);
        
        // Create meeting
        const meeting = await Meeting.create({
            studentId,
            volunteerId,
            scheduledTime,
            duration: 40, // Default 40 minutes
            status: 'scheduled',
            roomId
        });
        
        console.log('Meeting created successfully:', meeting);
        
        // Generate secure access token for the student
        let secureAccessUrl = null;
        try {
            const tokenData = generateSecureAccessToken({
                meetingId: meeting.id,
                studentId: meeting.studentId,
                volunteerId: meeting.volunteerId,
                scheduledTime: new Date(meeting.scheduledTime),
                expiryHours: 24
            });
            
            // Store token in database
            await pool.query(`
                UPDATE meetings 
                SET student_access_token = $1, access_token_expires_at = $2
                WHERE id = $3
            `, [tokenData.token, tokenData.expiresAt, meeting.id]);
            
            // Create meeting access URL
            secureAccessUrl = createMeetingAccessUrl(tokenData.token);
            
            console.log('Secure access token generated for meeting:', meeting.id);
        } catch (tokenError) {
            console.error('Error generating secure access token:', tokenError);
            // Don't fail the meeting creation if token generation fails
            // The meeting can still function with the old room-based access
        }
        
        // Schedule notifications for both volunteer and student
        try {
            await notificationService.scheduleMeetingNotifications(meeting);
            console.log('Meeting notifications scheduled successfully');
        } catch (notificationError) {
            console.error('Error scheduling meeting notifications:', notificationError);
            // Don't fail the meeting creation if notifications fail
            // Just log the error and continue
        }
        
        res.status(201).json({
            meeting,
            secureAccessUrl,
            message: 'Meeting scheduled successfully'
        });
    } catch (error) {
        console.error('Error creating meeting:', error);
        res.status(500).json({ error: 'Failed to schedule meeting' });
    }
};

/**
 * Update meeting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Updated meeting
 */
export const updateMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const { scheduledTime, duration, status } = req.body;
        const volunteerId = req.user.id;
        
        // Find meeting
        const meeting = await Meeting.findById(id);
        
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' });
        }
        
        // Check if user is authorized to update this meeting
        console.log('Full meeting object:', JSON.stringify(meeting));
        console.log('Current user JWT:', JSON.stringify(req.user));
        
        // Get the volunteer ID from the meeting object
        let meetingVolunteerId = null;
        
        // Try different property names that might contain the volunteer ID
        if (meeting.volunteer_id !== undefined) {
            meetingVolunteerId = meeting.volunteer_id;
            console.log('Found volunteer_id:', meetingVolunteerId);
        } else if (meeting.volunteerId !== undefined) {
            meetingVolunteerId = meeting.volunteerId;
            console.log('Found volunteerId:', meetingVolunteerId);
        } else {
            console.error('Could not find volunteer ID in meeting object');
            return res.status(500).json({ error: 'Server error: Could not determine meeting ownership' });
        }
        
        // Convert both IDs to numbers for consistent comparison
        const meetingVolunteerIdNum = Number(meetingVolunteerId);
        const currentVolunteerIdNum = Number(volunteerId);
        
        console.log('Meeting volunteer ID (numeric):', meetingVolunteerIdNum);
        console.log('Current user ID (numeric):', currentVolunteerIdNum);
        console.log('User role:', req.user.role);
        
        // Check if the current user is the meeting owner or an admin
        const isOwner = meetingVolunteerIdNum === currentVolunteerIdNum;
        const isAdmin = req.user.role === 'admin';
        
        console.log('Is owner?', isOwner, 'Is admin?', isAdmin);
        
        if (!isOwner && !isAdmin) {
            console.log('Authorization failed: User is not the meeting owner or admin');
            return res.status(403).json({ error: 'Not authorized to update this meeting' });
        }
        
        // Check if this is a reschedule (time change)
        const isReschedule = scheduledTime && scheduledTime !== meeting.scheduledTime;
        
        // Prepare update data
        const updateData = {
            scheduledTime: scheduledTime || meeting.scheduledTime,
            duration: duration || meeting.duration,
            status: status || meeting.status,
            updated_at: new Date()
        };
        
        // If this is a reschedule, track the reschedule information
        if (isReschedule) {
            updateData.original_scheduled_time = meeting.original_scheduled_time || meeting.scheduledTime;
            updateData.is_rescheduled = true;
            updateData.reschedule_count = (meeting.reschedule_count || 0) + 1;
            updateData.last_rescheduled_at = new Date();
            updateData.rescheduled_by = volunteerId;
        }
        
        // Update meeting
        const updatedMeeting = await Meeting.update(id, updateData);
        
        // If the meeting time changed, cancel old notifications and create new ones
        if (scheduledTime && scheduledTime !== meeting.scheduledTime) {
            try {
                // Cancel existing notifications
                await notificationService.cancelMeetingNotifications(id);
                
                // Schedule new notifications
                await notificationService.scheduleMeetingNotifications(updatedMeeting);
                
                // Create a reschedule notification for the student
                await createRescheduleNotification(updatedMeeting, req.user, meeting.scheduledTime, scheduledTime);
                
            } catch (notificationError) {
                console.error('Error rescheduling meeting notifications:', notificationError);
                // Don't fail the meeting update if notifications fail
                // Just log the error and continue
            }
        }
        
        res.json({
            meeting: updatedMeeting,
            message: 'Meeting updated successfully'
        });
    } catch (error) {
        console.error('Error updating meeting:', error);
        res.status(500).json({ error: 'Failed to update meeting' });
    }
};

/**
 * Cancel meeting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Success message
 */
export const cancelMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Log full request jwt_auth data for debugging
        console.log('jwt_auth data:', req.jwt_auth);
        console.log('Meeting ID to cancel:', id);
        
        if (!req.user) {
            console.error('No jwt_auth or user found in jwt_auth');
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const volunteerId = req.user.id;
        console.log('User ID from jwt_auth:', volunteerId);
        
        // Find meeting
        const meeting = await Meeting.findById(id);
        console.log('Meeting found:', meeting);
        
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' });
        }
        
        // Log all meeting properties to see what's available
        console.log('Meeting properties:');
        for (const [key, value] of Object.entries(meeting)) {
            console.log(`${key}: ${value}`);
        }
        
        // Check if user is authorized to cancel this meeting
        // The column names from the database might be different from what we expect
        // Try different property names that might contain the volunteer ID
        const possibleVolunteerIdFields = ['volunteerId', 'volunteer_id', 'volunteerid'];
        let meetingVolunteerId = null;
        
        for (const field of possibleVolunteerIdFields) {
            if (meeting[field] !== undefined) {
                meetingVolunteerId = String(meeting[field]);
                console.log(`Found volunteer ID in field '${field}': ${meetingVolunteerId}`);
                break;
            }
        }
        
        if (meetingVolunteerId === null) {
            console.error('Could not find volunteer ID in meeting object');
            return res.status(500).json({ error: 'Server error: Could not determine meeting ownership' });
        }
        
        const currentVolunteerId = String(volunteerId);
        
        console.log('Meeting volunteer ID:', meetingVolunteerId);
        console.log('Current user ID:', currentVolunteerId);
        console.log('User role:', req.user.role);
        
        if (meetingVolunteerId !== currentVolunteerId && req.user.role !== 'admin') {
            console.log('Authorization failed: User is not the meeting owner or admin');
            return res.status(403).json({ error: 'Not authorized to cancel this meeting' });
        }
        
        // Cancel meeting
        await Meeting.update(id, {
            status: 'cancelled'
        });
        
        // Reset student availability after cancellation
        // This ensures the student can be booked for another meeting
        // Legacy student availability reset removed - using unified users table
        
        // Cancel all notifications for this meeting
        try {
            await notificationService.cancelMeetingNotifications(id);
            
            // Send cancellation notification to both volunteer and student
            const student = await User.findById(meeting.student_id);
            const volunteer = await User.findById(meeting.volunteer_id);
            
            if (student) {
                await notificationService.sendNotification({
                    userId: student.id,
                    type: 'meeting-canceled',
                    title: 'Meeting Canceled',
                    message: `Your meeting scheduled for ${new Date(meeting.scheduledTime).toLocaleString()} has been canceled.`,
                    priority: 'high'
                }, ['in-app', 'email', 'sms']);
            }
            
            if (volunteer && volunteer.id !== req.user.id) {
                await notificationService.sendNotification({
                    userId: volunteer.id,
                    type: 'meeting-canceled',
                    title: 'Meeting Canceled',
                    message: `Your meeting scheduled for ${new Date(meeting.scheduledTime).toLocaleString()} has been canceled.`,
                    priority: 'high'
                }, ['in-app', 'email', 'sms']);
            }
        } catch (notificationError) {
            console.error('Error canceling meeting notifications:', notificationError);
            // Don't fail the meeting cancellation if notifications fail
            // Just log the error and continue
        }
        
        res.json({
            message: 'Meeting cancelled successfully'
        });
    } catch (error) {
        console.error('Error cancelling meeting:', error);
        res.status(500).json({ error: 'Failed to cancel meeting' });
    }
};

/**
 * Get meetings by student ID or admission number
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Meeting for the specified student
 */
export const getMeetingsByStudentId = async (req, res) => {
    try {
        console.log('API CALL: getMeetingsByStudentId with params:', req.params);
        const { studentId } = req.params;
        let actualStudentId = studentId;
        console.log('Original studentId:', studentId);
        
        // Check if studentId is an admission number (non-numeric)
        if (isNaN(studentId) || studentId.toString().includes('ADM')) {
            console.log('Looking up student by admission number:', studentId);
            // Find student by admission number
            const student = await User.findByUsernameAndRole(studentId, 'student');
            
            if (!student) {
                return res.status(404).json({ error: 'Student not found with the given admission number' });
            }
            
            actualStudentId = student.id;
            console.log('Found student with ID:', actualStudentId);
        }
        
        // Find the most recent active meeting for this student
        console.log('Querying database for meetings with studentId:', actualStudentId);
        const meeting = await Meeting.findLatestByStudentId(actualStudentId);
        
        console.log('Database result:', meeting ? 'Meeting found' : 'No meeting found', meeting);
        
        // Include the current volunteer ID in the response for ownership checking
        const currentVolunteerId = req.user.id;
        
        // Return 200 with null meeting data if no meeting found (instead of 404)
        // This is better for SEO and prevents console errors
        if (!meeting) {
            console.log('No active meetings found for student', actualStudentId);
            return res.status(200).json({
                meeting: null,
                currentVolunteerId: currentVolunteerId
            });
        }
        
        const responseData = {
            meeting: {
                id: meeting.id,
                roomId: meeting.room_id,
                scheduled_time: meeting.scheduled_time,
                endTime: meeting.end_time,
                status: meeting.status,
                studentId: meeting.student_id,
                volunteerId: meeting.volunteer_id,
                // Also provide snake_case versions for compatibility
                student_id: meeting.student_id,
                volunteer_id: meeting.volunteer_id
            },
            currentVolunteerId: currentVolunteerId
        };
        
        console.log('Sending API response with meeting data:', JSON.stringify(responseData));
        res.json(responseData);
    } catch (error) {
        console.error('Error fetching student meetings:', error);
        res.status(500).json({ error: 'Failed to fetch student meetings' });
    }
};

/**
 * End meeting - Universal endpoint for both volunteer and student quit
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Success message with meeting end details
 */
export const endMeeting = async (req, res) => {
    console.log('🔚 Processing meeting end request...');
    
    try {
        const { meetingId } = req.params;
        const { reason = 'participant_left' } = req.body;
        const userId = req.user?.id;
        const userRole = req.user?.role;
        
        if (!userId || !userRole) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }
        
        if (!meetingId) {
            return res.status(400).json({ success: false, message: 'Meeting ID is required' });
        }
        
        // Get meeting details with participant info
        // Handle both numeric meeting ID and string room_id
        const meetingResult = await pool.query(`
            SELECT 
                m.*,
                v.full_name as volunteer_name,
                v.id as volunteer_id,
                su.full_name as student_name,
                su.id as student_id
            FROM meetings m
            JOIN users v ON m.volunteer_id = v.id
            JOIN users su ON m.student_id = su.id AND su.role = 'student'
            WHERE m.room_id = $1 OR (m.id = $1::integer AND $1 ~ '^[0-9]+$')
        `, [meetingId]);
        
        if (meetingResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }
        
        const meeting = meetingResult.rows[0];
        
        // Verify user authorization (either volunteer or student in this meeting)
        const isAuthorized = 
            (userRole === 'volunteer' && meeting.volunteer_id === userId) ||
            (userRole === 'student' && meeting.student_id === userId) ||
            userRole === 'admin';
            
        if (!isAuthorized) {
            return res.status(403).json({ success: false, message: 'Not authorized to end this meeting' });
        }
        
        // Only allow ending if meeting is active, pending, or scheduled
        if (!['active', 'pending', 'scheduled'].includes(meeting.status)) {
            return res.status(400).json({ success: false, message: 'Meeting cannot be ended in current status' });
        }
        
        // Update meeting status to ended
        const endTime = new Date();
        await pool.query(`
            UPDATE meetings 
            SET 
                status = 'ended',
                end_time = $1,
                ended_by = $2,
                end_reason = $3,
                updated_at = NOW()
            WHERE id = $4
        `, [endTime, userId, reason, meeting.id]);
        
        // Determine who ended the meeting and who needs to be notified
        const endedByName = userRole === 'volunteer' ? meeting.volunteer_name : meeting.student_name;
        const otherParticipantId = userRole === 'volunteer' ? meeting.student_id : meeting.volunteer_id;
        const otherParticipantRole = userRole === 'volunteer' ? 'student' : 'volunteer';
        const otherParticipantName = userRole === 'volunteer' ? meeting.student_name : meeting.volunteer_name;
        
        // Send real-time notification to other participant
        const notificationData = {
            meetingId: meeting.id,
            roomId: meeting.room_id,
            endedBy: endedByName,
            endedByRole: userRole,
            reason: reason,
            message: `${endedByName} has left the meeting`,
            timestamp: endTime.toISOString(),
            forceRedirect: true,
            redirectUrl: otherParticipantRole === 'student' ? '/student/dashboard' : '/volunteer/dashboard/students'
        };
        
        // Send to specific user room
        const otherParticipantRoom = `${otherParticipantRole}_${otherParticipantId}`;
        io.to(otherParticipantRoom).emit('meeting-force-end', notificationData);
        
        // Also send to general user room for cross-tab notifications
        io.to(`user_${otherParticipantId}`).emit('meeting-force-end', notificationData);
        
        // Send to meeting room to kick out anyone still in the room
        io.to(meeting.room_id).emit('meeting-terminated', {
            meetingId: meeting.id,
            endedBy: endedByName,
            reason: reason,
            message: 'Meeting has been ended by a participant',
            timestamp: endTime.toISOString()
        });
        
        console.log(`✅ Meeting ${meeting.id} ended by ${userRole} ${userId} (${endedByName})`);
        console.log(`📡 Notified ${otherParticipantRole} ${otherParticipantId} (${otherParticipantName})`);
        
        // Log the meeting end action
        try {
            await pool.query(`
                INSERT INTO call_history (meeting_id, volunteer_id, student_id, action_type, action_data, user_agent, ip_address)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                meeting.id,
                meeting.volunteer_id,
                meeting.student_id,
                'meeting_ended',
                JSON.stringify({
                    endedBy: userRole,
                    endedByName: endedByName,
                    reason: reason,
                    endTime: endTime.toISOString()
                }),
                req.headers['user-agent'] || null,
                req.ip || req.connection?.remoteAddress || null
            ]);
        } catch (logError) {
            console.error('❌ Error logging meeting end action:', logError);
            // Don't fail the request if logging fails
        }
        
        res.json({
            success: true,
            message: 'Meeting ended successfully',
            meetingId: meeting.id,
            endedBy: endedByName,
            endedByRole: userRole,
            endTime: endTime.toISOString(),
            redirectUrl: userRole === 'student' ? '/student/dashboard' : '/volunteer/dashboard/students'
        });
        
    } catch (error) {
        console.error('❌ Error ending meeting:', error);
        res.status(500).json({ success: false, message: 'Failed to end meeting' });
    }
};

/**
 * Join meeting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Meeting details with room info
 */
export const joinMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        // Find meeting
        const meeting = await Meeting.findById(id);
        
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' });
        }
        
        // Check if user is authorized to join this meeting
        const isStudent = req.user.role === 'student' && meeting.studentId === userId;
        const isVolunteer = req.user.role === 'volunteer' && meeting.volunteerId === userId;
        const isAdmin = req.user.role === 'admin';
        
        if (!isStudent && !isVolunteer && !isAdmin) {
            return res.status(403).json({ error: 'Not authorized to join this meeting' });
        }
        
        // Get student and volunteer info
        const student = await User.findById(meeting.studentId);
        const volunteer = await User.findById(meeting.volunteerId);
        
        // If the meeting is about to start (within 5 minutes), mark the 5-minute notification as read
        const meetingTime = new Date(meeting.scheduledTime);
        const now = new Date();
        const minutesUntilMeeting = Math.floor((meetingTime - now) / (1000 * 60));
        
        if (minutesUntilMeeting <= 5) {
            try {
                // Process any scheduled notifications that are due
                await notificationService.processScheduledNotifications();
            } catch (notificationError) {
                console.error('Error processing scheduled notifications:', notificationError);
                // Don't fail the meeting join if notifications fail
                // Just log the error and continue
            }
        }
        
        res.json({
            meeting: {
                ...meeting,
                student: {
                    id: student.id,
                    fullName: student.fullName,
                    bio: student.bio,
                    photoUrl: student.photoUrl
                },
                volunteer: {
                    id: volunteer.id,
                    fullName: volunteer.fullName
                }
            },
            roomInfo: {
                roomId: meeting.roomId,
                userRole: req.user.role,
                userId: userId
            }
        });
    } catch (error) {
        console.error('Error joining meeting:', error);
        res.status(500).json({ error: 'Failed to join meeting' });
    }
};

/**
 * Create a reschedule notification for the student
 * @param {Object} meeting - The updated meeting object
 * @param {Object} rescheduler - The user who rescheduled (volunteer or admin)
 * @param {string} originalTime - The original scheduled time
 * @param {string} newTime - The new scheduled time
 */
async function createRescheduleNotification(meeting, rescheduler, originalTime, newTime) {
    try {
        const originalDate = new Date(originalTime).toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Africa/Nairobi'
        });
        
        const newDate = new Date(newTime).toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Africa/Nairobi'
        });
        
        const message = `Your meeting has been rescheduled by ${rescheduler.full_name}. ` +
                       `Original time: ${originalDate}. ` +
                       `New time: ${newDate}.`;
        
        // With unified authentication, meeting.studentId now directly references users.id
        const studentUserId = meeting.studentId;
        
        // Verify the student user exists
        const userQuery = 'SELECT id, full_name FROM users WHERE id = $1 AND role = $2';
        const userResult = await pool.query(userQuery, [studentUserId, 'student']);
        
        if (userResult.rows.length > 0) {
            const studentUser = userResult.rows[0];
            console.log(`Creating reschedule notification for student: ${studentUser.full_name} (ID: ${studentUserId})`);
            
            // Insert notification into database
            const insertQuery = `
                INSERT INTO notifications (user_id, type, title, message, meeting_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            `;
            
            const result = await pool.query(insertQuery, [
                studentUserId,
                'meeting_rescheduled',
                'Meeting Rescheduled',
                message,
                meeting.id,
                new Date()
            ]);
            
            console.log(`Created reschedule notification ${result.rows[0].id} for student user ${studentUserId}`);
            
            // Emit real-time notification via Socket.IO
            if (io) {
                io.to(`user_${studentUserId}`).emit('notification', {
                    id: result.rows[0].id,
                    type: 'meeting_rescheduled',
                    title: 'Meeting Rescheduled',
                    message: message,
                    meeting_id: meeting.id,
                    created_at: new Date().toISOString()
                });
            }
        }
    } catch (error) {
        console.error('Error creating reschedule notification:', error);
        // Don't throw error - notification failure shouldn't break meeting update
    }
}
