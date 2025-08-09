import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import pool from '../../../config/database.js';

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
        const userQuery = 'SELECT id, name, email, password_hash, role FROM users WHERE email = $1';
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

        // Generate JWT token for admin
        const token = jwt.sign(
            {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Return success
        res.status(200).json({
            success: true,
            message: 'Admin login successful',
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
                username as "admissionNumber",
                email,
                age,
                gender,
                profile_image as "profilePictureUrl",
                created_at as "createdAt"
            FROM users 
            WHERE role = 'student'
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
        
        const fullName = `${firstName} ${lastName}`;
        
        // Check if admission number already exists
        const existingStudent = await pool.query(
            'SELECT id FROM users WHERE username = $1 AND role = $2',
            [admissionNumber, 'student']
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

        const query = `
            INSERT INTO users (
                full_name, 
                username, 
                email, 
                role, 
                age, 
                gender, 
                profile_image,
                bio,
                story,
                location,
                interests,
                gallery_images,
                english_level,
                learning_goals,
                preferred_topics,
                password_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING 
                id,
                full_name as "fullName",
                username as "admissionNumber",
                email,
                age,
                gender,
                profile_image as "profilePictureUrl",
                bio,
                story,
                location,
                interests,
                created_at as "createdAt"
        `;
        
        const result = await pool.query(query, [
            fullName,                                           // $1
            admissionNumber,                                    // $2
            `${admissionNumber}@talktime.student`,             // $3 - Generate email from admission number
            'student',                                         // $4
            age || null,                                       // $5
            gender || null,                                    // $6
            profilePictureUrl || photoUrl || null,            // $7 - profile_image
            bio || null,                                       // $8
            story || studentStory || null,                     // $9
            location || 'Kenya',                               // $10
            interests || 'English conversation practice',      // $11
            galleryImages.length > 0 ? JSON.stringify(galleryImages) : null, // $12 - gallery_images JSON array
            englishLevel || 'Beginner',                       // $13
            learningGoals || 'Improve English conversation skills', // $14
            preferredTopics || 'General conversation',        // $15
            'defaultpassword'                                  // $16 - Temporary password hash for students
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
        
        // Get student from unified users table including all profile fields
        const query = `
            SELECT 
                id,
                full_name as "fullName",
                username as "admissionNumber",
                email,
                age,
                gender,
                phone,
                school_name as "schoolName",
                profile_image as "profileImage",
                bio,
                story,
                location,
                interests,
                gallery_images,
                english_level as "englishLevel",
                learning_goals as "learningGoals",
                preferred_topics as "preferredTopics",
                is_available as "isAvailable",
                created_at as "createdAt"
            FROM users 
            WHERE id = $1 AND role = $2
        `;
        
        const result = await pool.query(query, [Number(id), 'student']);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        const student = result.rows[0];
        
        // Parse gallery_images JSON array
        let gallery = [];
        if (student.gallery_images) {
            try {
                gallery = JSON.parse(student.gallery_images);
            } catch (e) {
                console.warn('Failed to parse gallery_images JSON:', e);
                gallery = [];
            }
        }
        
        // Add gallery array to student object
        student.gallery = gallery;
        
        // Also add photoUrl alias for profile image (frontend compatibility)
        student.photoUrl = student.profileImage;
        
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
            'SELECT id FROM users WHERE id = $1 AND role = $2',
            [Number(id), 'student']
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
            // Format admission number with ADM prefix for storage
            const formattedAdmission = admissionNumber.startsWith('ADM') ? admissionNumber : `ADM${admissionNumber.padStart(4, '0')}-${firstName?.toLowerCase() || 'student'}-${lastName?.toLowerCase() || 'user'}`;
            updates.push(`username = $${paramCount}`);
            values.push(formattedAdmission);
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
        
        if (phone !== undefined) {
            updates.push(`phone = $${paramCount}`);
            values.push(phone || null);
            paramCount++;
        }
        
        if (schoolName !== undefined) {
            updates.push(`school_name = $${paramCount}`);
            values.push(schoolName || null);
            paramCount++;
        }
        
        // Add new profile fields
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
            updates.push(`profile_image = $${paramCount}`);
            values.push(profilePictureUrl || photoUrl || null);
            paramCount++;
        }
        
        if (location !== undefined) {
            updates.push(`location = $${paramCount}`);
            values.push(location || 'Kenya');
            paramCount++;
        }
        
        if (interests !== undefined) {
            updates.push(`interests = $${paramCount}`);
            values.push(interests || 'English conversation practice');
            paramCount++;
        }
        
        if (englishLevel !== undefined) {
            updates.push(`english_level = $${paramCount}`);
            values.push(englishLevel || 'Beginner');
            paramCount++;
        }
        
        if (learningGoals !== undefined) {
            updates.push(`learning_goals = $${paramCount}`);
            values.push(learningGoals || null);
            paramCount++;
        }
        
        if (preferredTopics !== undefined) {
            updates.push(`preferred_topics = $${paramCount}`);
            values.push(preferredTopics || null);
            paramCount++;
        }
        
        // Handle gallery images if provided - store as JSON array for unlimited images
        if (galleryImages.length > 0 || (gallery !== undefined || galleryUrls !== undefined)) {
            updates.push(`gallery_images = $${paramCount}`);
            values.push(galleryImages.length > 0 ? JSON.stringify(galleryImages) : null);
            paramCount++;
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        
        values.push(Number(id));
        
        const query = `
            UPDATE users 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount} AND role = 'student'
            RETURNING 
                id,
                full_name as "fullName",
                username as "admissionNumber",
                email,
                age,
                gender,
                phone,
                school_name as "schoolName",
                profile_image as "profileImage",
                bio,
                story,
                location,
                interests,
                gallery_images,
                english_level as "englishLevel",
                learning_goals as "learningGoals",
                preferred_topics as "preferredTopics",
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
            'SELECT id, full_name FROM users WHERE id = $1 AND role = $2',
            [Number(id), 'student']
        );
        
        if (existingStudent.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        // Delete the student
        await pool.query(
            'DELETE FROM users WHERE id = $1 AND role = $2',
            [Number(id), 'student']
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
            'SELECT COUNT(*) as count FROM users WHERE role = $1',
            ['student']
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
        await pool.query('DELETE FROM users WHERE role = $1', ['student']);
        
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
