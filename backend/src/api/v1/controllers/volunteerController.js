/**
 * Volunteer API Controller
 * Handles all volunteer-related API endpoints
 */
import User from '../../../models/User.js';
import Meeting from '../../../models/Meeting.js';
import pool from '../../../config/database.js';

// Local placeholder image for students (Volunteer Dashboard default)
const PLACEHOLDER_LOCAL = '/images/default-profile.svg';

// Sanitize image URLs to avoid failed external placeholder requests
function sanitizeImageUrl(url) {
    if (!url) return PLACEHOLDER_LOCAL;
    const src = String(url);
    // Replace known broken external placeholder host with local asset
    if (/^https?:\/\/via\.placeholder\.com/i.test(src)) {
        return PLACEHOLDER_LOCAL;
    }
    return src;
}

/**
 * Get volunteer dashboard data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Volunteer info and meetings data
 */
export const getDashboardData = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const volunteer = await User.findById(volunteerId);
        
        if (!volunteer) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }
        
        // Get volunteer's upcoming and past meetings
        const upcomingMeetings = await Meeting.findUpcomingByVolunteerId(volunteerId);
        const pastMeetings = await Meeting.findPastByVolunteerId(volunteerId);
        
        // Get cancelled meetings
        const query = `
            SELECT m.id, su.full_name as student_name, m.scheduled_time
            FROM meetings m
            JOIN users su ON m.student_id = su.id AND su.role = 'student'
            WHERE m.volunteer_id = $1 AND m.status = 'canceled'
            ORDER BY m.scheduled_time DESC;
        `;
        
        const { rows: cancelledMeetings } = await pool.query(query, [volunteerId]);
        
        // Get missed meetings
        const missedQuery = `
            SELECT m.id, su.full_name as student_name, m.scheduled_time
            FROM meetings m
            JOIN users su ON m.student_id = su.id AND su.role = 'student'
            WHERE m.volunteer_id = $1 AND m.status = 'missed'
            ORDER BY m.scheduled_time DESC;
        `;
        
        const { rows: missedMeetings } = await pool.query(missedQuery, [volunteerId]);
        
        // Return volunteer data and meetings
        res.json({
            volunteer: {
                id: volunteer.id,
                fullName: volunteer.full_name || volunteer.fullName || '',
                email: volunteer.email || ''
            },
            meetings: {
                upcoming: upcomingMeetings || [],
                past: pastMeetings || [],
                cancelled: cancelledMeetings.map(meeting => ({
                    id: meeting.id,
                    studentName: meeting.student_name,
                    scheduledTime: meeting.scheduled_time
                })) || [],
                missed: missedMeetings.map(meeting => ({
                    id: meeting.id,
                    studentName: meeting.student_name,
                    scheduledTime: meeting.scheduled_time
                })) || []
            }
        });
        
        // Log the response for debugging
        console.log(`Dashboard data sent for volunteer ${volunteerId}:`, {
            upcomingCount: upcomingMeetings?.length || 0,
            pastCount: pastMeetings?.length || 0,
            cancelledCount: cancelledMeetings?.length || 0,
            missedCount: missedMeetings?.length || 0
        });
    } catch (error) {
        console.error('Error fetching volunteer dashboard data:', error);
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
};

/**
 * Get available student cards
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON data for available students
 */
