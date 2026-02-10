import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import pool from '../../../config/database.js';
import configService from '../../../services/configService.js';
import { capitalizeName } from '../../../utils/nameUtils.js';
import { generateAccessToken } from '../../../utils/jwt.js';

dotenv.config();

// Get the admin secret codes from environment variables
const DEFAULT_ADMIN_SECRET_CODE = process.env.ADMIN_SECRET_CODE || '123456';
let ADMIN_SECRET_CODES = [];

// Parse the ADMIN_SECRET_CODES array from environment if available
try {
    if (process.env.ADMIN_SECRET_CODES) {
        ADMIN_SECRET_CODES = JSON.parse(process.env.ADMIN_SECRET_CODES);
        console.log(`Loaded ${ADMIN_SECRET_CODES.length} admin secret codes from environment`);
    }
} catch (error) {
    console.error('Error parsing ADMIN_SECRET_CODES from environment:', error);
}

/**
 * Admin signup controller
 * Handles admin registration with secret code verification
 */
export const signup = async (req, res) => {
    try {
        const { fullname, email, password, secret_code } = req.body;

        // Validate required fields
        if (!fullname || !email || !password || !secret_code) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Verify secret code against the array of codes or default code
        const isValidCode = secret_code === DEFAULT_ADMIN_SECRET_CODE || 
                           ADMIN_SECRET_CODES.includes(secret_code);
                           
        if (!isValidCode) {
            return res.status(403).json({ error: 'Invalid administrator secret code' });
        }

        // Check if user with this email already exists
        const existingUserQuery = 'SELECT id, email FROM users WHERE email = $1';
        const existingUser = await pool.query(existingUserQuery, [email]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create admin user using actual database schema
        // For admin users, username can be email or a unique identifier
        const username = email.split('@')[0] + '_admin'; // Create unique username from email
        const createAdminQuery = `
            INSERT INTO users (username, full_name, email, password_hash, role, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id, username, full_name, email, role, created_at
        `;
        const newAdminResult = await pool.query(createAdminQuery, [username, fullname, email, hashedPassword, 'admin']);
        const newAdmin = newAdminResult.rows[0];

        // Return success without sensitive data
        res.status(201).json({
            success: true,
            message: 'Admin account created successfully',
            user: {
                id: newAdmin.id,
                username: newAdmin.username,
                full_name: newAdmin.full_name,
                email: newAdmin.email,
                role: newAdmin.role
            }
        });

    } catch (error) {
        console.error('Admin signup error:', error);
        res.status(500).json({ error: 'Server error during admin signup' });
    }
};

/**
 * Admin login controller
 * Handles admin authentication and jwt_auth creation
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user by email using actual database schema
        const userQuery = 'SELECT id, full_name, email, password_hash, role FROM users WHERE email = $1';
        const userResult = await pool.query(userQuery, [email]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const user = userResult.rows[0];

        // Verify user is an admin
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied: Not an administrator' });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Clear any existing role-specific jwt_auth cookies to ensure complete isolation
        res.clearCookie('talktime.volunteer.sid', { 
            path: '/', 
            httpOnly: true, 
            sameSite: 'lax',
            domain: undefined // Ensure it clears for current domain
        });
        res.clearCookie('talktime.student.sid', { 
            path: '/', 
            httpOnly: true, 
            sameSite: 'lax',
            domain: undefined // Ensure it clears for current domain
        });
        res.clearCookie('talktime.default.sid', { 
            path: '/', 
            httpOnly: true, 
            sameSite: 'lax',
            domain: undefined // Clear any default jwt_auth
        });
        console.log('🧹 Cleared all conflicting jwt_auth cookies for admin login');

        // Generate JWT token for admin using shared utility (includes audience/issuer)
        const token = generateAccessToken({
            id: user.id,
            fullName: user.full_name,
            email: user.email,
            role: user.role,
            adminId: user.id,
            permissions: ['all']
        });

        // Return success with token
        res.status(200).json({
            success: true,
            message: 'Admin login successful',
            token,
            user: {
                id: user.id,
                name: user.full_name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Server error during admin login' });
    }
};

/**
 * Admin logout controller
 * Destroys the jwt_auth
 */
export const logout = (req, res) => {
    req.jwt_auth.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ success: true, message: 'Logged out successfully' });
    });
};

/**
 * Get current admin user
 * Returns the current authenticated admin user
 */
export const getCurrentAdmin = (req, res) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(401).json({ error: 'Not authenticated as admin' });
    }
    
    res.status(200).json({
        success: true,
        user: req.user
    });
};

/**
 * Check if admin secret code exists in .env
 * Used during system initialization
 */
export const checkSecretCodeExists = () => {
    if (!process.env.ADMIN_SECRET_CODE) {
        console.warn('WARNING: ADMIN_SECRET_CODE not found in environment variables. Using default code for development.');
        return false;
    }
    return true;
};

/**
 * Check if admin secret code exists in the allowed codes
 * @param {String} code - The code to check
 * @returns {Boolean} Whether the code exists
 */
export const isValidSecretCode = (code) => {
    return code === DEFAULT_ADMIN_SECRET_CODE || ADMIN_SECRET_CODES.includes(code);
};

/**
 * Generate a new admin secret code
 * Used during system initialization if no code exists
 */
export const generateSecretCode = () => {
    // Generate a random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    return code;
};

/**
 * Reset or delete meetings for a student
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Success message or error
 */
