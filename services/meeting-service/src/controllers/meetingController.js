import { v4 as uuidv4 } from 'uuid';
import Meeting from '../models/Meeting.js';
import pool from '../config/database.js';
import {
    checkOneCallPerDay,
    checkThreeMeetingLimit,
    checkVolunteerPerformance,
    validateSchedulingTime,
    getRealTimeStatus
} from '../services/businessRules.js';
import {
    publishMeetingCreated,
    publishMeetingRescheduled,
    publishMeetingCanceled,
    publishMeetingEnded
} from '../events/publisher.js';

/**
 * Get all meetings (admin only)
 */
export const getAllMeetings = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM meetings ORDER BY scheduled_time DESC LIMIT 100');
        res.json({ meetings: result.rows });
    } catch (error) {
        console.error('[Meeting Service] Error fetching meetings:', error);
        res.status(500).json({ error: 'Failed to fetch meetings' });
    }
};

/**
 * Get meeting by ID
 */
export const getMeetingById = async (req, res) => {
    try {
        const meeting = await Meeting.findById(req.params.id);
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' });
        }
        res.json({ meeting });
    } catch (error) {
        console.error('[Meeting Service] Error fetching meeting:', error);
        res.status(500).json({ error: 'Failed to fetch meeting' });
    }
};

/**
 * Get meeting by room ID
 */
export const getMeetingByRoomId = async (req, res) => {
    try {
        const meeting = await Meeting.findByRoomIdWithParticipants(req.params.roomId);
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' });
        }
        res.json(meeting);
    } catch (error) {
        console.error('[Meeting Service] Error fetching meeting by room:', error);
        res.status(500).json({ error: 'Failed to fetch meeting' });
    }
};

/**
 * Create new meeting
 */
export const createMeeting = async (req, res) => {
    try {
        const { studentId, scheduledTime } = req.body;
        const volunteerId = req.user.id;

        console.log('[Meeting Service] Creating meeting:', { studentId, volunteerId, scheduledTime });

        // Validate required fields
        if (!studentId || !scheduledTime) {
            return res.status(400).json({ error: 'Student ID and scheduled time are required' });
        }

        // Validate scheduling time constraints
        const timeValidation = validateSchedulingTime(scheduledTime);
        if (!timeValidation.valid) {
            return res.status(400).json(timeValidation);
        }

        // Verify student exists
        const studentResult = await pool.query(
            'SELECT id, full_name FROM users WHERE id = $1 AND role = $2',
            [studentId, 'student']
        );
        if (studentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        const student = studentResult.rows[0];

        // Verify volunteer exists
        const volunteerResult = await pool.query(
            'SELECT id, full_name FROM users WHERE id = $1 AND role = $2',
            [volunteerId, 'volunteer']
        );
        if (volunteerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }
        const volunteer = volunteerResult.rows[0];

        // Check volunteer performance restrictions
        const performance = await checkVolunteerPerformance(volunteerId);
        if (performance.isRestricted) {
            console.error('[Meeting Service] Volunteer restricted:', performance);
            return res.status(403).json({
                error: 'Account temporarily restricted',
                message: 'Your account is temporarily restricted due to high cancellation/missed call rates.',
                performanceData: performance
            });
        }

        // CRITICAL: Check 1-call-per-day rule
        const existingMeeting = await checkOneCallPerDay(studentId, scheduledTime);
        if (existingMeeting) {
            return res.status(409).json({
                error: 'Student already has a meeting scheduled for this date',
                existingMeeting
            });
        }

        // Check 3-meeting limit per volunteer-student pair
        const meetingLimit = await checkThreeMeetingLimit(volunteerId, studentId);
        if (!meetingLimit.canSchedule) {
            return res.status(403).json({
                error: 'You have reached the 3-meeting limit with this student.',
                meetingCount: meetingLimit.count,
                limit: meetingLimit.limit
            });
        }

        // Generate room ID
        const roomId = uuidv4();

        // Create meeting
        const meeting = await Meeting.create({
            studentId,
            volunteerId,
            scheduledTime,
            roomId,
            duration: 40,
            status: 'scheduled'
        });

        console.log('[Meeting Service] Meeting created:', meeting.id);

        // Publish event for notification service
        await publishMeetingCreated(meeting, volunteer, student);

        res.status(201).json({
            meeting,
            message: 'Meeting scheduled successfully'
        });
    } catch (error) {
        console.error('[Meeting Service] Error creating meeting:', error);
        res.status(500).json({ error: 'Failed to schedule meeting' });
    }
};

/**
 * Update meeting (reschedule)
 */
export const updateMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const { scheduledTime, duration, status } = req.body;
        const userId = req.user.id;

        const meeting = await Meeting.findById(id);
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' });
        }

        // Check authorization
        const isOwner = meeting.volunteer_id === userId;
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: 'Not authorized to update this meeting' });
        }

        const isReschedule = scheduledTime && scheduledTime !== meeting.scheduled_time;
        const oldTime = meeting.scheduled_time;

        const updateData = {
            scheduledTime: scheduledTime || meeting.scheduled_time,
            duration: duration || meeting.duration,
            status: status || meeting.status
        };

        if (isReschedule) {
            updateData.original_scheduled_time = meeting.original_scheduled_time || meeting.scheduled_time;
            updateData.is_rescheduled = true;
            updateData.reschedule_count = (meeting.reschedule_count || 0) + 1;
            updateData.last_rescheduled_at = new Date();
            updateData.rescheduled_by = userId;
        }

        const updatedMeeting = await Meeting.update(id, updateData);

        if (isReschedule) {
            await publishMeetingRescheduled(updatedMeeting, oldTime, scheduledTime, userId);
        }

        res.json({
            meeting: updatedMeeting,
            message: 'Meeting updated successfully'
        });
    } catch (error) {
        console.error('[Meeting Service] Error updating meeting:', error);
        res.status(500).json({ error: 'Failed to update meeting' });
    }
};