export const getStudentCards = async (req, res) => {
    try {
        // Get date from query parameter or use current date
        const date = req.query.date || new Date().toISOString().split('T')[0];
        console.log(`Getting available students for date: ${date}`);
        
        // Get current volunteer ID from jwt_auth
        const currentVolunteerId = req.user.id;
        
        // Get students available/unavailable for the specified date
        const availableQuery = `
            SELECT u.id, u.full_name, u.username as admission_number, u.email,
                   u.age, u.gender, u.bio, u.story, u.interests,
                   u.profile_image as photo_url, u.gallery_images as gallery, 
                   u.location, u.english_level, u.learning_goals, u.preferred_topics,
                   true as is_available
            FROM users u
            WHERE u.role = 'student'
            AND u.id NOT IN (
                SELECT DISTINCT m.student_id 
                FROM meetings m 
                WHERE DATE(m.scheduled_time) = $1 
                AND m.status IN ('scheduled', 'in_progress')
            )
            ORDER BY u.full_name;
        `;
        
        const unavailableQuery = `
            SELECT u.id, u.full_name, u.username as admission_number, u.email,
                   u.age, u.gender, u.bio, u.story, u.interests,
                   u.profile_image as photo_url, u.gallery_images as gallery,
                   u.location, u.english_level, u.learning_goals, u.preferred_topics,
                   false as is_available,
                   m.volunteer_id as meeting_volunteer_id, m.scheduled_time as meeting_time,
                   m.id as meeting_id
            FROM users u
            JOIN meetings m ON u.id = m.student_id
            WHERE u.role = 'student'
            AND DATE(m.scheduled_time) = $1
            AND m.status IN ('scheduled', 'in_progress')
            ORDER BY u.full_name;
        `;
        
        const { rows: availableStudents } = await pool.query(availableQuery, [date]);
        const { rows: unavailableStudents } = await pool.query(unavailableQuery, [date]);
        
        // Handle empty database gracefully - return success with empty arrays
        if ((!availableStudents || availableStudents.length === 0) && 
            (!unavailableStudents || unavailableStudents.length === 0)) {
            return res.status(200).json({
                success: true,
                data: {
                    available: [],
                    unavailable: []
                },
                message: 'No students found. The database appears to be empty. Please contact an administrator to add student profiles.',
                isEmpty: true
            });
        }
        
        // Process students into structured JSON data
        const processStudent = (student) => {
            // Determine interests or status text
            const interests = student.interests || 'English conversation practice';
            
            // Get the first letter of the student's name for avatar fallback
            const initial = student.full_name ? student.full_name.charAt(0).toUpperCase() : '?';
            
            // Parse gallery_images JSON array
            let galleryImages = [];
            if (student.gallery) {
                try {
                    galleryImages = JSON.parse(student.gallery);
                } catch (e) {
                    console.warn('Failed to parse gallery_images JSON:', e);
                    galleryImages = [];
                }
            }
            
            // Sanitize/normalize image URLs
            const sanitizedPhoto = sanitizeImageUrl(student.photo_url);
            const sanitizedGallery = Array.isArray(galleryImages)
                ? galleryImages.map((g) => sanitizeImageUrl(g))
                : [];

            return {
                id: student.id,
                full_name: student.full_name,
                interests: interests,
                photo_url: sanitizedPhoto,
                initial: initial,
                admission_number: student.admission_number,
                age: student.age,
                gender: student.gender,
                bio: student.bio,
                story: student.story,
                location: student.location,
                english_level: student.english_level,
                learning_goals: student.learning_goals,
                preferred_topics: student.preferred_topics,
                gallery: sanitizedGallery,
                is_available: student.is_available !== false // Default to true if not specified
            };
        };
        
        const processedAvailable = availableStudents.map(processStudent);
        
        // Process unavailable students with meeting ownership information
        const processedUnavailable = unavailableStudents.map(student => {
            // Check if the current volunteer is the one who scheduled the meeting
            const isOwner = student.meeting_volunteer_id === currentVolunteerId;
            
            return {
                ...processStudent(student),
                meeting: {
                    id: student.meeting_id,
                    time: student.meeting_time,
                    isOwner: isOwner
                }
            };
        });
        
        res.status(200).json({
            success: true,
            data: {
                available: processedAvailable,
                unavailable: processedUnavailable
            },
            message: 'Students retrieved successfully'
        });
    } catch (error) {
        console.error('Error fetching student cards:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load student data',
            message: error.message
        });
    }
};

/**
 * Get detailed student profile data for volunteers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Detailed student profile data with placeholders for missing values
 */
export const getStudentProfile = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get student from unified users table with all profile data
        const query = `
            SELECT u.id, u.full_name, u.username as admission_number, u.email,
                   u.age, u.gender, u.profile_image as photo_url,
                   u.bio, u.story, u.location, u.interests, u.is_available,
                   u.gallery_images,
                   u.english_level, u.learning_goals, u.preferred_topics
            FROM users u
            WHERE u.id = $1 AND u.role = 'student';
        `;
        
        const { rows } = await pool.query(query, [id]);
        const student = rows[0];
        
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        // Parse gallery_images JSON array for unlimited images
        const placeholderImage = PLACEHOLDER_LOCAL;
        let galleryImages = [];
        
        if (student.gallery_images) {
            try {
                galleryImages = JSON.parse(student.gallery_images);
            } catch (e) {
                console.warn('Failed to parse gallery_images JSON:', e);
                galleryImages = [];
            }
        }
        
        // Use actual gallery images if available, otherwise use profile image or placeholder
        const gallery = galleryImages.length > 0 
            ? galleryImages.map((g) => sanitizeImageUrl(g))
            : [sanitizeImageUrl(student.photo_url) || placeholderImage];
        
        // Format student data with placeholders for missing values
        res.json({
            student: {
                id: student.id,
                name: student.full_name || 'Student Name Not Available',
                profileImage: sanitizeImageUrl(student.photo_url) || placeholderImage,
                interests: student.interests || 'English conversation practice',
                bio: student.bio || 'No biography available for this student.',
                story: student.story || 'No story available.',
                age: student.age || 'Age not specified',
                gender: student.gender || 'Not specified',
                admissionNumber: student.admission_number || 'Not available',
                location: student.location || 'Kenya',
                gallery: gallery,
                isAvailable: student.is_available !== false, // Default to true if not specified
                englishLevel: student.english_level || 'Beginner',
                learningGoals: student.learning_goals || 'Improve English conversation skills',
                preferredTopics: student.preferred_topics || 'General conversation'
            }
        });
    } catch (error) {
        console.error('Error fetching student profile:', error);
        res.status(500).json({ error: 'Failed to fetch student profile' });
    }
};

