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
import { getIO } from '../../../socket.js';
import { getUserTimezone, getDayBoundariesInTimezone, getSafeTimezone, formatInTimezone } from '../../../utils/timezoneUtils.js';

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
        
        // Validate scheduled time constraints
        const now = new Date();
        const scheduledDate = new Date(scheduledTime);
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
        
        // Check if meeting is scheduled in the past
        if (scheduledDate <= now) {
            console.error('Cannot schedule meeting in the past:', {
                scheduledTime,
                currentTime: now
            });
            return res.status(400).json({ 
                error: 'Cannot schedule meetings in the past. Please select a future date and time.',
                scheduledTime,
                currentTime: now
            });
        }
        
        // Check if meeting is beyond 3-month limit
        if (scheduledDate > threeMonthsFromNow) {
            console.error('Meeting scheduled too far in the future:', {
                scheduledTime,
                maxAllowedTime: threeMonthsFromNow
            });
            return res.status(400).json({ 
                error: 'Meetings can only be scheduled up to 3 months in advance. Please select an earlier date.',
                scheduledTime,
                maxAllowedTime: threeMonthsFromNow
            });
        }
        
        console.log('Time validation passed:', {
            scheduledTime,
            currentTime: now,
            maxAllowedTime: threeMonthsFromNow
        });

        // Check if student exists - handle both students.id and users.id
        let student = await User.findById(studentId);
        let actualStudentUserId = studentId;

        if (!student) {
            // studentId might be from students table, look up the user_id
            console.log('Student not found in users table, checking students table for ID:', studentId);
            const studentLookup = await pool.query(
                'SELECT user_id, full_name FROM students WHERE id = $1 LIMIT 1',
                [studentId]
            );

            if (studentLookup.rows.length > 0 && studentLookup.rows[0].user_id) {
                actualStudentUserId = studentLookup.rows[0].user_id;
                student = await User.findById(actualStudentUserId);
                console.log('Found student via students table:', {
                    studentsTableId: studentId,
                    usersTableId: actualStudentUserId,
                    name: studentLookup.rows[0].full_name
                });
            }
        }

        if (!student) {
            console.error('Student not found with ID:', studentId);
            return res.status(404).json({ error: 'Student not found' });
        }

        // Use the actual user ID for notifications but keep original studentId for meeting record
        const studentUserIdForNotifications = actualStudentUserId;
        
        // Check if volunteer exists
        const volunteer = await User.findById(volunteerId);
        
        if (!volunteer) {
            console.error('Volunteer not found with ID:', volunteerId);
            return res.status(404).json({ error: 'Volunteer not found' });
        }

        // Check volunteer performance restrictions
        // Exclude meetings cleared by admin from restriction calculation
        const performanceQuery = `
            SELECT
                COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
                COUNT(*) FILTER (WHERE status = 'canceled') as cancelled_calls,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_calls_alt,
                COUNT(*) FILTER (WHERE status = 'missed') as missed_calls,
                COUNT(*) FILTER (WHERE status IN ('completed', 'canceled', 'cancelled', 'missed')) as total_scheduled
            FROM meetings
            WHERE volunteer_id = $1 AND scheduled_time < NOW()
            AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)
        `;
        
        const { rows: performanceRows } = await pool.query(performanceQuery, [volunteerId]);
        const metrics = performanceRows[0];
        
        // Calculate rates for restriction check
        const cancelledCalls = parseInt(metrics.cancelled_calls) + parseInt(metrics.cancelled_calls_alt);
        const completedCalls = parseInt(metrics.completed_calls);
        const missedCalls = parseInt(metrics.missed_calls);
        const totalScheduled = parseInt(metrics.total_scheduled);
        
        if (totalScheduled > 0) {
            const cancelledRate = Math.round((cancelledCalls / totalScheduled) * 100);
            const missedRate = Math.round((missedCalls / totalScheduled) * 100);
            const reputationScore = Math.max(0, Math.round(100 - (cancelledRate * 1.5) - (missedRate * 2)));
            
            // Enforce restrictions based on performance
            if (cancelledRate >= 40 || missedRate >= 30 || reputationScore < 30) {
                console.error('Volunteer account restricted due to poor performance:', {
                    volunteerId,
                    cancelledRate,
                    missedRate,
                    reputationScore,
                    totalScheduled
                });
                return res.status(403).json({ 
                    error: 'Account temporarily restricted',
                    message: 'Your account is temporarily restricted from scheduling new calls due to high cancellation/missed call rates. Please contact support to resolve this issue.',
                    performanceData: {
                        cancelledRate,
                        missedRate,
                        reputationScore,
                        totalCalls: totalScheduled,
                        restriction: 'critical'
                    }
                });
            }
        }
        
        // CRITICAL: Enforce 1-call-per-day rule - Check if student already has a meeting on this date
        // IMPORTANT: Only consider 'scheduled' and 'in_progress' meetings as conflicts, NOT 'canceled' meetings
        // TIMEZONE-AWARE: Day boundaries are calculated in the STUDENT's timezone for accurate enforcement

        // Get student's timezone for accurate day boundary calculation
        const studentTimezone = await getUserTimezone(actualStudentUserId);
        const { startOfDay, endOfDay, localDateString } = getDayBoundariesInTimezone(scheduledTime, studentTimezone);

        console.log('Timezone-aware day boundary check:', {
            studentId,
            studentTimezone,
            scheduledTime,
            localDate: localDateString,
            startOfDayUTC: startOfDay.toISOString(),
            endOfDayUTC: endOfDay.toISOString()
        });

        // Use PostgreSQL AT TIME ZONE for accurate timezone-aware comparison
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
            console.error('Student already has a meeting on this date (timezone-aware check):', {
                studentId,
                studentTimezone,
                existingMeetingId: existingMeeting.id,
                existingMeetingTime: existingMeeting.scheduled_time,
                requestedTime: scheduledTime,
                dayBoundaries: { start: startOfDay.toISOString(), end: endOfDay.toISOString() }
            });
            return res.status(409).json({
                error: 'Student already has a meeting scheduled for this date',
                existingMeeting: {
                    id: existingMeeting.id,
                    scheduledTime: existingMeeting.scheduled_time,
                    volunteerId: existingMeeting.volunteer_id
                },
                timezone: studentTimezone,
                dateInStudentTimezone: localDateString
            });
        }
        
        // NEW: Check 3-meeting limit per volunteer-student pair
        // First, check for any overdue meetings and mark them as missed (40+ minute timeout)
        await pool.query(`
            UPDATE meetings 
            SET status = 'missed', 
                updated_at = NOW()
            WHERE volunteer_id = $1 
            AND student_id = $2
            AND status = 'scheduled' 
            AND scheduled_time < NOW() - INTERVAL '40 minutes'
        `, [volunteerId, studentId]);

        // IMPORTANT: Count all active meetings (scheduled, completed, in_progress)
        // Only exclude missed and canceled meetings
        const volunteerStudentMeetingQuery = `
            SELECT COUNT(*) as meeting_count
            FROM meetings 
            WHERE volunteer_id = $1 
            AND student_id = $2 
            AND status NOT IN ('missed', 'canceled', 'cancelled')
        `;
        
        const volunteerStudentMeetingResult = await pool.query(volunteerStudentMeetingQuery, [volunteerId, studentId]);
        const currentMeetingCount = parseInt(volunteerStudentMeetingResult.rows[0].meeting_count);
        
        if (currentMeetingCount >= 3) {
            console.error('Volunteer has reached 3-meeting limit with this student:', {
                volunteerId,
                studentId,
                currentMeetingCount
            });
            return res.status(403).json({ 
                error: 'You have reached the 3-meeting limit with this student. This limit counts all active meetings (scheduled, ongoing, completed) to ensure all students get equal opportunities. Only missed and canceled meetings are excluded.',
                meetingCount: currentMeetingCount,
                limit: 3
            });
        }
        
        console.log('Meeting count check passed:', {
            volunteerId,
            studentId,
            currentMeetingCount,
            limit: 3
        });
        
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
            
            // Send immediate success notification to volunteer
            await notificationService.sendNotification({
                recipient_id: meeting.volunteer_id || meeting.volunteerId,
                recipient_role: 'volunteer',
                title: '✅ Meeting Scheduled Successfully!',
                message: `Your meeting with ${studentName || 'student'} has been scheduled for ${new Date(meeting.scheduled_time || meeting.scheduledTime).toLocaleDateString()} at ${new Date(meeting.scheduled_time || meeting.scheduledTime).toLocaleTimeString()}. You'll receive reminders before the meeting starts.`,
                type: 'meeting_scheduled',
                priority: 'high',
                metadata: {
                    meeting_id: meeting.id,
                    student_name: studentName,
                    scheduled_time: meeting.scheduled_time || meeting.scheduledTime,
                    meeting_link: meeting.roomUrl || secureAccessUrl
                }
            }, ['in-app', 'push'], {
                persistent: true,
                auto_delete_after: 1440, // 24 hours
                require_interaction: false,
                action_url: `/volunteer/dashboard/upcoming.html`,
                tag: `meeting-scheduled-${meeting.id}`
            });
            
            // Send notification to student (use actualStudentUserId for socket room targeting)
            if (studentUserIdForNotifications) {
                await notificationService.sendNotification({
                    recipient_id: studentUserIdForNotifications,
                    recipient_role: 'student',
                    title: '🎉 New Meeting Scheduled!',
                    message: `A volunteer has scheduled a meeting with you for ${new Date(meeting.scheduled_time || meeting.scheduledTime).toLocaleDateString()} at ${new Date(meeting.scheduled_time || meeting.scheduledTime).toLocaleTimeString()}. We'll send you reminders!`,
                    type: 'meeting_scheduled',
                    priority: 'high',
                    metadata: {
                        meeting_id: meeting.id,
                        volunteer_name: req.user.full_name || req.user.fullName,
                        scheduled_time: meeting.scheduled_time || meeting.scheduledTime,
                        meeting_link: secureAccessUrl
                    }
                }, ['in-app', 'push'], {
                    persistent: true,
                    auto_delete_after: 1440, // 24 hours
                    require_interaction: false,
                    action_url: `/student/dashboard`,
                    tag: `meeting-scheduled-${meeting.id}`
                });

                // Emit Socket.IO event for real-time UI update
                const io = getIO();
                if (io) {
                    io.to(`user_${studentUserIdForNotifications}`).emit('meeting-scheduled', {
                        meeting_id: meeting.id,
                        message: `A volunteer has scheduled a meeting with you!`,
                        scheduledTime: meeting.scheduled_time || meeting.scheduledTime,
                        volunteerName: req.user.full_name || req.user.fullName
                    });
                    console.log(`📅 Emitted meeting-scheduled event to student user_${studentUserIdForNotifications}`);
                }
            }

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
        console.log('DEBUG: updatedMeeting from Meeting.update:', JSON.stringify(updatedMeeting, null, 2));
        
        // If the meeting time changed, cancel old notifications and create new ones
        if (scheduledTime && scheduledTime !== meeting.scheduledTime) {
            try {
                // Cancel existing notifications
                await notificationService.cancelMeetingNotifications(id);
                
                // Get complete meeting data with participant information for notifications
                const meetingWithParticipants = {
                    id: updatedMeeting.id,
                    volunteer_id: updatedMeeting.volunteer_id,
                    student_id: updatedMeeting.student_id,
                    scheduled_time: updatedMeeting.scheduled_time,
                    duration: updatedMeeting.duration
                };
                
                // Schedule new notifications
                console.log('DEBUG: Calling scheduleMeetingNotifications with meeting:', JSON.stringify(meetingWithParticipants, null, 2));
                await notificationService.scheduleMeetingNotifications(meetingWithParticipants);
                
                // Create a reschedule notification for both participants  
                const originalScheduledTime = meeting.scheduled_time || meeting.scheduledTime;
                console.log('DEBUG: Calling createRescheduleNotification with originalTime:', originalScheduledTime, 'newTime:', scheduledTime);
                await createRescheduleNotification(meetingWithParticipants, req.user, originalScheduledTime, scheduledTime);
                
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
        
        // Cancel meeting - Use 'canceled' to match frontend expectations
        await Meeting.update(id, {
            status: 'canceled',
            canceled_at: new Date(),
            canceled_by: volunteerId
        });
        
        // Reset student availability after cancellation
        // This ensures the student can be booked for another meeting
        // Legacy student availability reset removed - using unified users table
        
        // Cancel all notifications for this meeting
        try {
            await notificationService.cancelMeetingNotifications(id);

            // Send cancellation notification to both volunteer and student
            let student = await User.findById(meeting.student_id);
            const volunteer = await User.findById(meeting.volunteer_id);

            // If student not found, meeting.student_id might be from students table
            if (!student) {
                const studentsLookup = await pool.query(
                    'SELECT u.* FROM students s JOIN users u ON s.user_id = u.id WHERE s.id = $1',
                    [meeting.student_id]
                );
                if (studentsLookup.rows.length > 0) {
                    student = studentsLookup.rows[0];
                }
            }

            if (student) {
                await notificationService.sendNotification({
                    recipient_id: student.id,
                    recipient_role: 'student',
                    title: '❌ Meeting Canceled',
                    message: `Your meeting scheduled for ${new Date(meeting.scheduledTime).toLocaleString()} has been canceled by ${req.user.full_name || req.user.fullName}. You can schedule a new meeting anytime.`,
                    type: 'meeting_canceled',
                    priority: 'high',
                    metadata: {
                        meeting_id: id,
                        canceled_by: req.user.full_name || req.user.fullName,
                        canceled_at: new Date().toISOString(),
                        original_time: meeting.scheduledTime
                    }
                }, ['in-app', 'push', 'email'], {
                    persistent: true,
                    auto_delete_after: 2880, // 48 hours
                    require_interaction: false,
                    action_url: `/student/dashboard`,
                    tag: `meeting-canceled-${id}`
                });

                // Emit Socket.IO event for real-time UI update
                const ioCancel = getIO();
                if (ioCancel) {
                    ioCancel.to(`user_${student.id}`).emit('meeting-canceled', {
                        meeting_id: id,
                        message: `Your meeting has been canceled by ${req.user.full_name || req.user.fullName}`,
                        canceledBy: req.user.full_name || req.user.fullName,
                        originalTime: meeting.scheduledTime
                    });
                    console.log(`❌ Emitted meeting-canceled event to student user_${student.id}`);
                }
            }

            if (volunteer && volunteer.id !== req.user.id) {
                await notificationService.sendNotification({
                    recipient_id: volunteer.id,
                    recipient_role: 'volunteer',
                    title: '❌ Meeting Canceled',
                    message: `Your meeting scheduled for ${new Date(meeting.scheduledTime).toLocaleString()} has been canceled. You can schedule new meetings from your dashboard.`,
                    type: 'meeting_canceled',
                    priority: 'high',
                    metadata: {
                        meeting_id: id,
                        canceled_by: req.user.full_name || req.user.fullName,
                        canceled_at: new Date().toISOString(),
                        original_time: meeting.scheduledTime
                    }
                }, ['in-app', 'push', 'email'], {
                    persistent: true,
                    auto_delete_after: 2880, // 48 hours
                    require_interaction: false,
                    action_url: `/volunteer/dashboard/students.html`,
                    tag: `meeting-canceled-${id}`
                });
            }
            
            // Send confirmation to the canceling user
            await notificationService.sendNotification({
                recipient_id: req.user.id,
                recipient_role: req.user.role,
                title: '✅ Meeting Canceled Successfully',
                message: `Your meeting scheduled for ${new Date(meeting.scheduledTime).toLocaleString()} has been canceled. All participants have been notified.`,
                type: 'meeting_canceled_confirmation',
                priority: 'medium',
                metadata: {
                    meeting_id: id,
                    canceled_at: new Date().toISOString(),
                    original_time: meeting.scheduledTime
                }
            }, ['in-app', 'push'], {
                persistent: false,
                auto_delete_after: 60, // 1 hour
                require_interaction: false,
                action_url: req.user.role === 'volunteer' ? `/volunteer/dashboard/students.html` : `/student/dashboard`,
                tag: `meeting-canceled-confirmation-${id}`
            });
            
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

        // Helper function to determine real-time meeting status
        function getRealTimeStatus(meeting) {
            const now = new Date();
            const meetingStart = new Date(meeting.scheduled_time);
            const meetingEnd = new Date(meetingStart.getTime() + (60 * 60 * 1000)); // Assume 1 hour duration
            const minutesLate = Math.floor((now - meetingStart) / (1000 * 60));
            
            // If meeting was manually canceled, keep that status
            if (meeting.status === 'canceled') {
                return 'canceled';
            }
            
            // If meeting was manually marked as completed, keep that status
            if (meeting.status === 'completed') {
                return 'completed';
            }
            
            // If meeting was already marked as missed, keep that status
            if (meeting.status === 'missed') {
                return 'missed';
            }
            
            // Real-time status detection with automatic timeout logic
            if (now < meetingStart) {
                // Meeting is in the future
                return 'upcoming';
            } else if (now >= meetingStart && now <= meetingEnd) {
                // Meeting should be happening right now
                if (meeting.status === 'in_progress') {
                    return 'in_progress';
                } else if (minutesLate >= 40) {
                    // Auto-timeout: 40+ minutes late = missed
                    // This will trigger database update below
                    return 'auto_missed';
                } else {
                    // Still within grace period
                    return 'missed_start';
                }
            } else {
                // Meeting time has passed
                if (meeting.status === 'in_progress') {
                    return 'ended'; // Was active but time passed
                } else if (meeting.status === 'scheduled') {
                    return 'missed'; // Was scheduled but never started
                } else {
                    return meeting.status; // Keep other statuses
                }
            }
        }

        // Get current volunteer ID for ownership checking and meeting count
        const currentVolunteerId = req.user.id;

        // Get the requester's timezone for formatted time display
        const viewerTimezone = await getUserTimezone(currentVolunteerId);

        // Helper function to format meeting time in viewer's timezone
        const formatMeetingTime = (scheduledTime) => {
            if (!scheduledTime) return null;
            return formatInTimezone(scheduledTime, viewerTimezone);
        };

        // PRIVACY: Only get meetings involving THIS volunteer, but be more flexible for active meetings
        
        // 1. First, find ANY active meeting involving THIS volunteer and this student
        console.log('Querying for active meeting between volunteer', currentVolunteerId, 'and student', actualStudentId);
        
        const activeMeetingQuery = `
            SELECT 
                m.*,
                v.full_name as volunteer_name
            FROM meetings m
            LEFT JOIN users v ON m.volunteer_id = v.id
            WHERE m.student_id = $1 
            AND m.volunteer_id = $2
            AND (m.status = 'scheduled' OR m.status = 'in_progress')
            ORDER BY m.scheduled_time ASC
            LIMIT 1
        `;
        
        const activeMeetingResult = await pool.query(activeMeetingQuery, [actualStudentId, currentVolunteerId]);
        let activeMeeting = activeMeetingResult.rows[0] || null;
        
        console.log('Active meeting query result:', {
            found: activeMeeting ? 'YES' : 'NO',
            meetingData: activeMeeting ? {
                id: activeMeeting.id,
                status: activeMeeting.status,
                scheduled_time: activeMeeting.scheduled_time,
                volunteer_id: activeMeeting.volunteer_id,
                student_id: activeMeeting.student_id
            } : 'None'
        });

        // 2. Get ALL meetings between THIS volunteer and this student (for history)
        const volunteerStudentMeetingsQuery = `
            SELECT 
                m.*,
                v.full_name as volunteer_name
            FROM meetings m
            LEFT JOIN users v ON m.volunteer_id = v.id
            WHERE m.student_id = $1 
            AND m.volunteer_id = $2
            ORDER BY m.scheduled_time DESC
        `;
        
        const volunteerStudentMeetingsResult = await pool.query(volunteerStudentMeetingsQuery, [actualStudentId, currentVolunteerId]);
        const volunteerStudentMeetings = volunteerStudentMeetingsResult.rows;
        
        console.log('Volunteer-student meetings found:', volunteerStudentMeetings.length);

        // Process meetings and auto-update timed-out meetings
        const processedMeetings = [];
        const meetingsToUpdate = [];
        
        for (const meeting of volunteerStudentMeetings) {
            const realTimeStatus = getRealTimeStatus(meeting);
            
            // Check if meeting should be auto-updated to missed status
            if (realTimeStatus === 'auto_missed' && meeting.status === 'scheduled') {
                meetingsToUpdate.push({
                    id: meeting.id,
                    originalStatus: meeting.status
                });
                
                // Update the meeting object for response
                meeting.status = 'missed';
                meeting.auto_missed = true;
                meeting.realTimeStatus = 'missed';
            } else {
                meeting.realTimeStatus = realTimeStatus;
            }
            
            processedMeetings.push(meeting);
        }
        
        // Batch update timed-out meetings in database
        if (meetingsToUpdate.length > 0) {
            console.log(`⏰ Auto-updating ${meetingsToUpdate.length} timed-out meetings to 'missed' status`);
            
            for (const meetingUpdate of meetingsToUpdate) {
                try {
                    await pool.query(`
                        UPDATE meetings 
                        SET status = 'missed', 
                            updated_at = NOW()
                        WHERE id = $1 AND status = 'scheduled'
                    `, [meetingUpdate.id]);
                    
                    console.log(`✅ Meeting ${meetingUpdate.id} auto-marked as missed (40+ min timeout)`);
                } catch (updateError) {
                    console.error(`❌ Failed to auto-update meeting ${meetingUpdate.id}:`, updateError);
                }
            }
        }

        // Count meetings between current volunteer and this student (for limit check)
        // IMPORTANT: Count all active meetings (scheduled, completed, in_progress)
        // Only exclude missed and canceled meetings
        const volunteerStudentMeetingCount = processedMeetings.filter(m => 
            m.status !== 'missed' && m.status !== 'canceled' && m.status !== 'cancelled'
        ).length;

        console.log('Privacy-focused database result:', {
            activeMeeting: activeMeeting ? 'Found' : 'None',
            volunteerStudentMeetings: volunteerStudentMeetings.length,
            volunteerStudentMeetingCount
        });

        // Return privacy-focused meeting data (only THIS volunteer's meetings)
        // Include timezone-formatted times for accurate display regardless of browser settings
        const responseData = {
            // Active meeting only if THIS volunteer is involved
            activeMeeting: activeMeeting ? {
                id: activeMeeting.id,
                roomId: activeMeeting.room_id,
                scheduled_time: activeMeeting.scheduled_time,
                scheduled_time_formatted: formatMeetingTime(activeMeeting.scheduled_time),
                endTime: activeMeeting.end_time,
                status: activeMeeting.status,
                realTimeStatus: getRealTimeStatus(activeMeeting),
                studentId: activeMeeting.student_id,
                volunteerId: activeMeeting.volunteer_id,
                volunteer_name: activeMeeting.volunteer_name,
                // Also provide snake_case versions for compatibility
                student_id: activeMeeting.student_id,
                volunteer_id: activeMeeting.volunteer_id
            } : null,

            // For backward compatibility, also set the 'meeting' field
            meeting: activeMeeting ? {
                id: activeMeeting.id,
                roomId: activeMeeting.room_id,
                scheduled_time: activeMeeting.scheduled_time,
                scheduled_time_formatted: formatMeetingTime(activeMeeting.scheduled_time),
                endTime: activeMeeting.end_time,
                status: activeMeeting.status,
                realTimeStatus: getRealTimeStatus(activeMeeting),
                studentId: activeMeeting.student_id,
                volunteerId: activeMeeting.volunteer_id,
                volunteer_name: activeMeeting.volunteer_name,
                student_id: activeMeeting.student_id,
                volunteer_id: activeMeeting.volunteer_id
            } : null,

            // Meetings between THIS volunteer and this student (for history tab)
            volunteerStudentMeetings: processedMeetings.map(meeting => ({
                id: meeting.id,
                roomId: meeting.room_id,
                scheduled_time: meeting.scheduled_time,
                scheduled_time_formatted: formatMeetingTime(meeting.scheduled_time),
                status: meeting.status,
                realTimeStatus: meeting.realTimeStatus,
                volunteer_id: meeting.volunteer_id,
                volunteer_name: meeting.volunteer_name,
                isOwner: true, // These are all this volunteer's meetings
                created_at: meeting.created_at,
                auto_missed: meeting.auto_missed || false // Flag for auto-timeout
            })),

            // Meeting statistics
            meetingStats: {
                volunteerStudentMeetingCount,
                meetingLimit: 3,
                canScheduleMore: volunteerStudentMeetingCount < 3,
                totalVolunteerMeetings: processedMeetings.length
            },

            // Viewer's timezone context for frontend reference
            viewerTimezone: viewerTimezone,
            currentVolunteerId: currentVolunteerId
        };

        console.log('Sending privacy-focused API response:', {
            activeMeeting: responseData.activeMeeting ? 'Yes' : 'No',
            volunteerStudentMeetings: responseData.volunteerStudentMeetings.length,
            volunteerStudentCount: volunteerStudentMeetingCount,
            canScheduleMore: responseData.meetingStats.canScheduleMore,
            currentVolunteerId: currentVolunteerId,
            actualStudentId: actualStudentId,
            debugInfo: {
                activeMeetingData: responseData.activeMeeting,
                volunteerStudentMeetingsData: responseData.volunteerStudentMeetings
            }
        });

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
        if (!['active', 'pending', 'scheduled', 'in_progress'].includes(meeting.status)) {
            return res.status(400).json({ success: false, message: 'Meeting cannot be ended in current status' });
        }
        
        // Determine if this was a successful meeting for limit counting
        const endTime = new Date();
        const scheduledTime = new Date(meeting.scheduled_time);
        const currentTime = new Date();
        
        // Calculate how long the meeting was available (from scheduled time to now)
        const availableDurationMinutes = Math.floor((currentTime - scheduledTime) / (1000 * 60));
        // durationMinutes is the time since scheduled start (used for logging and notifications)
        const durationMinutes = Math.max(0, availableDurationMinutes);

        // Consider a meeting "successful" if:
        // 1. The meeting was scheduled and participants had reasonable time to interact (at least 5 minutes past start time)
        // 2. OR if it was already marked as completed
        // 3. OR if both participants explicitly ended it (indicates they were both present)
        const isSuccessfulMeeting = (
            availableDurationMinutes >= 5 || 
            meeting.status === 'completed' ||
            meeting.status === 'in_progress' ||
            meeting.status === 'active'
        );
        
        // Set appropriate final status based on success criteria
        const finalStatus = isSuccessfulMeeting ? 'completed' : 'ended';
        
        // Update meeting status
        await pool.query(`
            UPDATE meetings 
            SET 
                status = $1,
                end_time = $2,
                ended_by = $3,
                end_reason = $4,
                updated_at = NOW()
            WHERE id = $5
        `, [finalStatus, endTime, userId, reason, meeting.id]);
        
        // Determine who ended the meeting and who needs to be notified
        const endedByName = userRole === 'volunteer' ? meeting.volunteer_name : meeting.student_name;
        let otherParticipantId = userRole === 'volunteer' ? meeting.student_id : meeting.volunteer_id;
        const otherParticipantRole = userRole === 'volunteer' ? 'student' : 'volunteer';
        const otherParticipantName = userRole === 'volunteer' ? meeting.student_name : meeting.volunteer_name;

        // If other participant is a student, resolve to users.id (might be students.id)
        if (otherParticipantRole === 'student') {
            const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [otherParticipantId, 'student']);
            if (userCheck.rows.length === 0) {
                // otherParticipantId is from students table, get the user_id
                const studentsLookup = await pool.query('SELECT user_id FROM students WHERE id = $1', [otherParticipantId]);
                if (studentsLookup.rows.length > 0 && studentsLookup.rows[0].user_id) {
                    otherParticipantId = studentsLookup.rows[0].user_id;
                }
            }
        }
        
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
        const ioEnd = getIO();
        const otherParticipantRoom = `${otherParticipantRole}_${otherParticipantId}`;
        if (ioEnd) {
            ioEnd.to(otherParticipantRoom).emit('meeting-force-end', notificationData);

            // Also send to general user room for cross-tab notifications
            ioEnd.to(`user_${otherParticipantId}`).emit('meeting-force-end', notificationData);

            // Send to meeting room to kick out anyone still in the room
            ioEnd.to(meeting.room_id).emit('meeting-terminated', {
                meetingId: meeting.id,
                endedBy: endedByName,
                reason: reason,
                message: 'Meeting has been ended by a participant',
                timestamp: endTime.toISOString()
            });

            // Also notify the user who ended the call (for their dashboard update)
            const currentUserRoom = `${userRole}_${userId}`;
            ioEnd.to(currentUserRoom).emit('meeting-completed', {
                meetingId: meeting.id,
                roomId: meeting.room_id,
                finalStatus: finalStatus,
                message: `Meeting with ${otherParticipantName} has been completed`,
                timestamp: endTime.toISOString()
            });
            ioEnd.to(`user_${userId}`).emit('meeting-completed', {
                meetingId: meeting.id,
                roomId: meeting.room_id,
                finalStatus: finalStatus,
                message: `Meeting with ${otherParticipantName} has been completed`,
                timestamp: endTime.toISOString()
            });
        }
        
        console.log(`✅ Meeting ${meeting.id} ended by ${userRole} ${userId} (${endedByName})`);
        console.log(`� Meeting duration: ${durationMinutes} minutes, Status: ${finalStatus} (${isSuccessfulMeeting ? 'COUNTS toward limit' : 'does NOT count toward limit'})`);
        console.log(`�📡 Notified ${otherParticipantRole} ${otherParticipantId} (${otherParticipantName})`);
        
        // Send meeting completion notifications
        try {
            const completionMessage = finalStatus === 'completed' 
                ? '🎉 Meeting Completed Successfully!' 
                : '⏰ Meeting Ended';
                
            const completionDetails = finalStatus === 'completed'
                ? 'Thank you for participating in this conversation practice session. Your engagement helps build stronger communities!'
                : 'The meeting has ended. Thank you for your time.';

            // Notify the other participant
            if (otherParticipantId && otherParticipantRole) {
                await notificationService.sendNotification({
                    recipient_id: otherParticipantId,
                    recipient_role: otherParticipantRole,
                    title: completionMessage,
                    message: `Your meeting with ${endedByName} has ended. ${completionDetails}`,
                    type: finalStatus === 'completed' ? 'meeting_completed' : 'meeting_ended',
                    priority: 'medium',
                    metadata: {
                        meeting_id: meeting.id,
                        ended_by: endedByName,
                        ended_by_role: userRole,
                        final_status: finalStatus,
                        ended_at: endTime.toISOString(),
                        duration_minutes: durationMinutes
                    }
                }, ['in-app', 'push'], {
                    persistent: true,
                    auto_delete_after: 1440, // 24 hours
                    require_interaction: false,
                    action_url: otherParticipantRole === 'student' ? '/student/dashboard' : '/volunteer/dashboard/students.html',
                    tag: `meeting-ended-${meeting.id}`
                });
            }

            // Notify the current user
            await notificationService.sendNotification({
                recipient_id: userId,
                recipient_role: userRole,
                title: completionMessage,
                message: `Your meeting with ${otherParticipantName} has ended. ${completionDetails}`,
                type: finalStatus === 'completed' ? 'meeting_completed' : 'meeting_ended',
                priority: 'medium',
                metadata: {
                    meeting_id: meeting.id,
                    final_status: finalStatus,
                    ended_at: endTime.toISOString(),
                    duration_minutes: durationMinutes
                }
            }, ['in-app', 'push'], {
                persistent: false,
                auto_delete_after: 240, // 4 hours
                require_interaction: false,
                action_url: userRole === 'student' ? '/student/dashboard' : '/volunteer/dashboard/students.html',
                tag: `meeting-ended-confirmation-${meeting.id}`
            });

        } catch (notificationError) {
            console.error('Error sending meeting completion notifications:', notificationError);
            // Don't fail the meeting end if notifications fail
        }
        
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
 * Create a reschedule notification for both student and volunteer
 * @param {Object} meeting - The updated meeting object
 * @param {Object} rescheduler - The user who rescheduled (volunteer or admin)
 * @param {string} originalTime - The original scheduled time
 * @param {string} newTime - The new scheduled time
 */
async function createRescheduleNotification(meeting, rescheduler, originalTime, newTime) {
    try {
        // Get meeting participants
        // Handle both camelCase and snake_case column names from database
        const volunteerId = meeting.volunteer_id || meeting.volunteerId;
        const studentId = meeting.student_id || meeting.studentId;

        // Get volunteer from users table (include timezone)
        const volunteerResult = await pool.query(
            'SELECT id, full_name, email, timezone FROM users WHERE id = $1 AND role = $2',
            [volunteerId, 'volunteer']
        );

        if (volunteerResult.rows.length === 0) {
            console.error('Could not find volunteer for reschedule notification');
            return;
        }
        const volunteer = volunteerResult.rows[0];
        const volunteerTimezone = volunteer.timezone || 'UTC';

        // Get student - handle both users.id and students.id (include timezone)
        let studentResult = await pool.query(
            'SELECT id, full_name, email, timezone FROM users WHERE id = $1 AND role = $2',
            [studentId, 'student']
        );

        // If not found in users table, studentId might be from students table
        if (studentResult.rows.length === 0) {
            const studentsLookup = await pool.query(
                'SELECT u.id, u.full_name, u.email, u.timezone FROM students s JOIN users u ON s.user_id = u.id WHERE s.id = $1',
                [studentId]
            );
            if (studentsLookup.rows.length > 0) {
                studentResult = studentsLookup;
            }
        }

        if (studentResult.rows.length === 0) {
            console.error('Could not find student for reschedule notification, studentId:', studentId);
            return;
        }
        const student = studentResult.rows[0];
        const studentTimezone = student.timezone || 'UTC';

        // Helper function to format time in a specific timezone
        const formatTimeInTimezone = (time, timezone) => {
            if (!time || time === 'Invalid Date' || isNaN(new Date(time).getTime())) {
                return 'Previous time';
            }
            // Validate timezone - fall back to UTC if invalid
            let tz = timezone;
            try {
                new Date().toLocaleString('en-US', { timeZone: tz });
            } catch (e) {
                console.warn(`Invalid timezone "${timezone}", falling back to UTC`);
                tz = 'UTC';
            }
            return new Date(time).toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: tz
            });
        };

        // Format times for each recipient in their timezone
        const originalDateForStudent = formatTimeInTimezone(originalTime, studentTimezone);
        const newDateForStudent = formatTimeInTimezone(newTime, studentTimezone);
        const originalDateForVolunteer = formatTimeInTimezone(originalTime, volunteerTimezone);
        const newDateForVolunteer = formatTimeInTimezone(newTime, volunteerTimezone);

        console.log(`📅 Creating reschedule notifications for meeting ${meeting.id}`);

        // Student notification (they receive info about who rescheduled)
        const studentMessage = `Your meeting has been rescheduled by ${rescheduler.full_name}. ` +
                              `Original time: ${originalDateForStudent}. ` +
                              `New time: ${newDateForStudent}.`;

        // Volunteer notification (confirmation of their reschedule action)
        const volunteerMessage = rescheduler.id === volunteer.id
            ? `You successfully rescheduled your meeting with ${student.full_name}. ` +
              `Original time: ${originalDateForVolunteer}. ` +
              `New time: ${newDateForVolunteer}.`
            : `Your meeting with ${student.full_name} has been rescheduled by ${rescheduler.full_name}. ` +
              `Original time: ${originalDateForVolunteer}. ` +
              `New time: ${newDateForVolunteer}.`;

        // Shared metadata for both notifications
        const baseMetadata = {
            meeting_id: meeting.id,
            original_time: originalTime || null,
            new_time: newTime,
            rescheduled_by: rescheduler.full_name,
            student_name: student.full_name,
            volunteer_name: volunteer.full_name,
            meeting_url: `/volunteer/dashboard/upcoming.html`,
            type: 'meeting_rescheduled'
        };

        // Send notification to student with immediate in-app notification only
        await notificationService.sendNotification({
            recipient_id: student.id,
            recipient_role: 'student',
            title: '📅 Meeting Rescheduled',
            message: studentMessage,
            type: 'meeting_rescheduled',
            priority: 'high',
            metadata: {
                ...baseMetadata,
                action_url: '/student/dashboard'
            }
        }, ['in-app', 'push'], {  // Include push notification for mobile alerts
            persistent: true,
            require_interaction: false,
            action_url: '/student/dashboard',
            icon_url: '/favicon.ico',
            badge_url: '/favicon.ico',
            tag: `meeting-reschedule-${meeting.id}`,
            auto_delete_after: 1440 // 24 hours
        });

        // Send notification to volunteer with immediate in-app notification only  
        await notificationService.sendNotification({
            recipient_id: volunteer.id,
            recipient_role: 'volunteer',
            title: '📅 Meeting Rescheduled',
            message: volunteerMessage,
            type: 'meeting_rescheduled',
            priority: 'high',
            metadata: {
                ...baseMetadata,
                action_url: '/volunteer/dashboard/upcoming.html'
            }
        }, ['in-app', 'push'], {  // Include push notification for mobile alerts
            persistent: true,
            require_interaction: false,
            action_url: '/volunteer/dashboard/upcoming.html',
            icon_url: '/favicon.ico',
            badge_url: '/favicon.ico',
            tag: `meeting-reschedule-${meeting.id}`,
            auto_delete_after: 1440 // 24 hours
        });

        console.log(`✅ Reschedule notifications sent to both student ${student.id} and volunteer ${volunteer.id}`);

        // Emit real-time notification for immediate UI updates
        const ioReschedule = getIO();
        if (ioReschedule) {
            // Send to student
            ioReschedule.to(`user_${student.id}`).emit('meeting-rescheduled', {
                meeting_id: meeting.id,
                original_time: originalTime,
                new_time: newTime,
                rescheduled_by: rescheduler.full_name,
                message: studentMessage,
                timestamp: new Date().toISOString()
            });
            console.log(`📅 Emitted meeting-rescheduled to student user_${student.id}`);

            // Send to volunteer
            ioReschedule.to(`user_${volunteer.id}`).emit('meeting-rescheduled', {
                meeting_id: meeting.id,
                original_time: originalTime,
                new_time: newTime,
                rescheduled_by: rescheduler.full_name,
                message: volunteerMessage,
                timestamp: new Date().toISOString()
            });
            console.log(`📅 Emitted meeting-rescheduled to volunteer user_${volunteer.id}`);

            // Update notification badge for both users
            ioReschedule.to(`user_${student.id}`).emit('notification-badge-update', { increment: 1 });
            ioReschedule.to(`user_${volunteer.id}`).emit('notification-badge-update', { increment: 1 });
        }
        
    } catch (error) {
        console.error('❌ Error creating reschedule notification:', error);
        // Don't throw error - notification failure shouldn't break meeting update
    }
}