/**
 * Cancel meeting
 */
export const cancelMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const meeting = await Meeting.findById(id);
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' });
        }

        // Check authorization
        const isOwner = meeting.volunteer_id === userId;
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: 'Not authorized to cancel this meeting' });
        }

        await Meeting.update(id, { status: 'canceled' });

        // Publish event
        await publishMeetingCanceled(meeting, userId);

        res.json({ message: 'Meeting cancelled successfully' });
    } catch (error) {
        console.error('[Meeting Service] Error cancelling meeting:', error);
        res.status(500).json({ error: 'Failed to cancel meeting' });
    }
};

/**
 * End meeting
 */
export const endMeeting = async (req, res) => {
    try {
        const { meetingId } = req.params;
        const { reason = 'participant_left' } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        const meeting = await Meeting.findByRoomIdWithParticipants(meetingId);
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }

        // Verify authorization
        const isAuthorized =
            (userRole === 'volunteer' && meeting.volunteer_id === userId) ||
            (userRole === 'student' && meeting.student_id === userId) ||
            userRole === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        if (!['active', 'pending', 'scheduled', 'in_progress'].includes(meeting.status)) {
            return res.status(400).json({ success: false, message: 'Meeting cannot be ended in current status' });
        }

        const endTime = new Date();
        const scheduledTime = new Date(meeting.scheduled_time);
        const durationMinutes = Math.floor((endTime - scheduledTime) / (1000 * 60));

        // Meeting is "completed" if at least 5 minutes passed
        const isSuccessful = durationMinutes >= 5 || meeting.status === 'in_progress';
        const finalStatus = isSuccessful ? 'completed' : 'ended';

        await Meeting.update(meeting.id, {
            status: finalStatus,
            end_time: endTime,
            ended_by: userId,
            end_reason: reason
        });

        // Publish event
        await publishMeetingEnded(meeting, durationMinutes, finalStatus);

        res.json({
            success: true,
            message: 'Meeting ended successfully',
            meetingId: meeting.id,
            endTime: endTime.toISOString(),
            finalStatus
        });
    } catch (error) {
        console.error('[Meeting Service] Error ending meeting:', error);
        res.status(500).json({ success: false, message: 'Failed to end meeting' });
    }
};