export const resetStudentMeetings = async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body;
        
        if (!id || isNaN(id)) {
            return res.status(400).json({ error: 'Valid student ID is required' });
        }
        
        if (!action || !['delete_past_meetings', 'delete_all_meetings'].includes(action)) {
            return res.status(400).json({ error: 'Valid action is required (delete_past_meetings or delete_all_meetings)' });
        }
        
        // Check if student exists
        const checkStudentQuery = 'SELECT id FROM users WHERE id = $1 AND role = \'student\'';
        const studentResult = await pool.query(checkStudentQuery, [Number(id)]);
        
        if (studentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        let query;
        let result;
        
        if (action === 'delete_past_meetings') {
            const now = new Date();
            query = `
                DELETE FROM meetings 
                WHERE student_id = $1 
                AND (scheduled_time < $2 OR status = 'canceled')
                RETURNING id
            `;
            result = await pool.query(query, [Number(id), now]);
            
            console.log(`Deleted ${result.rows.length} past or cancelled meetings for student ${id}`);
        } else if (action === 'delete_all_meetings') {
            query = 'DELETE FROM meetings WHERE student_id = $1 RETURNING id';
            result = await pool.query(query, [Number(id)]);
            
            console.log(`Deleted all ${result.rows.length} meetings for student ${id}`);
        }
        
        res.json({
            success: true,
            message: `Successfully deleted ${result.rows.length} meetings for student ${id}`,
            deletedCount: result.rows.length
        });
        
    } catch (error) {
        console.error(`Error resetting meetings for student with ID ${req.params.id}:`, error);
        res.status(500).json({ error: 'Failed to reset student meetings', details: error.message });
    }
};

/**
 * Get all meetings for admin overview
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} All meetings with reschedule information
 */
export const getAllMeetings = async (req, res) => {
    try {
        // Query to get all meetings with student and volunteer information
        const query = `
            SELECT 
                m.id,
                m.room_id,
                m.scheduled_time,
                m.original_scheduled_time,
                m.status,
                m.is_rescheduled,
                m.reschedule_count,
                m.last_rescheduled_at,
                m.created_at,
                m.updated_at,
                -- Student information
                su.full_name as student_name,
                su.username as student_admission,
                -- Volunteer information
                v.full_name as volunteer_name,
                v.email as volunteer_email,
                -- Rescheduled by information
                rb.full_name as rescheduled_by_name
            FROM meetings m
            LEFT JOIN users su ON m.student_id = su.id AND su.role = 'student'
            LEFT JOIN users v ON m.volunteer_id = v.id
            LEFT JOIN users rb ON m.rescheduled_by = rb.id
            ORDER BY m.scheduled_time DESC
        `;
        
        const result = await pool.query(query);
        
        // Format the meetings data
        const meetings = result.rows.map(meeting => ({
            id: meeting.id,
            roomId: meeting.room_id,
            scheduled_time: meeting.scheduled_time,
            original_scheduled_time: meeting.original_scheduled_time,
            status: meeting.status,
            is_rescheduled: meeting.is_rescheduled,
            reschedule_count: meeting.reschedule_count,
            last_rescheduled_at: meeting.last_rescheduled_at,
            created_at: meeting.created_at,
            updated_at: meeting.updated_at,
            student_name: meeting.student_name,
            student_admission: meeting.student_admission,
            volunteer_name: meeting.volunteer_name,
            volunteer_email: meeting.volunteer_email,
            rescheduled_by_name: meeting.rescheduled_by_name
        }));
        
        res.json({
            success: true,
            meetings,
            total: meetings.length,
            message: 'Meetings retrieved successfully'
        });
        
    } catch (error) {
        console.error('Error fetching meetings for admin:', error);
        res.status(500).json({ 
            error: 'Failed to fetch meetings', 
            details: error.message 
        });
    }
};

/**
 * Get all students for admin management
 */