/**
 * Create a new meeting between volunteer and student
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Created meeting data
 */
export const createMeeting = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const { studentId, date, time, timezone } = req.body;
        
        // Validate required fields
        if (!studentId || !date || !time || !timezone) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
        }
        
        // Validate time format (HH:MM)
        const timeRegex = /^\d{2}:\d{2}$/;
        if (!timeRegex.test(time)) {
            return res.status(400).json({ error: 'Invalid time format. Use HH:MM' });
        }
        
        // Check if student exists
        const student = await User.findById(studentId);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        // Check if student is available
        if (student.is_available === false) {
            return res.status(400).json({ error: 'Student is not available for meetings' });
        }
        
        // Format the scheduled time from date and time fields
        const scheduledTime = `${date} ${time}:00`;
        const scheduledDateTime = new Date(scheduledTime);
        
        // Validate that the scheduled time is in the future
        const now = new Date();
        if (scheduledDateTime <= now) {
            return res.status(400).json({ error: 'Cannot schedule meetings in the past' });
        }
        
        // Check for existing meeting conflicts for this student at the same time
        const conflictQuery = `
            SELECT id, scheduled_time, volunteer_id 
            FROM meetings 
            WHERE student_id = $1 
            AND scheduled_time = $2 
            AND status IN ('scheduled', 'in_progress')
        `;
        
        const { rows: conflicts } = await pool.query(conflictQuery, [studentId, scheduledTime]);
        
        if (conflicts.length > 0) {
            const conflict = conflicts[0];
            return res.status(409).json({ 
                error: 'Student already has a meeting scheduled at this time',
                conflictDetails: {
                    meetingId: conflict.id,
                    scheduledTime: conflict.scheduled_time,
                    volunteerId: conflict.volunteer_id
                }
            });
        }
        
        // Check for volunteer conflicts at the same time
        const volunteerConflictQuery = `
            SELECT id, scheduled_time, student_id 
            FROM meetings 
            WHERE volunteer_id = $1 
            AND scheduled_time = $2 
            AND status IN ('scheduled', 'in_progress')
        `;
        
        const { rows: volunteerConflicts } = await pool.query(volunteerConflictQuery, [volunteerId, scheduledTime]);
        
        if (volunteerConflicts.length > 0) {
            const conflict = volunteerConflicts[0];
            return res.status(409).json({ 
                error: 'You already have a meeting scheduled at this time',
                conflictDetails: {
                    meetingId: conflict.id,
                    scheduledTime: conflict.scheduled_time,
                    studentId: conflict.student_id
                }
            });
        }
        
        // Create a unique room ID for the meeting
        const roomId = `talktime-${volunteerId}-${studentId}-${Date.now()}`;
        
        // scheduledTime already defined above for conflict checking
        
        // Create meeting in database with parameters expected by the Meeting model
        const meetingData = {
            volunteerId,
            studentId,
            scheduledTime,
            roomId
        };
        
        const meeting = await Meeting.create(meetingData);
        
        // Return the created meeting
        res.status(201).json({
            meeting: {
                id: meeting.id,
                scheduledTime: meeting.scheduled_time,
                roomId: meeting.room_id,
                status: meeting.status,
                student: {
                    id: student.id,
                    name: student.full_name
                }
            }
        });
    } catch (error) {
        console.error('Error creating meeting:', error);
        res.status(500).json({ error: 'Failed to create meeting' });
    }
};
