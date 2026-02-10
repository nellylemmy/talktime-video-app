/**
 * Volunteer API Controller
 * Handles all volunteer-related API endpoints
 */
import User from '../../../models/User.js';
import Meeting from '../../../models/Meeting.js';
import pool from '../../../config/database.js';
import bcrypt from 'bcrypt';
import * as notificationService from '../../../services/notificationService.js';
import { getIO } from '../../../socket.js';

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
 * Get volunteer profile data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Volunteer profile information
 */
export const getVolunteerProfile = async (req, res) => {
    try {
        const volunteerId = req.user.id;

        // Get volunteer data from database
        const query = `
            SELECT
                id, username, full_name, email,
                age, gender, phone, timezone,
                profile_image, created_at, updated_at,
                volunteer_type, school_name, parent_email, parent_phone,
                security_question_1, security_question_2, security_question_3,
                security_answer_1_hash, security_answer_2_hash, security_answer_3_hash
            FROM users
            WHERE id = $1 AND role = 'volunteer'
        `;

        const result = await pool.query(query, [volunteerId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer profile not found' });
        }

        const volunteer = result.rows[0];

        // Return profile data
        res.json({
            success: true,
            profile: {
                id: volunteer.id,
                username: volunteer.username,
                fullName: volunteer.full_name,
                email: volunteer.email,
                age: volunteer.age,
                gender: volunteer.gender,
                phone: volunteer.phone,
                timezone: volunteer.timezone,
                profileImage: volunteer.profile_image,
                volunteerType: volunteer.volunteer_type,
                schoolName: volunteer.school_name,
                parentEmail: volunteer.parent_email,
                parentPhone: volunteer.parent_phone,
                securityQuestion1: volunteer.security_question_1,
                securityQuestion2: volunteer.security_question_2,
                securityQuestion3: volunteer.security_question_3,
                hasSecurityAnswer1: !!volunteer.security_answer_1_hash,
                hasSecurityAnswer2: !!volunteer.security_answer_2_hash,
                hasSecurityAnswer3: !!volunteer.security_answer_3_hash,
                joinedDate: volunteer.created_at
            }
        });
    } catch (error) {
        console.error('Error fetching volunteer profile:', error);
        res.status(500).json({ error: 'Failed to fetch profile data' });
    }
};

/**
 * Update volunteer profile data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Updated volunteer profile
 */
export const updateVolunteerProfile = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const body = req.body;

        // Handle password change separately (requires current password verification)
        if (body.currentPassword && body.newPassword) {
            const userResult = await pool.query(
                'SELECT password_hash FROM users WHERE id = $1 AND role = $2',
                [volunteerId, 'volunteer']
            );
            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'Volunteer not found' });
            }
            const validPassword = await bcrypt.compare(body.currentPassword, userResult.rows[0].password_hash);
            if (!validPassword) {
                return res.status(400).json({ error: 'Current password is incorrect' });
            }
            const newHash = await bcrypt.hash(body.newPassword, 10);
            await pool.query(
                'UPDATE users SET password_hash = $1 WHERE id = $2',
                [newHash, volunteerId]
            );
        }

        // Accept both camelCase (frontend) and snake_case field names
        const full_name = body.full_name || body.fullName;
        const username = body.username;
        const email = body.email;
        const age = body.age;
        const gender = body.gender;
        const phone = body.phone;
        const timezone = body.timezone;
        const volunteer_type = body.volunteer_type || body.volunteerType;
        const school_name = body.school_name || body.schoolName;
        const parent_email = body.parent_email || body.parentEmail;
        const parent_phone = body.parent_phone || body.parentPhone;

        // Security questions and answers
        const securityQuestion1 = body.securityQuestion1;
        const securityAnswer1 = body.securityAnswer1;
        const securityQuestion2 = body.securityQuestion2;
        const securityAnswer2 = body.securityAnswer2;
        const securityQuestion3 = body.securityQuestion3;
        const securityAnswer3 = body.securityAnswer3;

        // Build update query dynamically based on provided fields
        const updateFields = [];
        const values = [];
        let paramCount = 1;

        if (full_name !== undefined) {
            updateFields.push(`full_name = $${paramCount}`);
            values.push(full_name);
            paramCount++;
        }
        if (username !== undefined) {
            updateFields.push(`username = $${paramCount}`);
            values.push(username);
            paramCount++;
        }
        if (email !== undefined) {
            updateFields.push(`email = $${paramCount}`);
            values.push(email);
            paramCount++;
        }
        if (age !== undefined) {
            updateFields.push(`age = $${paramCount}`);
            values.push(age);
            paramCount++;
        }
        if (gender !== undefined) {
            updateFields.push(`gender = $${paramCount}`);
            values.push(gender);
            paramCount++;
        }
        if (phone !== undefined) {
            updateFields.push(`phone = $${paramCount}`);
            values.push(phone);
            paramCount++;
        }
        if (timezone !== undefined) {
            updateFields.push(`timezone = $${paramCount}`);
            values.push(timezone);
            paramCount++;
        }
        if (volunteer_type !== undefined) {
            updateFields.push(`volunteer_type = $${paramCount}`);
            values.push(volunteer_type);
            paramCount++;
        }
        if (school_name !== undefined) {
            updateFields.push(`school_name = $${paramCount}`);
            values.push(school_name);
            paramCount++;
        }
        if (parent_email !== undefined) {
            updateFields.push(`parent_email = $${paramCount}`);
            values.push(parent_email);
            paramCount++;
        }
        if (parent_phone !== undefined) {
            updateFields.push(`parent_phone = $${paramCount}`);
            values.push(parent_phone);
            paramCount++;
        }
        if (securityQuestion1 !== undefined) {
            updateFields.push(`security_question_1 = $${paramCount}`);
            values.push(securityQuestion1);
            paramCount++;
        }
        if (securityAnswer1) {
            const hash = await bcrypt.hash(securityAnswer1.toLowerCase().trim(), 10);
            updateFields.push(`security_answer_1_hash = $${paramCount}`);
            values.push(hash);
            paramCount++;
        }
        if (securityQuestion2 !== undefined) {
            updateFields.push(`security_question_2 = $${paramCount}`);
            values.push(securityQuestion2);
            paramCount++;
        }
        if (securityAnswer2) {
            const hash = await bcrypt.hash(securityAnswer2.toLowerCase().trim(), 10);
            updateFields.push(`security_answer_2_hash = $${paramCount}`);
            values.push(hash);
            paramCount++;
        }
        if (securityQuestion3 !== undefined) {
            updateFields.push(`security_question_3 = $${paramCount}`);
            values.push(securityQuestion3);
            paramCount++;
        }
        if (securityAnswer3) {
            const hash = await bcrypt.hash(securityAnswer3.toLowerCase().trim(), 10);
            updateFields.push(`security_answer_3_hash = $${paramCount}`);
            values.push(hash);
            paramCount++;
        }

        if (updateFields.length === 0) {
            // Password-only update (already handled above)
            if (body.currentPassword && body.newPassword) {
                const userResult = await pool.query(
                    `SELECT id, username, full_name, email, age, gender, phone, timezone,
                            profile_image, created_at, updated_at, volunteer_type, school_name,
                            parent_email, parent_phone, security_question_1, security_question_2, security_question_3
                     FROM users WHERE id = $1 AND role = 'volunteer'`,
                    [volunteerId]
                );
                return res.json({ success: true, volunteer: userResult.rows[0] });
            }
            return res.status(400).json({ error: 'No fields to update' });
        }

        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(volunteerId);

        const updateQuery = `
            UPDATE users
            SET ${updateFields.join(', ')}
            WHERE id = $${paramCount} AND role = 'volunteer'
            RETURNING id, username, full_name, email, age, gender, phone, timezone,
                      profile_image, created_at, updated_at, volunteer_type, school_name,
                      parent_email, parent_phone, security_question_1, security_question_2, security_question_3
        `;

        const result = await pool.query(updateQuery, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }

        res.json({
            success: true,
            volunteer: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating volunteer profile:', error);
        res.status(500).json({ error: 'Failed to update profile data' });
    }
};