export const getAllStudents = async (req, res) => {
    try {
        const query = `
            SELECT
                id,
                full_name as "fullName",
                admission_number as "admissionNumber",
                age,
                gender,
                bio,
                story,
                photo_url as "profilePictureUrl",
                gallery,
                is_available as "isAvailable",
                created_at as "createdAt"
            FROM students
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query);

        res.json({
            success: true,
            students: result.rows,
            total: result.rows.length
        });

    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({
            error: 'Failed to fetch students',
            details: error.message
        });
    }
};

/**
 * Create a new student
 */
export const createStudent = async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            admissionNumber,
            age,
            gender,
            bio,
            story,
            studentStory,
            profilePictureUrl,
            photoUrl,
            galleryUrls,
            gallery,
            location,
            interests,
            englishLevel,
            learningGoals,
            preferredTopics
        } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !admissionNumber) {
            return res.status(400).json({
                error: 'First name, last name, and admission number are required'
            });
        }

        // Capitalize the name properly
        const fullName = capitalizeName(`${firstName} ${lastName}`);

        // Check if admission number already exists in users table
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE LOWER(username) LIKE LOWER($1) AND role = $2',
            [`${admissionNumber}%`, 'student']
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                error: 'A student with this admission number already exists'
            });
        }

        // Also check students table
        const existingStudent = await pool.query(
            'SELECT id FROM students WHERE LOWER(admission_number) LIKE LOWER($1)',
            [`${admissionNumber}%`]
        );

        if (existingStudent.rows.length > 0) {
            return res.status(400).json({
                error: 'A student with this admission number already exists'
            });
        }

        // Process gallery URLs - handle both string and array formats
        let galleryImages = [];
        if (gallery || galleryUrls) {
            const galleryData = gallery || galleryUrls;
            if (typeof galleryData === 'string') {
                // Split by newlines and filter out empty lines
                galleryImages = galleryData.split('\n').map(url => url.trim()).filter(Boolean);
            } else if (Array.isArray(galleryData)) {
                galleryImages = galleryData.filter(Boolean);
            }
        }

        // Generate username from admission number
        const username = `${admissionNumber}-${fullName.toLowerCase().replace(/\s+/g, '-')}`;
        const email = `${fullName.toLowerCase().replace(/\s+/g, '.')}@talktime.local`;

        // Step 1: Create user account in users table (required for login)
        const userQuery = `
            INSERT INTO users (
                username,
                full_name,
                email,
                password_hash,
                role,
                age,
                gender,
                is_approved,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
            RETURNING id
        `;

        const userResult = await pool.query(userQuery, [
            username,                    // $1 - username (ADM0001-john-doe)
            fullName,                    // $2 - full_name
            email,                       // $3 - email (placeholder)
            'student-no-password',       // $4 - password_hash (students login by name, not password)
            'student',                   // $5 - role
            age || null,                 // $6 - age
            gender || null,              // $7 - gender
            true                         // $8 - is_approved
        ]);

        const userId = userResult.rows[0].id;

        // Step 2: Create student profile in students table
        const studentQuery = `
            INSERT INTO students (
                full_name,
                admission_number,
                age,
                gender,
                bio,
                story,
                photo_url,
                gallery,
                is_available,
                user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING
                id,
                full_name as "fullName",
                admission_number as "admissionNumber",
                age,
                gender,
                photo_url as "profilePictureUrl",
                bio,
                story,
                gallery,
                is_available as "isAvailable",
                created_at as "createdAt",
                user_id as "userId"
        `;

        const result = await pool.query(studentQuery, [
            fullName,                                           // $1
            username,                                           // $2 - admission_number (same as username)
            age || null,                                       // $3
            gender || null,                                    // $4
            bio || null,                                       // $5
            story || studentStory || null,                     // $6
            profilePictureUrl || photoUrl || null,            // $7 - photo_url
            galleryImages.length > 0 ? galleryImages : null,  // $8 - gallery array
            true,                                              // $9 - is_available
            userId                                             // $10 - user_id (link to users table)
        ]);

        res.status(201).json({
            success: true,
            student: result.rows[0],
            message: 'Student created successfully'
        });

    } catch (error) {
        console.error('Error creating student:', error);
        res.status(500).json({
            error: 'Failed to create student',
            details: error.message
        });
    }
};

/**
 * Get a single student by ID
 */
export const getStudent = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate student ID
        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'Valid student ID is required' });
        }

        // Get student from students table
        const query = `
            SELECT
                id,
                full_name as "fullName",
                admission_number as "admissionNumber",
                age,
                gender,
                bio,
                story,
                photo_url as "profilePictureUrl",
                gallery,
                is_available as "isAvailable",
                created_at as "createdAt"
            FROM students
            WHERE id = $1
        `;

        const result = await pool.query(query, [Number(id)]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const student = result.rows[0];

        // Also add photoUrl alias for profile image (frontend compatibility)
        student.photoUrl = student.profilePictureUrl;

        res.json({
            success: true,
            student: student
        });

    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({
            error: 'Failed to fetch student',
            details: error.message
        });
    }
};

/**
 * Update an existing student
 */
export const updateStudent = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            firstName, 
            lastName, 
            admissionNumber, 
            age, 
            gender, 
            phone, 
            schoolName,
            bio,
            story,
            studentStory,
            profilePictureUrl,
            photoUrl,
            galleryUrls,
            gallery,
            location,
            interests,
            englishLevel,
            learningGoals,
            preferredTopics
        } = req.body;
        
        // Validate student ID
        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'Valid student ID is required' });
        }
        
        // Check if student exists
        const existingStudent = await pool.query(
            'SELECT id FROM students WHERE id = $1',
            [Number(id)]
        );
        
        if (existingStudent.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        const fullName = firstName && lastName ? `${firstName} ${lastName}` : null;
        
        // Process gallery URLs - handle both string and array formats
        let galleryImages = [];
        if (gallery || galleryUrls) {
            const galleryData = gallery || galleryUrls;
            if (typeof galleryData === 'string') {
                // Split by newlines and filter out empty lines
                galleryImages = galleryData.split('\n').map(url => url.trim()).filter(Boolean);
            } else if (Array.isArray(galleryData)) {
                galleryImages = galleryData.filter(Boolean);
            }
        }
        
        // Build dynamic update query including all profile fields
        const updates = [];
        const values = [];
        let paramCount = 1;
        
        if (fullName) {
            updates.push(`full_name = $${paramCount}`);
            values.push(fullName);
            paramCount++;
        }
        
        if (admissionNumber) {
            updates.push(`admission_number = $${paramCount}`);
            values.push(admissionNumber);
            paramCount++;
        }

        if (age !== undefined) {
            updates.push(`age = $${paramCount}`);
            values.push(age || null);
            paramCount++;
        }

        if (gender !== undefined) {
            updates.push(`gender = $${paramCount}`);
            values.push(gender || null);
            paramCount++;
        }

        // Add profile fields supported by students table
        if (bio !== undefined) {
            updates.push(`bio = $${paramCount}`);
            values.push(bio || null);
            paramCount++;
        }

        if (story !== undefined || studentStory !== undefined) {
            updates.push(`story = $${paramCount}`);
            values.push(story || studentStory || null);
            paramCount++;
        }

        if (profilePictureUrl !== undefined || photoUrl !== undefined) {
            updates.push(`photo_url = $${paramCount}`);
            values.push(profilePictureUrl || photoUrl || null);
            paramCount++;
        }

        // Handle gallery images if provided
        if (galleryImages.length > 0 || (gallery !== undefined || galleryUrls !== undefined)) {
            updates.push(`gallery = $${paramCount}`);
            values.push(galleryImages.length > 0 ? galleryImages : null);
            paramCount++;
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        
        values.push(Number(id));
        
        const query = `
            UPDATE students
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING
                id,
                full_name as "fullName",
                admission_number as "admissionNumber",
                age,
                gender,
                bio,
                story,
                photo_url as "profilePictureUrl",
                gallery,
                is_available as "isAvailable",
                created_at as "createdAt"
        `;
        
        const result = await pool.query(query, values);
        
        res.json({
            success: true,
            student: result.rows[0],
            message: 'Student updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ 
            error: 'Failed to update student', 
            details: error.message 
        });
    }
};

/**
 * Delete a student
 */
export const deleteStudent = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate student ID
        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'Valid student ID is required' });
        }
        
        // Check if student exists
        const existingStudent = await pool.query(
            'SELECT id, full_name FROM students WHERE id = $1',
            [Number(id)]
        );

        if (existingStudent.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Delete the student
        await pool.query(
            'DELETE FROM students WHERE id = $1',
            [Number(id)]
        );
        
        res.json({
            success: true,
            message: `Student ${existingStudent.rows[0].full_name} deleted successfully`
        });
        
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ 
            error: 'Failed to delete student', 
            details: error.message 
        });
    }
};

/**
 * Delete all students
 */
export const deleteAllStudents = async (req, res) => {
    try {
        // Get count of students before deletion
        const countResult = await pool.query(
            'SELECT COUNT(*) as count FROM students'
        );

        const studentCount = parseInt(countResult.rows[0].count);

        if (studentCount === 0) {
            return res.json({
                success: true,
                message: 'No students found to delete',
                deletedCount: 0
            });
        }

        // Delete all students
        await pool.query('DELETE FROM students');

        res.json({
            success: true,
            message: `Successfully deleted ${studentCount} students`,
            deletedCount: studentCount
        });

    } catch (error) {
        console.error('Error deleting all students:', error);
        res.status(500).json({
            error: 'Failed to delete students',
            details: error.message
        });
    }
};

// ============================================
// Volunteer Management
// ============================================

/**
 * Get all volunteers with performance metrics
 * Shows restriction status so admin can identify who needs attention
 */
export const getAllVolunteers = async (req, res) => {
    try {
        const query = `
            SELECT
                u.id,
                u.full_name,
                u.email,
                u.volunteer_type,
                u.profile_image,
                u.created_at,
                COUNT(m.id) FILTER (WHERE m.status = 'completed' AND m.scheduled_time < NOW() AND (m.cleared_by_admin IS NULL OR m.cleared_by_admin = FALSE)) as completed_calls,
                COUNT(m.id) FILTER (WHERE m.status IN ('canceled', 'cancelled') AND m.scheduled_time < NOW() AND (m.cleared_by_admin IS NULL OR m.cleared_by_admin = FALSE)) as cancelled_calls,
                COUNT(m.id) FILTER (WHERE m.status = 'missed' AND m.scheduled_time < NOW() AND (m.cleared_by_admin IS NULL OR m.cleared_by_admin = FALSE)) as missed_calls,
                COUNT(m.id) FILTER (WHERE m.status IN ('completed', 'canceled', 'cancelled', 'missed') AND m.scheduled_time < NOW() AND (m.cleared_by_admin IS NULL OR m.cleared_by_admin = FALSE)) as total_scheduled,
                COUNT(m.id) FILTER (WHERE m.cleared_by_admin = TRUE) as cleared_meetings
            FROM users u
            LEFT JOIN meetings m ON u.id = m.volunteer_id
            WHERE u.role = 'volunteer'
            GROUP BY u.id
            ORDER BY u.full_name ASC
        `;

        const result = await pool.query(query);

        const volunteers = result.rows.map(v => {
            const completed = parseInt(v.completed_calls);
            const cancelled = parseInt(v.cancelled_calls);
            const missed = parseInt(v.missed_calls);
            const total = parseInt(v.total_scheduled);

            const cancelledRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;
            const missedRate = total > 0 ? Math.round((missed / total) * 100) : 0;
            const reputationScore = Math.max(0, Math.round(100 - (cancelledRate * 1.5) - (missedRate * 2)));
            const isRestricted = total > 0 && (cancelledRate >= 40 || missedRate >= 30 || reputationScore < 30);

            return {
                id: v.id,
                fullName: v.full_name,
                email: v.email,
                volunteerType: v.volunteer_type,
                profileImage: v.profile_image,
                createdAt: v.created_at,
                completedCalls: completed,
                cancelledCalls: cancelled,
                missedCalls: missed,
                totalScheduled: total,
                cancelledRate,
                missedRate,
                reputationScore,
                isRestricted,
                clearedMeetings: parseInt(v.cleared_meetings)
            };
        });

        res.json({
            success: true,
            volunteers,
            total: volunteers.length,
            restricted: volunteers.filter(v => v.isRestricted).length
        });

    } catch (error) {
        console.error('Error fetching volunteers:', error);
        res.status(500).json({
            error: 'Failed to fetch volunteers',
            details: error.message
        });
    }
};

/**
 * Get detailed performance for a single volunteer
 */
export const getVolunteerPerformance = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'Valid volunteer ID is required' });
        }

        // Verify volunteer exists
        const userResult = await pool.query(
            'SELECT id, full_name, email, volunteer_type, profile_image, created_at FROM users WHERE id = $1 AND role = $2',
            [Number(id), 'volunteer']
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }

        const volunteer = userResult.rows[0];

        // Get performance metrics (excluding cleared meetings)
        const performanceResult = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
                COUNT(*) FILTER (WHERE status IN ('canceled', 'cancelled')) as cancelled_calls,
                COUNT(*) FILTER (WHERE status = 'missed') as missed_calls,
                COUNT(*) FILTER (WHERE status IN ('completed', 'canceled', 'cancelled', 'missed')) as total_scheduled,
                COUNT(DISTINCT student_id) FILTER (WHERE status = 'completed') as students_impacted
            FROM meetings
            WHERE volunteer_id = $1 AND scheduled_time < NOW()
            AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)
        `, [Number(id)]);

        const metrics = performanceResult.rows[0];
        const completed = parseInt(metrics.completed_calls);
        const cancelled = parseInt(metrics.cancelled_calls);
        const missed = parseInt(metrics.missed_calls);
        const total = parseInt(metrics.total_scheduled);

        const cancelledRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;
        const missedRate = total > 0 ? Math.round((missed / total) * 100) : 0;
        const reputationScore = Math.max(0, Math.round(100 - (cancelledRate * 1.5) - (missedRate * 2)));
        const isRestricted = total > 0 && (cancelledRate >= 40 || missedRate >= 30 || reputationScore < 30);

        // Get meetings that could be cleared (canceled/missed, not already cleared)
        const clearableResult = await pool.query(`
            SELECT id, status, scheduled_time, student_id,
                   (SELECT full_name FROM users WHERE id = m.student_id) as student_name
            FROM meetings m
            WHERE volunteer_id = $1
            AND status IN ('canceled', 'cancelled', 'missed')
            AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)
            AND scheduled_time < NOW()
            ORDER BY scheduled_time DESC
        `, [Number(id)]);

        // Get already cleared meetings
        const clearedResult = await pool.query(`
            SELECT id, status, scheduled_time, cleared_by_admin_at,
                   (SELECT full_name FROM users WHERE id = m.student_id) as student_name
            FROM meetings m
            WHERE volunteer_id = $1 AND cleared_by_admin = TRUE
            ORDER BY cleared_by_admin_at DESC
        `, [Number(id)]);

        res.json({
            success: true,
            volunteer: {
                id: volunteer.id,
                fullName: volunteer.full_name,
                email: volunteer.email,
                volunteerType: volunteer.volunteer_type,
                profileImage: volunteer.profile_image,
                createdAt: volunteer.created_at
            },
            performance: {
                completedCalls: completed,
                cancelledCalls: cancelled,
                missedCalls: missed,
                totalScheduled: total,
                cancelledRate,
                missedRate,
                reputationScore,
                isRestricted,
                studentsImpacted: parseInt(metrics.students_impacted)
            },
            clearableMeetings: clearableResult.rows.map(m => ({
                id: m.id,
                status: m.status,
                scheduledTime: m.scheduled_time,
                studentName: m.student_name
            })),
            clearedMeetings: clearedResult.rows.map(m => ({
                id: m.id,
                status: m.status,
                scheduledTime: m.scheduled_time,
                clearedAt: m.cleared_by_admin_at,
                studentName: m.student_name
            }))
        });

    } catch (error) {
        console.error('Error fetching volunteer performance:', error);
        res.status(500).json({
            error: 'Failed to fetch volunteer performance',
            details: error.message
        });
    }
};

/**
 * Clear a volunteer's bad record
 * Marks canceled/missed meetings as cleared so they no longer count toward restriction
 * Original status is preserved — only the cleared_by_admin flag changes
 */
export const clearVolunteerRecord = async (req, res) => {
    try {
        const { id } = req.params;
        const { meetingIds } = req.body;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'Valid volunteer ID is required' });
        }

        // Verify volunteer exists
        const volunteerResult = await pool.query(
            'SELECT id, full_name FROM users WHERE id = $1 AND role = $2',
            [Number(id), 'volunteer']
        );

        if (volunteerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }

        let result;

        if (meetingIds && Array.isArray(meetingIds) && meetingIds.length > 0) {
            // Clear specific meetings
            result = await pool.query(`
                UPDATE meetings
                SET cleared_by_admin = TRUE, cleared_by_admin_at = NOW()
                WHERE id = ANY($1::int[])
                AND volunteer_id = $2
                AND status IN ('canceled', 'cancelled', 'missed')
                AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)
                RETURNING id
            `, [meetingIds, Number(id)]);
        } else {
            // Clear all bad meetings for this volunteer
            result = await pool.query(`
                UPDATE meetings
                SET cleared_by_admin = TRUE, cleared_by_admin_at = NOW()
                WHERE volunteer_id = $1
                AND status IN ('canceled', 'cancelled', 'missed')
                AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)
                AND scheduled_time < NOW()
                RETURNING id
            `, [Number(id)]);
        }

        res.json({
            success: true,
            message: `Cleared ${result.rows.length} meetings for ${volunteerResult.rows[0].full_name}`,
            clearedCount: result.rows.length
        });

    } catch (error) {
        console.error('Error clearing volunteer record:', error);
        res.status(500).json({
            error: 'Failed to clear volunteer record',
            details: error.message
        });
    }
};