/**
 * Get meetings by student ID
 */
export const getMeetingsByStudentId = async (req, res) => {
    try {
        const { studentId } = req.params;
        const volunteerId = req.user.id;

        // Find active meeting
        const activeMeeting = await Meeting.findActiveByParticipants(studentId, volunteerId);

        // Get all meetings between this volunteer and student
        const volunteerStudentMeetings = await Meeting.findByStudentIdWithVolunteer(studentId, volunteerId);

        // Process meetings and check for auto-timeout
        const processedMeetings = [];
        const meetingsToUpdate = [];

        for (const meeting of volunteerStudentMeetings) {
            const realTimeStatus = getRealTimeStatus(meeting);

            if (realTimeStatus === 'auto_missed' && meeting.status === 'scheduled') {
                meetingsToUpdate.push(meeting.id);
                meeting.status = 'missed';
                meeting.auto_missed = true;
            }
            meeting.realTimeStatus = realTimeStatus;
            processedMeetings.push(meeting);
        }

        // Batch update timed-out meetings
        if (meetingsToUpdate.length > 0) {
            await pool.query(`
                UPDATE meetings
                SET status = 'missed', updated_at = NOW()
                WHERE id = ANY($1) AND status = 'scheduled'
            `, [meetingsToUpdate]);
        }

        // Count active meetings for limit check
        const volunteerStudentMeetingCount = processedMeetings.filter(m =>
            !['missed', 'canceled', 'cancelled'].includes(m.status)
        ).length;

        res.json({
            activeMeeting: activeMeeting ? {
                ...activeMeeting,
                realTimeStatus: getRealTimeStatus(activeMeeting)
            } : null,
            meeting: activeMeeting ? {
                ...activeMeeting,
                realTimeStatus: getRealTimeStatus(activeMeeting)
            } : null,
            volunteerStudentMeetings: processedMeetings.map(m => ({
                id: m.id,
                roomId: m.room_id,
                scheduled_time: m.scheduled_time,
                status: m.status,
                realTimeStatus: m.realTimeStatus,
                volunteer_id: m.volunteer_id,
                volunteer_name: m.volunteer_name,
                isOwner: true,
                auto_missed: m.auto_missed || false
            })),
            meetingStats: {
                volunteerStudentMeetingCount,
                meetingLimit: 3,
                canScheduleMore: volunteerStudentMeetingCount < 3,
                totalVolunteerMeetings: processedMeetings.length
            },
            currentVolunteerId: volunteerId
        });
    } catch (error) {
        console.error('[Meeting Service] Error fetching student meetings:', error);
        res.status(500).json({ error: 'Failed to fetch student meetings' });
    }
};

/**
 * Get upcoming meetings for volunteer
 */
export const getUpcomingMeetings = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const meetings = await Meeting.findUpcomingByVolunteerId(volunteerId);
        res.json({ meetings });
    } catch (error) {
        console.error('[Meeting Service] Error fetching upcoming meetings:', error);
        res.status(500).json({ error: 'Failed to fetch meetings' });
    }
};

/**
 * Get past meetings for volunteer
 */
export const getPastMeetings = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const meetings = await Meeting.findPastByVolunteerId(volunteerId);
        res.json({ meetings });
    } catch (error) {
        console.error('[Meeting Service] Error fetching past meetings:', error);
        res.status(500).json({ error: 'Failed to fetch meetings' });
    }
};

export default {
    getAllMeetings,
    getMeetingById,
    getMeetingByRoomId,
    createMeeting,
    updateMeeting,
    cancelMeeting,
    endMeeting,
    getMeetingsByStudentId,
    getUpcomingMeetings,
    getPastMeetings
};