/**
 * Get volunteer profile completion percentage
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Profile completion data
 */
export const getProfileCompletion = async (req, res) => {
    try {
        const volunteerId = req.user.id;

        // Get volunteer data from database
        const query = `
            SELECT
                full_name, email, age, gender, phone, timezone,
                profile_image, volunteer_type, school_name
            FROM users
            WHERE id = $1 AND role = 'volunteer'
        `;

        const result = await pool.query(query, [volunteerId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }

        const volunteer = result.rows[0];

        // Calculate completion percentage
        const fields = [
            'full_name',
            'email',
            'age',
            'gender',
            'phone',
            'timezone',
            'profile_image'
        ];

        let completedFields = 0;
        const incompleteFields = [];

        fields.forEach(field => {
            if (volunteer[field]) {
                completedFields++;
            } else {
                incompleteFields.push(field);
            }
        });

        const completionPercentage = Math.round((completedFields / fields.length) * 100);

        res.json({
            success: true,
            completionPercentage,
            completedFields,
            totalFields: fields.length,
            incompleteFields
        });
    } catch (error) {
        console.error('Error calculating profile completion:', error);
        res.status(500).json({ error: 'Failed to calculate profile completion' });
    }
};

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
 * Get volunteer performance metrics and reputation score
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Performance metrics with psychological impact data
 */
export const getVolunteerPerformance = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        
        // Get all meetings data with status counts
        // Exclude meetings cleared by admin from performance calculation
        const performanceQuery = `
            SELECT
                COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
                COUNT(*) FILTER (WHERE status = 'canceled') as cancelled_calls,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_calls_alt,
                COUNT(*) FILTER (WHERE status = 'missed') as missed_calls,
                COUNT(*) FILTER (WHERE status IN ('completed', 'canceled', 'cancelled', 'missed')) as total_scheduled,
                COUNT(*) FILTER (WHERE status = 'completed' AND scheduled_time >= NOW() - INTERVAL '30 days') as recent_completed,
                COUNT(*) FILTER (WHERE status IN ('canceled', 'cancelled') AND scheduled_time >= NOW() - INTERVAL '30 days') as recent_cancelled,
                COUNT(*) FILTER (WHERE status = 'missed' AND scheduled_time >= NOW() - INTERVAL '30 days') as recent_missed,
                COUNT(*) FILTER (WHERE status = 'completed') * 30 as total_minutes,
                COUNT(DISTINCT student_id) FILTER (WHERE status = 'completed') as students_impacted
            FROM meetings
            WHERE volunteer_id = $1 AND scheduled_time < NOW()
            AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)
        `;
        
        const { rows } = await pool.query(performanceQuery, [volunteerId]);
        const metrics = rows[0];
        
        // Calculate combined cancelled calls (handling both 'canceled' and 'cancelled' statuses)
        const cancelledCalls = parseInt(metrics.cancelled_calls) + parseInt(metrics.cancelled_calls_alt);
        const completedCalls = parseInt(metrics.completed_calls);
        const missedCalls = parseInt(metrics.missed_calls);
        const totalScheduled = parseInt(metrics.total_scheduled);
        const recentCancelled = parseInt(metrics.recent_cancelled);
        const recentMissed = parseInt(metrics.recent_missed);
        const recentCompleted = parseInt(metrics.recent_completed);
        
        // Calculate success rate and reliability score
        const successRate = totalScheduled > 0 ? Math.round((completedCalls / totalScheduled) * 100) : 100;
        const cancelledRate = totalScheduled > 0 ? Math.round((cancelledCalls / totalScheduled) * 100) : 0;
        const missedRate = totalScheduled > 0 ? Math.round((missedCalls / totalScheduled) * 100) : 0;
        
        // Calculate reputation score (0-100)
        let reputationScore = 100;
        reputationScore -= (cancelledRate * 1.5); // Heavy penalty for cancellations
        reputationScore -= (missedRate * 2); // Even heavier penalty for missing calls
        reputationScore = Math.max(0, Math.round(reputationScore));
        
        // Determine performance tier
        let performanceTier, tierColor, tierIcon;
        if (reputationScore >= 90) {
            performanceTier = 'Exceptional';
            tierColor = 'text-emerald-600';
            tierIcon = 'fas fa-crown';
        } else if (reputationScore >= 75) {
            performanceTier = 'Excellent';
            tierColor = 'text-green-600';
            tierIcon = 'fas fa-star';
        } else if (reputationScore >= 60) {
            performanceTier = 'Good';
            tierColor = 'text-blue-600';
            tierIcon = 'fas fa-thumbs-up';
        } else if (reputationScore >= 40) {
            performanceTier = 'Needs Improvement';
            tierColor = 'text-yellow-600';
            tierIcon = 'fas fa-exclamation-triangle';
        } else {
            performanceTier = 'At Risk';
            tierColor = 'text-red-600';
            tierIcon = 'fas fa-warning';
        }
        
        // Determine warning status and restrictions
        let warningStatus = 'none';
        let warningMessage = '';
        let isRestricted = false;
        
        // Check for restriction conditions
        if (cancelledRate >= 40 || missedRate >= 30 || reputationScore < 30) {
            isRestricted = true;
            warningStatus = 'critical';
            warningMessage = 'Your account is temporarily restricted from scheduling new calls due to high cancellation/missed call rates. Contact support to resolve this.';
        } else if (cancelledRate >= 30 || missedRate >= 20 || reputationScore < 50) {
            warningStatus = 'severe';
            warningMessage = 'WARNING: Your high cancellation/missed call rate is negatively impacting students. Immediate improvement required to avoid account restrictions.';
        } else if (cancelledRate >= 20 || missedRate >= 15 || (recentCancelled + recentMissed) >= 3) {
            warningStatus = 'moderate';
            warningMessage = 'Notice: Your recent cancellations/missed calls are affecting your reliability score. Please prioritize committed calls.';
        } else if (cancelledRate >= 10 || missedRate >= 10) {
            warningStatus = 'minor';
            warningMessage = 'Tip: Maintaining consistent attendance helps build trust with students and improves learning outcomes.';
        }
        
        // Calculate impact metrics for psychological motivation
        const potentialStudentsImpacted = completedCalls * 1.2; // Multiplier effect
        const learningHoursProvided = Math.round(parseInt(metrics.total_minutes) / 60 * 100) / 100;
        const livesPositivelyImpacted = parseInt(metrics.students_impacted);
        
        // Get recent trend (last 7 days vs previous 7 days)
        const trendQuery = `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'completed' AND scheduled_time >= NOW() - INTERVAL '7 days') as recent_7d_completed,
                COUNT(*) FILTER (WHERE status = 'completed' AND scheduled_time >= NOW() - INTERVAL '14 days' AND scheduled_time < NOW() - INTERVAL '7 days') as previous_7d_completed,
                COUNT(*) FILTER (WHERE status IN ('canceled', 'cancelled', 'missed') AND scheduled_time >= NOW() - INTERVAL '7 days') as recent_7d_issues,
                COUNT(*) FILTER (WHERE status IN ('canceled', 'cancelled', 'missed') AND scheduled_time >= NOW() - INTERVAL '14 days' AND scheduled_time < NOW() - INTERVAL '7 days') as previous_7d_issues
            FROM meetings 
            WHERE volunteer_id = $1
        `;
        
        const { rows: trendRows } = await pool.query(trendQuery, [volunteerId]);
        const trend = trendRows[0];
        
        let performanceTrend = 'stable';
        if (parseInt(trend.recent_7d_completed) > parseInt(trend.previous_7d_completed)) {
            performanceTrend = 'improving';
        } else if (parseInt(trend.recent_7d_completed) < parseInt(trend.previous_7d_completed) || 
                   parseInt(trend.recent_7d_issues) > parseInt(trend.previous_7d_issues)) {
            performanceTrend = 'declining';
        }
        
        // Response data
        res.json({
            performance: {
                // Core metrics
                completedCalls,
                cancelledCalls,
                missedCalls,
                totalScheduled,
                successRate,
                cancelledRate,
                missedRate,
                
                // Reputation and tier
                reputationScore,
                performanceTier,
                tierColor,
                tierIcon,
                performanceTrend,
                
                // Warning system
                warningStatus,
                warningMessage,
                isRestricted,
                
                // Impact metrics for motivation
                learningHoursProvided,
                studentsImpacted: livesPositivelyImpacted,
                potentialStudentsImpacted: Math.round(potentialStudentsImpacted),
                
                // Recent activity
                recentCompleted,
                recentCancelled,
                recentMissed,
                
                // Psychological triggers
                impactMessages: {
                    positive: [
                        `You've positively impacted ${livesPositivelyImpacted} students' English learning journey`,
                        `Your ${completedCalls} completed calls have provided ${learningHoursProvided} hours of valuable learning`,
                        `Students depend on your commitment - you're making a real difference!`
                    ],
                    improvement: [
                        `Each cancelled call disappoints a student who was looking forward to learning`,
                        `Missing calls breaks trust and disrupts students' learning momentum`,
                        `Your reliability directly affects students' confidence and progress`
                    ]
                }
            }
        });
        
        console.log(`Performance data calculated for volunteer ${volunteerId}:`, {
            reputationScore,
            performanceTier,
            warningStatus,
            isRestricted,
            completedCalls,
            cancelledCalls,
            missedCalls
        });
        
    } catch (error) {
        console.error('Error fetching volunteer performance:', error);
        res.status(500).json({ error: 'Failed to load performance data' });
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
            SELECT s.id, s.full_name, s.admission_number,
                   s.age, s.gender, s.bio, s.story,
                   s.photo_url, s.gallery,
                   s.is_available
            FROM students s
            WHERE s.is_available = true
            AND s.id NOT IN (
                SELECT DISTINCT m.student_id
                FROM meetings m
                WHERE DATE(m.scheduled_time) = $1
                AND m.status IN ('scheduled', 'in_progress')
            )
            ORDER BY s.full_name;
        `;

        const unavailableQuery = `
            SELECT s.id, s.full_name, s.admission_number,
                   s.age, s.gender, s.bio, s.story,
                   s.photo_url, s.gallery,
                   false as is_available,
                   m.volunteer_id as meeting_volunteer_id, m.scheduled_time as meeting_time,
                   m.id as meeting_id
            FROM students s
            JOIN meetings m ON s.id = m.student_id
            WHERE DATE(m.scheduled_time) = $1
            AND m.status IN ('scheduled', 'in_progress')
            ORDER BY s.full_name;
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
            const interests = 'English conversation practice';

            // Get the first letter of the student's name for avatar fallback
            const initial = student.full_name ? student.full_name.charAt(0).toUpperCase() : '?';

            // Gallery is already an array in students table
            let galleryImages = student.gallery || [];

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
                location: 'Kenya', // Default location for students
                english_level: 'Beginner', // Default level
                learning_goals: 'Improve English conversation skills',
                preferred_topics: 'General conversation',
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

        // Check if id is numeric or admission number format
        const isNumeric = /^\d+$/.test(id);

        // Get student from students table with all profile data
        // Support numeric ID (students.id or users.id via user_id) and admission number
        const query = isNumeric ? `
            SELECT s.id, s.user_id, s.full_name, s.admission_number,
                   s.age, s.gender, s.photo_url,
                   s.bio, s.story, s.is_available,
                   s.gallery
            FROM students s
            WHERE s.id = $1 OR s.user_id = $1
            LIMIT 1;
        ` : `
            SELECT s.id, s.user_id, s.full_name, s.admission_number,
                   s.age, s.gender, s.photo_url,
                   s.bio, s.story, s.is_available,
                   s.gallery
            FROM students s
            WHERE s.admission_number = $1;
        `;

        const { rows } = await pool.query(query, [id]);
        const student = rows[0];
        
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        // Gallery is already an array in students table
        const placeholderImage = PLACEHOLDER_LOCAL;
        let galleryImages = student.gallery || [];
        
        // Use actual gallery images if available, otherwise use profile image or placeholder
        const gallery = galleryImages.length > 0 
            ? galleryImages.map((g) => sanitizeImageUrl(g))
            : [sanitizeImageUrl(student.photo_url) || placeholderImage];
        
        // Format student data with placeholders for missing values
        res.json({
            student: {
                id: student.id,
                userId: student.user_id,
                name: student.full_name || 'Student Name Not Available',
                profileImage: sanitizeImageUrl(student.photo_url) || placeholderImage,
                interests: 'English conversation practice', // Default value
                bio: student.bio || 'No biography available for this student.',
                story: student.story || 'No story available.',
                age: student.age || 'Age not specified',
                gender: student.gender || 'Not specified',
                admissionNumber: student.admission_number || 'Not available',
                location: 'Kenya', // Default location
                gallery: gallery,
                isAvailable: student.is_available !== false, // Default to true if not specified
                englishLevel: 'Beginner', // Default level
                learningGoals: 'Improve English conversation skills', // Default goals
                preferredTopics: 'General conversation' // Default topics
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
        
        // Check if student exists - check users table first, then students table
        let student = null;
        let actualStudentId = studentId;

        // First, try to find in users table with role='student'
        // Note: is_available lives on the students table, not users
        const userResult = await pool.query(
            'SELECT u.id, u.full_name, s.is_available FROM users u LEFT JOIN students s ON s.user_id = u.id WHERE u.id = $1 AND u.role = $2',
            [studentId, 'student']
        );

        if (userResult.rows.length > 0) {
            student = userResult.rows[0];
        } else {
            // If not found in users, the studentId might be from students table
            // Look up the student and get their user_id
            console.log('[Volunteer] Student not in users table, checking students table for ID:', studentId);
            const studentsResult = await pool.query(
                'SELECT id, user_id, full_name, is_available FROM students WHERE id = $1',
                [studentId]
            );

            if (studentsResult.rows.length > 0) {
                const studentRecord = studentsResult.rows[0];
                if (studentRecord.user_id) {
                    // Use the user_id from students table for meeting creation
                    actualStudentId = studentRecord.user_id;
                    student = {
                        id: actualStudentId,
                        full_name: studentRecord.full_name,
                        is_available: studentRecord.is_available
                    };
                    console.log('[Volunteer] Found student via students table:', {
                        studentsTableId: studentId,
                        usersTableId: actualStudentId
                    });
                } else {
                    // Student exists but no linked user - use students.id directly
                    student = {
                        id: studentRecord.id,
                        full_name: studentRecord.full_name,
                        is_available: studentRecord.is_available
                    };
                    actualStudentId = studentRecord.id;
                    console.log('[Volunteer] Using students.id directly (no user_id):', studentId);
                }
            }
        }

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Use actualStudentId for all subsequent database operations
        const effectiveStudentId = actualStudentId;

        // Check if student is available
        if (student.is_available === false) {
            return res.status(400).json({ error: 'Student is not available for meetings' });
        }

        // Check volunteer performance restrictions (exclude admin-cleared meetings)
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
        
        const { rows: conflicts } = await pool.query(conflictQuery, [effectiveStudentId, scheduledTime]);
        
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
        const roomId = `talktime-${volunteerId}-${effectiveStudentId}-${Date.now()}`;

        // scheduledTime already defined above for conflict checking

        // Create meeting in database with parameters expected by the Meeting model
        const meetingData = {
            volunteerId,
            studentId: effectiveStudentId,
            scheduledTime,
            roomId
        };
        
        const meeting = await Meeting.create(meetingData);

        // Format meeting time for notification messages
        const meetingDateObj = new Date(meeting.scheduled_time);
        const dateStr = meetingDateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = meetingDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const volunteerName = req.user.full_name || req.user.fullName || 'A volunteer';
        const studentName = student.full_name || 'Student';

        // Send notifications to both volunteer and student (non-blocking)
        try {
            // Notify volunteer (low priority — they just did it, no red toast needed)
            await notificationService.sendNotification({
                recipient_id: volunteerId,
                recipient_role: 'volunteer',
                title: 'Meeting Scheduled',
                message: `Your meeting with ${studentName} is set for ${dateStr} at ${timeStr}.`,
                type: 'meeting_scheduled',
                priority: 'low',
                metadata: { meeting_id: meeting.id, student_name: studentName, scheduled_time: meeting.scheduled_time }
            }, ['in-app'], {
                persistent: true,
                action_url: '/volunteer/dashboard/upcoming'
            });

            // Notify student
            await notificationService.sendNotification({
                recipient_id: effectiveStudentId,
                recipient_role: 'student',
                title: 'New Meeting Scheduled',
                message: `${volunteerName} scheduled a meeting with you for ${dateStr} at ${timeStr}.`,
                type: 'meeting_scheduled',
                priority: 'high',
                metadata: { meeting_id: meeting.id, volunteer_name: volunteerName, scheduled_time: meeting.scheduled_time }
            }, ['in-app', 'push'], {
                persistent: true,
                action_url: '/student/dashboard'
            });

            // Emit real-time socket event to student
            const io = getIO();
            if (io) {
                io.to(`user_${effectiveStudentId}`).emit('meeting-scheduled', {
                    meeting_id: meeting.id,
                    message: `${volunteerName} scheduled a meeting with you for ${dateStr} at ${timeStr}.`,
                    scheduledTime: meeting.scheduled_time,
                    volunteerName
                });
            }
        } catch (notifErr) {
            console.error('Error sending meeting notifications:', notifErr);
        }

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

/**
 * Get volunteer settings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Volunteer settings
 */
export const getVolunteerSettings = async (req, res) => {
    console.log('getVolunteerSettings called for user:', req.user);
    try {
        const volunteerId = req.user.id;

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
};

/**
 * Update volunteer settings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Updated volunteer settings
 */
export const updateVolunteerSettings = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const updates = req.body;

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
};