// ============================================
// Volunteer Detail & Management
// ============================================

/**
 * Get full volunteer details including profile, meetings, and students worked with
 */
export const getVolunteerDetails = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'Valid volunteer ID is required' });
        }

        // Get full profile
        const userResult = await pool.query(
            `SELECT id, username, full_name, email, role, volunteer_type, age, gender, phone,
                    timezone, school_name, is_under_18, is_approved, parent_approved,
                    profile_image, created_at, updated_at
             FROM users WHERE id = $1 AND role = 'volunteer'`,
            [Number(id)]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }

        const volunteer = userResult.rows[0];

        // Get performance metrics (excluding cleared meetings)
        const performanceResult = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
                COUNT(*) FILTER (WHERE status IN ('canceled', 'cancelled')) as cancelled_calls,
                COUNT(*) FILTER (WHERE status = 'missed') as missed_calls,
                COUNT(*) FILTER (WHERE status IN ('completed', 'canceled', 'cancelled', 'missed')) as total_scheduled,
                COUNT(DISTINCT student_id) FILTER (WHERE status = 'completed') as students_impacted
            FROM meetings
            WHERE volunteer_id = $1 AND scheduled_time < NOW()
            AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)
        `, [Number(id)]);

        const metrics = performanceResult.rows[0];
        const completed = parseInt(metrics.completed_calls);
        const cancelled = parseInt(metrics.cancelled_calls);
        const missed = parseInt(metrics.missed_calls);
        const total = parseInt(metrics.total_scheduled);
        const cancelledRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;
        const missedRate = total > 0 ? Math.round((missed / total) * 100) : 0;
        const reputationScore = Math.max(0, Math.round(100 - (cancelledRate * 1.5) - (missedRate * 2)));
        const isRestricted = total > 0 && (cancelledRate >= 40 || missedRate >= 30 || reputationScore < 30);

        // Get meeting history (last 100)
        const meetingsResult = await pool.query(`
            SELECT m.id, m.scheduled_time, m.status, m.is_instant, m.reschedule_count,
                   m.cleared_by_admin, m.created_at,
                   u.full_name as student_name
            FROM meetings m
            LEFT JOIN users u ON m.student_id = u.id
            WHERE m.volunteer_id = $1
            ORDER BY m.scheduled_time DESC
            LIMIT 100
        `, [Number(id)]);

        // Get students worked with (distinct)
        const studentsResult = await pool.query(`
            SELECT u.id, u.full_name,
                   COUNT(m.id) as meeting_count,
                   MAX(m.scheduled_time) as last_meeting
            FROM meetings m
            JOIN users u ON m.student_id = u.id
            WHERE m.volunteer_id = $1
            GROUP BY u.id, u.full_name
            ORDER BY last_meeting DESC
        `, [Number(id)]);

        // Get clearable meetings
        const clearableResult = await pool.query(`
            SELECT id, status, scheduled_time, student_id,
                   (SELECT full_name FROM users WHERE id = m.student_id) as student_name
            FROM meetings m
            WHERE volunteer_id = $1
            AND status IN ('canceled', 'cancelled', 'missed')
            AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)
            AND scheduled_time < NOW()
            ORDER BY scheduled_time DESC
        `, [Number(id)]);

        // Get cleared meetings
        const clearedResult = await pool.query(`
            SELECT id, status, scheduled_time, cleared_by_admin_at,
                   (SELECT full_name FROM users WHERE id = m.student_id) as student_name
            FROM meetings m
            WHERE volunteer_id = $1 AND cleared_by_admin = TRUE
            ORDER BY cleared_by_admin_at DESC
        `, [Number(id)]);

        res.json({
            success: true,
            volunteer: {
                id: volunteer.id,
                username: volunteer.username,
                fullName: volunteer.full_name,
                email: volunteer.email,
                volunteerType: volunteer.volunteer_type,
                age: volunteer.age,
                gender: volunteer.gender,
                phone: volunteer.phone,
                timezone: volunteer.timezone,
                schoolName: volunteer.school_name,
                isUnder18: volunteer.is_under_18,
                isApproved: volunteer.is_approved,
                parentApproved: volunteer.parent_approved,
                profileImage: volunteer.profile_image,
                createdAt: volunteer.created_at,
                updatedAt: volunteer.updated_at
            },
            performance: {
                completedCalls: completed,
                cancelledCalls: cancelled,
                missedCalls: missed,
                totalScheduled: total,
                cancelledRate,
                missedRate,
                reputationScore,
                isRestricted,
                studentsImpacted: parseInt(metrics.students_impacted)
            },
            meetings: meetingsResult.rows.map(m => ({
                id: m.id,
                scheduledTime: m.scheduled_time,
                status: m.status,
                isInstant: m.is_instant,
                rescheduleCount: m.reschedule_count,
                clearedByAdmin: m.cleared_by_admin,
                studentName: m.student_name,
                createdAt: m.created_at
            })),
            studentsWorkedWith: studentsResult.rows.map(s => ({
                id: s.id,
                fullName: s.full_name,
                meetingCount: parseInt(s.meeting_count),
                lastMeeting: s.last_meeting
            })),
            clearableMeetings: clearableResult.rows.map(m => ({
                id: m.id,
                status: m.status,
                scheduledTime: m.scheduled_time,
                studentName: m.student_name
            })),
            clearedMeetings: clearedResult.rows.map(m => ({
                id: m.id,
                status: m.status,
                scheduledTime: m.scheduled_time,
                clearedAt: m.cleared_by_admin_at,
                studentName: m.student_name
            }))
        });

    } catch (error) {
        console.error('Error fetching volunteer details:', error);
        res.status(500).json({
            error: 'Failed to fetch volunteer details',
            details: error.message
        });
    }
};

/**
 * Delete a volunteer account
 * Checks for future scheduled meetings first
 */
export const deleteVolunteer = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'Valid volunteer ID is required' });
        }

        // Verify user exists and is a volunteer
        const userResult = await pool.query(
            'SELECT id, full_name FROM users WHERE id = $1 AND role = $2',
            [Number(id), 'volunteer']
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }

        const volunteerName = userResult.rows[0].full_name;

        // Check for future scheduled or in-progress meetings
        const futureMeetings = await pool.query(`
            SELECT COUNT(*) as count FROM meetings
            WHERE volunteer_id = $1
            AND status IN ('scheduled', 'pending', 'confirmed', 'in_progress', 'active')
            AND scheduled_time > NOW()
        `, [Number(id)]);

        if (parseInt(futureMeetings.rows[0].count) > 0) {
            return res.status(409).json({
                error: `Cannot delete ${volunteerName}: they have ${futureMeetings.rows[0].count} upcoming meeting(s). Cancel or complete them first.`
            });
        }

        // Manually clean up all FK references (live DB lacks ON DELETE CASCADE on some tables)
        const vid = Number(id);

        // Null out rescheduled_by references from any meeting
        await pool.query('UPDATE meetings SET rescheduled_by = NULL WHERE rescheduled_by = $1', [vid]);

        // Delete meetings where this volunteer is volunteer_id or student_id
        await pool.query('DELETE FROM meetings WHERE volunteer_id = $1 OR student_id = $1', [vid]);

        // Delete messages sent by this user (recipient cascade may exist but be safe)
        await pool.query('DELETE FROM messages WHERE sender_id = $1 OR recipient_id = $1', [vid]);

        // Delete notifications
        await pool.query('DELETE FROM notifications WHERE user_id = $1', [vid]);

        // Null out newsletter_campaigns created_by
        await pool.query('UPDATE newsletter_campaigns SET created_by = NULL WHERE created_by = $1', [vid]).catch(() => {});

        // Delete the user (volunteer_settings + activity_log handled by CASCADE/SET NULL)
        await pool.query('DELETE FROM users WHERE id = $1', [vid]);

        res.json({
            success: true,
            message: `Volunteer ${volunteerName} has been deleted successfully`
        });

    } catch (error) {
        console.error('Error deleting volunteer:', error);
        res.status(500).json({
            error: 'Failed to delete volunteer',
            details: error.message
        });
    }
};

/**
 * Get volunteer activity feed
 * Reconstructs activity from meetings, messages, and security_events
 */
export const getVolunteerActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'Valid volunteer ID is required' });
        }

        // Verify volunteer exists
        const userResult = await pool.query(
            'SELECT id FROM users WHERE id = $1 AND role = $2',
            [Number(id), 'volunteer']
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }

        // UNION query across meetings and messages
        const activityResult = await pool.query(`
            (
                SELECT
                    'meeting' as source,
                    m.status as action,
                    json_build_object(
                        'meetingId', m.id,
                        'studentName', u.full_name,
                        'scheduledTime', m.scheduled_time,
                        'isInstant', m.is_instant
                    ) as details,
                    COALESCE(m.updated_at, m.created_at) as created_at
                FROM meetings m
                LEFT JOIN users u ON m.student_id = u.id
                WHERE m.volunteer_id = $1
            )
            UNION ALL
            (
                SELECT
                    'message' as source,
                    'sent' as action,
                    json_build_object(
                        'recipientName', u.full_name,
                        'messageId', msg.id
                    ) as details,
                    msg.created_at
                FROM messages msg
                LEFT JOIN users u ON msg.recipient_id = u.id
                WHERE msg.sender_id = $1
            )
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [Number(id), limit, offset]);

        res.json({
            success: true,
            activity: activityResult.rows,
            count: activityResult.rows.length,
            limit,
            offset
        });

    } catch (error) {
        console.error('Error fetching volunteer activity:', error);
        res.status(500).json({
            error: 'Failed to fetch volunteer activity',
            details: error.message
        });
    }
};

// ============================================
// Analytics (served from monolith)
// ============================================

/**
 * System stats: user counts, meeting counts, completion rate
 */
export const getAnalyticsSystemStats = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM users WHERE role = 'volunteer') as total_volunteers,
                (SELECT COUNT(*) FROM users WHERE role = 'student') as total_students,
                (SELECT COUNT(*) FROM meetings) as total_meetings,
                (SELECT COUNT(*) FROM meetings WHERE status = 'completed') as completed_meetings,
                (SELECT COUNT(*) FROM meetings WHERE status IN ('canceled', 'cancelled')) as cancelled_meetings,
                (SELECT COUNT(*) FROM meetings WHERE status = 'scheduled' AND scheduled_time > NOW()) as scheduled_meetings,
                (SELECT COUNT(*) FROM meetings WHERE status IN ('in_progress', 'active')) as ongoing_meetings,
                (SELECT COUNT(DISTINCT volunteer_id) FROM meetings WHERE scheduled_time::date = CURRENT_DATE) as active_volunteers_today,
                (SELECT COUNT(DISTINCT student_id) FROM meetings WHERE scheduled_time::date = CURRENT_DATE) as students_with_meetings
        `);

        const stats = result.rows[0];
        const totalMeetings = parseInt(stats.total_meetings);
        const completedMeetings = parseInt(stats.completed_meetings);
        const totalStudents = parseInt(stats.total_students);
        const completionRate = totalMeetings > 0 ? Math.round((completedMeetings / totalMeetings) * 100) : 0;
        const averagePerStudent = totalStudents > 0 ? Math.round((totalMeetings / totalStudents) * 10) / 10 : 0;

        res.json({
            success: true,
            stats: {
                totalVolunteers: parseInt(stats.total_volunteers),
                totalStudents,
                totalMeetings,
                completionRate,
                averagePerStudent,
                ongoingMeetings: parseInt(stats.ongoing_meetings),
                activeVolunteersToday: parseInt(stats.active_volunteers_today),
                studentsWithMeetings: parseInt(stats.students_with_meetings),
                meetingStats: {
                    completed: completedMeetings,
                    cancelled: parseInt(stats.cancelled_meetings),
                    scheduled: parseInt(stats.scheduled_meetings)
                }
            }
        });

    } catch (error) {
        console.error('Error fetching system stats:', error);
        res.status(500).json({ error: 'Failed to fetch system statistics', details: error.message });
    }
};

/**
 * Meeting stats grouped by date for charting
 */
export const getAnalyticsMeetingStats = async (req, res) => {
    try {
        const period = req.query.period || 'week';

        let interval, dateFormat;
        switch (period) {
            case 'day':
                interval = '24 hours';
                dateFormat = 'YYYY-MM-DD HH24:00';
                break;
            case 'month':
                interval = '30 days';
                dateFormat = 'YYYY-MM-DD';
                break;
            case 'year':
                interval = '365 days';
                dateFormat = 'YYYY-MM';
                break;
            default: // week
                interval = '7 days';
                dateFormat = 'YYYY-MM-DD';
                break;
        }

        const result = await pool.query(`
            SELECT
                TO_CHAR(scheduled_time, $1) as date,
                COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status IN ('canceled', 'cancelled')) as cancelled
            FROM meetings
            WHERE scheduled_time >= NOW() - $2::interval
            GROUP BY TO_CHAR(scheduled_time, $1)
            ORDER BY date ASC
        `, [dateFormat, interval]);

        res.json({
            success: true,
            period,
            stats: result.rows.map(row => ({
                date: row.date,
                scheduled: parseInt(row.scheduled),
                completed: parseInt(row.completed),
                cancelled: parseInt(row.cancelled)
            }))
        });

    } catch (error) {
        console.error('Error fetching meeting stats:', error);
        res.status(500).json({ error: 'Failed to fetch meeting statistics', details: error.message });
    }
};

/**
 * Top volunteers ranked by completed meetings
 */
export const getAnalyticsTopVolunteers = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);

        const result = await pool.query(`
            SELECT
                u.id, u.full_name, u.email,
                COUNT(m.id) as meeting_count,
                COUNT(m.id) FILTER (WHERE m.status = 'completed') as completed_count
            FROM users u
            LEFT JOIN meetings m ON u.id = m.volunteer_id
            WHERE u.role = 'volunteer'
            GROUP BY u.id, u.full_name, u.email
            ORDER BY completed_count DESC
            LIMIT $1
        `, [limit]);

        res.json({
            success: true,
            volunteers: result.rows.map(row => ({
                id: row.id,
                fullName: row.full_name,
                email: row.email,
                meetingCount: parseInt(row.meeting_count),
                completedCount: parseInt(row.completed_count)
            }))
        });

    } catch (error) {
        console.error('Error fetching top volunteers:', error);
        res.status(500).json({ error: 'Failed to fetch top volunteers', details: error.message });
    }
};

/**
 * Student engagement: meeting counts per student
 */
export const getAnalyticsStudentEngagement = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                u.id, u.full_name, u.username as admission_number,
                COUNT(m.id) as meeting_count,
                MAX(m.scheduled_time) as last_meeting
            FROM users u
            LEFT JOIN meetings m ON u.id = m.student_id
            WHERE u.role = 'student'
            GROUP BY u.id, u.full_name, u.username
            ORDER BY meeting_count DESC
        `);

        res.json({
            success: true,
            students: result.rows.map(row => ({
                id: row.id,
                fullName: row.full_name,
                admissionNumber: row.admission_number,
                meetingCount: parseInt(row.meeting_count),
                lastMeeting: row.last_meeting
            }))
        });

    } catch (error) {
        console.error('Error fetching student engagement:', error);
        res.status(500).json({ error: 'Failed to fetch student engagement', details: error.message });
    }
};

// ============================================
// Application Settings Management
// ============================================

/**
 * Get all application settings
 * Admin can see all settings, including non-public ones
 */
export const getAllSettings = async (req, res) => {
    try {
        const settings = await configService.getAllSettings(false);

        // Get full details from database for admin view
        const result = await pool.query(`
            SELECT key, value, data_type, category, description, is_public, updated_at
            FROM app_settings
            ORDER BY category, key
        `);

        res.json({
            success: true,
            settings: result.rows.map(row => ({
                key: row.key,
                value: configService.DEFAULT_SETTINGS[row.key] !== undefined
                    ? settings[row.key]
                    : row.value,
                dataType: row.data_type,
                category: row.category,
                description: row.description,
                isPublic: row.is_public,
                updatedAt: row.updated_at
            })),
            categories: [...new Set(result.rows.map(r => r.category))]
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({
            error: 'Failed to fetch settings',
            details: error.message
        });
    }
};

/**
 * Get settings by category
 */
export const getSettingsByCategory = async (req, res) => {
    try {
        const { category } = req.params;

        if (!category) {
            return res.status(400).json({ error: 'Category is required' });
        }

        const settings = await configService.getSettingsByCategory(category);

        res.json({
            success: true,
            category,
            settings
        });
    } catch (error) {
        console.error('Error fetching settings by category:', error);
        res.status(500).json({
            error: 'Failed to fetch settings',
            details: error.message
        });
    }
};

/**
 * Update a single setting
 */
export const updateSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        if (!key) {
            return res.status(400).json({ error: 'Setting key is required' });
        }

        if (value === undefined) {
            return res.status(400).json({ error: 'Value is required' });
        }

        const updated = await configService.updateSetting(key, value);

        res.json({
            success: true,
            setting: updated,
            message: `Setting ${key} updated successfully`
        });
    } catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({
            error: 'Failed to update setting',
            details: error.message
        });
    }
};

/**
 * Update multiple settings at once
 */
export const updateSettings = async (req, res) => {
    try {
        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'Settings object is required' });
        }

        const updated = await configService.updateSettings(settings);

        res.json({
            success: true,
            updated,
            message: `${Object.keys(updated).length} settings updated successfully`
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({
            error: 'Failed to update settings',
            details: error.message
        });
    }
};

/**
 * Invalidate settings cache
 * Useful after manual database changes
 */
export const invalidateSettingsCache = async (req, res) => {
    try {
        await configService.invalidateAllCache();

        res.json({
            success: true,
            message: 'Settings cache invalidated successfully'
        });
    } catch (error) {
        console.error('Error invalidating cache:', error);
        res.status(500).json({
            error: 'Failed to invalidate cache',
            details: error.message
        });
    }
};
