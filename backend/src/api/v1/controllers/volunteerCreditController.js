/**
 * Volunteer Credit System Controller
 * Handles credit tracking, certification, and PDF generation for student volunteers
 */
import pool from '../../../config/database.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import puppeteer from 'puppeteer';

/**
 * Get volunteer profile data including credit information
 */
export const getVolunteerProfile = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        
        // Get volunteer basic info
        const volunteerQuery = `
            SELECT id, username, full_name as name, email, role, created_at, volunteer_type, 
                   age, gender, phone, bio, story, location, interests, timezone, profile_image,
                   school_name, parent_email, parent_phone,
                   security_question_1, security_question_2, security_question_3,
                   security_answer_1_hash, security_answer_2_hash, security_answer_3_hash
            FROM users 
            WHERE id = $1 AND role = 'volunteer'
        `;
        const { rows: volunteerRows } = await pool.query(volunteerQuery, [volunteerId]);
        
        if (volunteerRows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }
        
        const volunteer = volunteerRows[0];
        
        // Check if this is a student volunteer
        const isStudentVolunteer = volunteer.volunteer_type === 'student_volunteer' || 
                                 volunteer.name?.toLowerCase().includes('student') ||
                                 volunteer.email?.includes('student');
        
        res.json({
            id: volunteer.id,
            username: volunteer.username,
            name: volunteer.name,
            email: volunteer.email,
            role: volunteer.role,
            joinedDate: volunteer.created_at,
            isStudentVolunteer: isStudentVolunteer,
            age: volunteer.age,
            gender: volunteer.gender,
            phone: volunteer.phone,
            bio: volunteer.bio,
            story: volunteer.story,
            location: volunteer.location,
            interests: volunteer.interests,
            timezone: volunteer.timezone,
            profileImage: volunteer.profile_image,
            volunteerType: volunteer.volunteer_type || 'standard',
            schoolName: volunteer.school_name,
            parentEmail: volunteer.parent_email,
            parentPhone: volunteer.parent_phone,
            securityQuestion1: volunteer.security_question_1,
            securityQuestion2: volunteer.security_question_2,
            securityQuestion3: volunteer.security_question_3,
            hasSecurityAnswer1: !!volunteer.security_answer_1_hash,
            hasSecurityAnswer2: !!volunteer.security_answer_2_hash,
            hasSecurityAnswer3: !!volunteer.security_answer_3_hash
        });
    } catch (error) {
        console.error('Error fetching volunteer profile:', error);
        res.status(500).json({ error: 'Failed to load profile data' });
    }
};

/**
 * Get volunteer credit data
 */
export const verifyCertificate = async (req, res) => {
    try {
        const { certificateId } = req.params;
        
        if (!certificateId) {
            return res.status(400).json({ error: 'Certificate ID is required' });
        }
        
        // Validate certificate ID format: TT-{volunteerId}-{year}-{hash}
        if (!certificateId.startsWith('TT-') || certificateId.split('-').length !== 4) {
            return res.status(400).json({ 
                error: 'Invalid certificate ID format',
                message: 'Certificate ID must be in format TT-XX-YYYY-XXXXXX'
            });
        }
        
        // Find volunteer by static certificate ID
        const volunteerQuery = `
            SELECT 
                u.id,
                u.full_name as name,
                u.email,
                u.created_at,
                u.location,
                u.phone,
                u.age,
                u.gender,
                u.volunteer_type,
                u.profile_image,
                u.static_certificate_id
            FROM users u
            WHERE u.static_certificate_id = $1 AND u.role = 'volunteer'
        `;
        
        const { rows: volunteerRows } = await pool.query(volunteerQuery, [certificateId]);
        
        if (volunteerRows.length === 0) {
            return res.status(404).json({ 
                error: 'Certificate not found',
                message: 'This certificate ID does not exist in our system or may have been entered incorrectly.'
            });
        }
        
        const volunteer = volunteerRows[0];
        
        // Get volunteer credits
        const creditsQuery = `
            SELECT 
                COUNT(*) as completed_calls,
                COUNT(*) * 0.5 as total_hours
            FROM meetings 
            WHERE volunteer_id = $1 AND status IN ('completed', 'ended', 'instant_completed')
        `;
        
        const { rows: creditsRows } = await pool.query(creditsQuery, [volunteer.id]);
        const credits = creditsRows[0];
        
        // Calculate service period
        const startDate = new Date(volunteer.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const serviceMonths = Math.ceil((Date.now() - new Date(volunteer.created_at)) / (1000 * 60 * 60 * 24 * 30));
        
        res.json({
            valid: true,
            certificateId,
            volunteer: {
                id: volunteer.id,
                name: volunteer.name,
                email: volunteer.email,
                location: volunteer.location,
                volunteerType: volunteer.volunteer_type || 'Community Volunteer'
            },
            service: {
                completedSessions: parseInt(credits.completed_calls) || 0,
                totalHours: parseFloat(credits.total_hours) || 0,
                startDate,
                currentDate,
                serviceMonths,
                program: 'TalkTime Cultural Exchange',
                serviceType: 'Educational Mentorship'
            },
            verifiedAt: new Date().toISOString(),
            issuer: {
                organization: 'ADEA Foundation',
                program: 'TalkTime Community Development Program',
                director: 'Mr. Douglas McFalls'
            }
        });
        
    } catch (error) {
        console.error('Error verifying certificate:', error);
        res.status(500).json({ error: 'Failed to verify certificate' });
    }
};

/**
 * Get volunteer credit data
 */
export const getVolunteerCredits = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        
        // Get completed meetings for this volunteer
        const completedMeetingsQuery = `
            SELECT 
                m.id,
                m.scheduled_time,
                m.status,
                s.full_name as student_name
            FROM meetings m
            JOIN users s ON m.student_id = s.id
            WHERE m.volunteer_id = $1 
            AND m.status = 'completed'
            ORDER BY m.scheduled_time DESC
        `;
        
        const { rows: completedMeetings } = await pool.query(completedMeetingsQuery, [volunteerId]);
        
        // Calculate credits
        const totalMeetings = completedMeetings.length;
        const totalMinutes = totalMeetings * 40; // Default 40 minutes per meeting
        
        // Calculate impact score based on consistency (since we don't have rating data yet)
        let impactScore = 0;
        if (totalMeetings > 0) {
            const consistencyBonus = Math.min(totalMeetings * 2, 20); // Up to 20 points for consistency
            impactScore = Math.round(consistencyBonus + (totalMeetings >= 5 ? 10 : 0)); // Bonus for 5+ meetings
        }
        
        // Get recent meeting history for activity
        const recentMeetingsQuery = `
            SELECT 
                m.id,
                m.scheduled_time,
                m.status,
                s.full_name as student_name
            FROM meetings m
            JOIN users s ON m.student_id = s.id
            WHERE m.volunteer_id = $1 
            ORDER BY m.scheduled_time DESC
            LIMIT 10
        `;
        
        const { rows: recentMeetings } = await pool.query(recentMeetingsQuery, [volunteerId]);
        
        res.json({
            completedCalls: totalMeetings,
            totalMinutes: totalMinutes,
            totalHours: Math.floor(totalMinutes / 60),
            impactScore: impactScore,
            averageRating: totalMeetings > 0 ? '4.0' : '0.0', // Default rating since we don't have rating data yet
            recentActivity: recentMeetings.map(meeting => ({
                id: meeting.id,
                date: meeting.scheduled_time,
                status: meeting.status,
                studentName: meeting.student_name,
                duration: 40 // Default 40 minutes per meeting
            })),
            eligibleForCertificate: totalMeetings >= 1, // At least 1 completed call
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching volunteer credits:', error);
        res.status(500).json({ error: 'Failed to load credit data' });
    }
};

/**
 * Update volunteer profile
 */
// Profile image upload endpoint
export const uploadProfileImage = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' });
        }
        
        // Validate file size (max 5MB)
        if (req.file.size > 5 * 1024 * 1024) {
            return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
        }
        
        // Generate unique filename
        const fileExtension = req.file.originalname.split('.').pop();
        const fileName = `profile_${volunteerId}_${Date.now()}.${fileExtension}`;
        const filePath = `profiles/${fileName}`;
        
        // Save file to uploads directory
        const uploadDir = path.join(process.cwd(), 'uploads', 'profiles');
        
        // Ensure directory exists
        await fs.promises.mkdir(uploadDir, { recursive: true });
        
        // Write file
        await fs.promises.writeFile(path.join(uploadDir, fileName), req.file.buffer);
        
        // Update database with new profile image path
        const updateQuery = `
            UPDATE users 
            SET profile_image = $1, updated_at = NOW()
            WHERE id = $2 AND role = 'volunteer'
            RETURNING profile_image
        `;
        
        const { rows } = await pool.query(updateQuery, [filePath, volunteerId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }
        
        res.json({
            success: true,
            profileImage: rows[0].profile_image,
            message: 'Profile image uploaded successfully'
        });
        
    } catch (error) {
        console.error('Error uploading profile image:', error);
        res.status(500).json({ error: 'Failed to upload profile image' });
    }
};

// Serve profile images
export const serveProfileImage = async (req, res) => {
    try {
        const { filename } = req.params;
        
        const filePath = path.join(process.cwd(), 'uploads', 'profiles', filename);
        
        // Check if file exists
        try {
            await fs.promises.access(filePath);
        } catch (error) {
            return res.status(404).json({ error: 'Image not found' });
        }
        
        // Set appropriate content type
        const ext = path.extname(filename).toLowerCase();
        let contentType = 'image/jpeg';
        if (ext === '.png') contentType = 'image/png';
        if (ext === '.webp') contentType = 'image/webp';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        
        const fileBuffer = await fs.promises.readFile(filePath);
        res.send(fileBuffer);
        
    } catch (error) {
        console.error('Error serving profile image:', error);
        res.status(500).json({ error: 'Failed to serve image' });
    }
};

// Delete profile image
export const deleteProfileImage = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        
        // Get current profile image path from database
        const getImageQuery = `
            SELECT profile_image 
            FROM users 
            WHERE id = $1 AND role = 'volunteer'
        `;
        
        const { rows } = await pool.query(getImageQuery, [volunteerId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }
        
        const currentImage = rows[0].profile_image;
        
        // If there's an image file, delete it from storage
        if (currentImage) {
            try {
                const filename = currentImage.split('/').pop();
                const filePath = path.join(process.cwd(), 'uploads', 'profiles', filename);
                
                // Check if file exists and delete it
                await fs.promises.access(filePath);
                await fs.promises.unlink(filePath);
                console.log(`Deleted profile image file: ${filename}`);
            } catch (fileError) {
                console.warn(`Could not delete image file: ${fileError.message}`);
                // Continue with database update even if file deletion fails
            }
        }
        
        // Update database to remove profile image reference
        const updateQuery = `
            UPDATE users 
            SET profile_image = NULL, updated_at = NOW()
            WHERE id = $1 AND role = 'volunteer'
            RETURNING id
        `;
        
        const { rows: updateRows } = await pool.query(updateQuery, [volunteerId]);
        
        if (updateRows.length === 0) {
            return res.status(404).json({ error: 'Failed to update profile' });
        }
        
        res.json({
            success: true,
            message: 'Profile image deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting profile image:', error);
        res.status(500).json({ error: 'Failed to delete profile image' });
    }
};

// Calculate profile completion percentage
export const getProfileCompletion = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        
        // Get volunteer profile data - only fields that exist in frontend form
        const query = `
            SELECT username, full_name, email, age, gender, phone, location, 
                   interests, timezone, profile_image, school_name, parent_email, 
                   parent_phone, security_question_1, security_question_2, security_question_3,
                   security_answer_1_hash, security_answer_2_hash, security_answer_3_hash,
                   volunteer_type
            FROM users 
            WHERE id = $1 AND role = 'volunteer'
        `;
        
        const { rows } = await pool.query(query, [volunteerId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }
        
        const volunteer = rows[0];
        const isStudentVolunteer = volunteer.volunteer_type === 'student_volunteer';
        
        // Define fields based on frontend form structure (equal weight for percentage calculation)
        const fields = {
            basic: [
                { field: 'full_name', weight: 1, label: 'Full Name' },
                { field: 'username', weight: 1, label: 'Username' },
                { field: 'email', weight: 1, label: 'Email' },
                { field: 'phone', weight: 1, label: 'Phone Number' },
                { field: 'location', weight: 1, label: 'Location' },
                { field: 'timezone', weight: 1, label: 'Timezone' },
                { field: 'age', weight: 1, label: 'Age' },
                { field: 'gender', weight: 1, label: 'Gender' },
                { field: 'profile_image', weight: 1, label: 'Profile Image' }
            ],
            about: [
                { field: 'interests', weight: 1, label: 'Interests & Hobbies' }
            ],
            security: [
                { field: 'security_question_1', weight: 1, label: 'Security Question 1' },
                { field: 'security_question_2', weight: 1, label: 'Security Question 2' },
                { field: 'security_question_3', weight: 1, label: 'Security Question 3' }
            ],
            student: isStudentVolunteer ? [
                { field: 'school_name', weight: 1, label: 'School Name' },
                { field: 'parent_email', weight: 1, label: 'Parent Email' },
                { field: 'parent_phone', weight: 1, label: 'Parent Phone' }
            ] : []
        };
        
        let totalWeight = 0;
        let completedWeight = 0;
        let missingFields = [];
        let completedFields = [];
        
        // Calculate completion for all field categories - only count security questions (not answers)
        Object.keys(fields).forEach(category => {
            fields[category].forEach(({ field, weight, label }) => {
                totalWeight += weight;
                const value = volunteer[field];
                
                if (isFieldCompleted(value)) {
                    completedWeight += weight;
                    completedFields.push({ field, label, category, weight });
                } else {
                    missingFields.push({ field, label, category, weight });
                }
            });
        });
        
        const completionPercentage = Math.round((completedWeight / totalWeight) * 100);
        
        // Generate recommendations based on missing fields
        const recommendations = missingFields
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3)
            .map(({ label, category }) => ({
                field: label,
                category: category,
                benefit: getFieldBenefit(label)
            }));
        
        res.json({
            success: true,
            completion: {
                percentage: completionPercentage,
                completedFields: completedFields.length,
                totalFields: completedFields.length + missingFields.length,
                isComplete: completionPercentage >= 90,
                level: getCompletionLevel(completionPercentage),
                nextMilestone: getNextMilestone(completionPercentage)
            },
            missingFields,
            recommendations,
            benefits: getCompletionBenefits(completionPercentage)
        });
        
    } catch (error) {
        console.error('Error calculating profile completion:', error);
        res.status(500).json({ error: 'Failed to calculate profile completion' });
    }
};

// Helper function to validate if a field has meaningful content
function isFieldCompleted(value) {
    if (!value) return false;
    
    const stringValue = value.toString().trim();
    
    // Check for empty content
    if (stringValue.length === 0) return false;
    
    // Check for meaningless content (just spaces, dashes, dots, etc.)
    const meaninglessPatterns = [
        /^[-\s]*$/, // Only dashes and spaces
        /^[.\s]*$/, // Only dots and spaces
        /^[_\s]*$/, // Only underscores and spaces
        /^[-_.]*$/, // Only dashes, dots, underscores
        /^[,\s]*$/, // Only commas and spaces
        /^[/\s]*$/, // Only slashes and spaces
        /^[\\s]*$/, // Only backslashes and spaces
        /^[\s]*$/, // Only whitespace
        /^n\/?a$/i, // "n/a", "N/A", "n a", etc.
        /^none$/i, // "none", "NONE"
        /^null$/i, // "null", "NULL"
        /^undefined$/i, // "undefined"
        /^test$/i, // "test", "TEST"
        /^example$/i, // "example"
        /^placeholder$/i, // "placeholder"
        /^todo$/i, // "todo", "TODO"
        /^tbd$/i, // "tbd", "TBD" (to be determined)
        /^tba$/i, // "tba", "TBA" (to be announced)
        /^\?+$/, // Only question marks
        /^x+$/i, // Only x's
        /^[0]+$/, // Only zeros
        /^[1]+$/, // Only ones (like "111")
        /^(abc|123|aaa|bbb|ccc)$/i // Common placeholder patterns
    ];
    
    // Check against meaningless patterns
    if (meaninglessPatterns.some(pattern => pattern.test(stringValue))) {
        return false;
    }
    
    // For very short content (1-2 characters), be more restrictive
    if (stringValue.length <= 2) {
        // Allow only meaningful short content
        const validShortPatterns = [
            /^[a-zA-Z]{2}$/, // Two letters (like country codes)
            /^\d{2}$/, // Two digits (age ranges)
            /^[a-zA-Z]\.?$/ // Single letter (potentially with dot)
        ];
        
        return validShortPatterns.some(pattern => pattern.test(stringValue));
    }
    
    // For longer content, ensure it has at least some meaningful characters
    if (stringValue.length >= 3) {
        // Must contain at least 2 alphanumeric characters
        const alphanumericCount = (stringValue.match(/[a-zA-Z0-9]/g) || []).length;
        return alphanumericCount >= 2;
    }
    
    return true;
}

// Helper functions for profile completion
function getFieldBenefit(fieldLabel) {
    const benefits = {
        'Profile Photo': 'Help students connect with you personally and build trust',
        'Bio': 'Let students know about your background and experience',
        'Your Story': 'Share your motivation and inspire students',
        'Interests & Hobbies': 'Find common ground with students for better conversations',
        'Location': 'Help students understand your cultural context',
        'Timezone': 'Enable better scheduling for meetings',
        'Age': 'Help students relate to your life experiences',
        'Gender': 'Allow students to request preferred mentors if needed',
        'Username': 'Create a unique identifier for your volunteer profile',
        'Phone Number': 'Enable important notifications and emergency contact',
        'Security Question 1': 'Secure your account for password recovery',
        'Security Question 2': 'Add extra security to protect your profile',
        'Security Question 3': 'Complete your account security setup',
        'School Name': 'Show your educational commitment to the community',
        'Parent Email': 'Keep guardians informed of your volunteer activities',
        'Parent Phone': 'Provide emergency contact for student volunteer safety'
    };
    return benefits[fieldLabel] || 'Complete your profile for a better experience';
}

function getCompletionLevel(percentage) {
    if (percentage >= 90) return 'Expert';
    if (percentage >= 75) return 'Advanced';
    if (percentage >= 50) return 'Intermediate';
    if (percentage >= 25) return 'Beginner';
    return 'Getting Started';
}

function getNextMilestone(percentage) {
    if (percentage < 25) return { target: 25, label: 'Basic Setup' };
    if (percentage < 50) return { target: 50, label: 'Profile Foundation' };
    if (percentage < 75) return { target: 75, label: 'Detailed Profile' };
    if (percentage < 90) return { target: 90, label: 'Profile Expert' };
    return { target: 100, label: 'Perfect Profile' };
}

function getCompletionBenefits(percentage) {
    if (percentage >= 90) {
        return [
            'Maximum student trust and engagement',
            'Priority in student selection process',
            'Access to advanced volunteer features',
            'Higher impact score calculation',
            'Featured volunteer status eligibility'
        ];
    } else if (percentage >= 75) {
        return [
            'Increased student engagement',
            'Better matching with compatible students',
            'Enhanced profile visibility',
            'Improved volunteer credibility'
        ];
    } else if (percentage >= 50) {
        return [
            'Basic student trust building',
            'Access to scheduling features',
            'Profile appears in student searches',
            'Standard volunteer privileges'
        ];
    } else {
        return [
            'Complete your profile to unlock more benefits',
            'Add a photo to increase student engagement',
            'Share your story to build meaningful connections'
        ];
    }
}

export const updateVolunteerProfile = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const { 
            username,
            fullName, 
            age, 
            gender, 
            phone, 
            bio, 
            story, 
            location, 
            interests, 
            timezone,
            schoolName,
            parentEmail,
            parentPhone,
            securityQuestion1,
            securityAnswer1,
            securityQuestion2,
            securityAnswer2,
            securityQuestion3,
            securityAnswer3,
            currentPassword,
            newPassword
        } = req.body;
        
        if (!fullName || fullName.trim().length === 0) {
            return res.status(400).json({ error: 'Full name is required' });
        }
        
        // Handle password change if requested
        if (newPassword && currentPassword) {
            // Verify current password
            const userQuery = `SELECT password_hash FROM users WHERE id = $1 AND role = 'volunteer'`;
            const { rows: userRows } = await pool.query(userQuery, [volunteerId]);
            
            if (userRows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userRows[0].password_hash);
            if (!isCurrentPasswordValid) {
                return res.status(400).json({ error: 'Current password is incorrect' });
            }
            
            // Validate new password strength
            if (newPassword.length < 8) {
                return res.status(400).json({ error: 'New password must be at least 8 characters long' });
            }
        }
        
        // Build dynamic update query based on provided fields
        const updateFields = ['full_name = $1', 'updated_at = NOW()'];
        const values = [fullName.trim()];
        let paramCount = 1;
        
        // Handle username update
        if (username !== undefined && username.trim() !== '') {
            paramCount++;
            updateFields.push(`username = $${paramCount}`);
            values.push(username.trim());
        }
        
        if (age !== undefined && age !== null && age !== '') {
            paramCount++;
            updateFields.push(`age = $${paramCount}`);
            values.push(parseInt(age) || null);
        }
        
        if (gender !== undefined && gender !== '') {
            paramCount++;
            updateFields.push(`gender = $${paramCount}`);
            values.push(gender);
        }
        
        // Handle optional fields - allow them to be cleared (set to NULL if empty)
        if (phone !== undefined) {
            paramCount++;
            updateFields.push(`phone = $${paramCount}`);
            values.push(phone.trim() === '' ? null : phone.trim());
        }
        
        if (bio !== undefined) {
            paramCount++;
            updateFields.push(`bio = $${paramCount}`);
            values.push(bio.trim() === '' ? null : bio.trim());
        }
        
        if (story !== undefined) {
            paramCount++;
            updateFields.push(`story = $${paramCount}`);
            values.push(story.trim() === '' ? null : story.trim());
        }
        
        if (location !== undefined) {
            paramCount++;
            updateFields.push(`location = $${paramCount}`);
            values.push(location.trim() === '' ? null : location.trim());
        }
        
        if (interests !== undefined) {
            paramCount++;
            updateFields.push(`interests = $${paramCount}`);
            values.push(interests.trim() === '' ? null : interests.trim());
        }
        
        if (timezone !== undefined) {
            paramCount++;
            updateFields.push(`timezone = $${paramCount}`);
            values.push(timezone === '' ? null : timezone);
        }
        
        if (schoolName !== undefined) {
            paramCount++;
            updateFields.push(`school_name = $${paramCount}`);
            values.push(schoolName.trim() === '' ? null : schoolName.trim());
        }
        
        if (parentEmail !== undefined) {
            paramCount++;
            updateFields.push(`parent_email = $${paramCount}`);
            values.push(parentEmail.trim() === '' ? null : parentEmail.trim());
        }
        
        if (parentPhone !== undefined) {
            paramCount++;
            updateFields.push(`parent_phone = $${paramCount}`);
            values.push(parentPhone.trim() === '' ? null : parentPhone.trim());
        }
        
        // Handle security questions and hash answers
        if (securityQuestion1 !== undefined && securityQuestion1 !== '') {
            paramCount++;
            updateFields.push(`security_question_1 = $${paramCount}`);
            values.push(securityQuestion1);
            
            if (securityAnswer1 !== undefined && securityAnswer1 !== '') {
                paramCount++;
                updateFields.push(`security_answer_1_hash = $${paramCount}`);
                const hashedAnswer1 = await bcrypt.hash(securityAnswer1.toLowerCase().trim(), 10);
                values.push(hashedAnswer1);
            }
        }
        
        if (securityQuestion2 !== undefined && securityQuestion2 !== '') {
            paramCount++;
            updateFields.push(`security_question_2 = $${paramCount}`);
            values.push(securityQuestion2);
            
            if (securityAnswer2 !== undefined && securityAnswer2 !== '') {
                paramCount++;
                updateFields.push(`security_answer_2_hash = $${paramCount}`);
                const hashedAnswer2 = await bcrypt.hash(securityAnswer2.toLowerCase().trim(), 10);
                values.push(hashedAnswer2);
            }
        }
        
        if (securityQuestion3 !== undefined && securityQuestion3 !== '') {
            paramCount++;
            updateFields.push(`security_question_3 = $${paramCount}`);
            values.push(securityQuestion3);
            
            if (securityAnswer3 !== undefined && securityAnswer3 !== '') {
                paramCount++;
                updateFields.push(`security_answer_3_hash = $${paramCount}`);
                const hashedAnswer3 = await bcrypt.hash(securityAnswer3.toLowerCase().trim(), 10);
                values.push(hashedAnswer3);
            }
        }
        
        // Handle password update if provided
        if (newPassword && currentPassword) {
            paramCount++;
            updateFields.push(`password_hash = $${paramCount}`);
            const hashedNewPassword = await bcrypt.hash(newPassword, 10);
            values.push(hashedNewPassword);
        }
        
        paramCount++;
        values.push(volunteerId);
        
        const updateQuery = `
            UPDATE users 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramCount} AND role = 'volunteer'
            RETURNING id, username, full_name as name, email, age, gender, phone, bio, story, 
                      location, interests, timezone, school_name, parent_email, parent_phone
        `;
        
        const { rows } = await pool.query(updateQuery, values);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }
        
        res.json({
            success: true,
            volunteer: rows[0]
        });
    } catch (error) {
        console.error('Error updating volunteer profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

/**
 * Generate certificate preview HTML
 */
export const generateCertificatePreview = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        
        // Get volunteer and credit data
        const volunteer = await getVolunteerData(volunteerId);
        if (!volunteer) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }
        
        const credits = await getVolunteerCreditData(volunteerId);
        
        // Generate certificate HTML
        const certificateHtml = generateCertificateHTML(volunteer, credits);
        
        res.setHeader('Content-Type', 'text/html');
        res.send(certificateHtml);
    } catch (error) {
        console.error('Error generating certificate preview:', error);
        res.status(500).json({ error: 'Failed to generate certificate preview' });
    }
};

/**
 * Generate and download certificate PDF
 */
export const downloadCertificate = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        
        // Get volunteer and credit data
        const volunteer = await getVolunteerData(volunteerId);
        if (!volunteer) {
            return res.status(404).json({ error: 'Volunteer not found' });
        }
        
        const credits = await getVolunteerCreditData(volunteerId);
        
        if (credits.completedCalls === 0) {
            return res.status(400).json({ error: 'No completed calls found. Complete at least one call to generate certificate.' });
        }
        
        // Generate the same HTML as preview
        const certificateHtml = generateCertificateHTML(volunteer, credits);
        
        // Create a complete HTML document for PDF generation - CRITICAL: Single page only
        const fullHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>TalkTime Certificate - ${volunteer.name}</title>
            <style>
                /* CRITICAL: Force single page A4 portrait layout */
                @page {
                    size: A4 portrait;
                    margin: 0.5in;
                }
                
                @media print {
                    html, body {
                        width: 8.27in;
                        height: 11.69in;
                        margin: 0;
                        padding: 0;
                        overflow: hidden;
                    }
                    
                    body {
                        font-size: 12pt;
                        line-height: 1.4;
                        font-family: 'Times New Roman', serif;
                    }
                    
                    * {
                        -webkit-print-color-adjust: exact !important;
                        color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    
                    /* Force no page breaks */
                    div, p, h1, h2, h3, section, article {
                        page-break-before: avoid !important;
                        page-break-after: avoid !important;
                        page-break-inside: avoid !important;
                        break-before: avoid !important;
                        break-after: avoid !important;
                        break-inside: avoid !important;
                    }
                }
                
                html {
                    width: 100%;
                    height: 100%;
                    margin: 0;
                    padding: 0;
                }
                
                body {
                    margin: 0;
                    padding: 0;
                    font-family: 'Times New Roman', Georgia, serif;
                    background: white;
                    width: 100%;
                    height: 100%;
                    box-sizing: border-box;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                
                /* Professional certificate styling */
                * {
                    box-sizing: border-box;
                }
                
                /* Ensure flexbox works in PDF */
                [style*="display: flex"] {
                    display: flex !important;
                }
                
                [style*="flex-direction: column"] {
                    flex-direction: column !important;
                }
                
                [style*="justify-content: center"] {
                    justify-content: center !important;
                }
                
                [style*="justify-content: space-between"] {
                    justify-content: space-between !important;
                }
            </style>
        </head>
        <body>
            ${certificateHtml}
        </body>
        </html>
        `;

        // Import Puppeteer dynamically (if available) or fall back to PDFKit
        let puppeteer;
        let pdfBuffer;
        
        try {
            // Try to use Puppeteer for exact HTML rendering
            puppeteer = await import('puppeteer');
            
            const browser = await puppeteer.default.launch({
                headless: true,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ]
            });
            
            const page = await browser.newPage();
            
            // Set viewport to A4 portrait dimensions
            await page.setViewport({
                width: 794,  // A4 width in pixels at 96 DPI
                height: 1123, // A4 height in pixels at 96 DPI
                deviceScaleFactor: 1
            });
            
            await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
            
            pdfBuffer = await page.pdf({
                format: 'A4',
                landscape: false, // CRITICAL: Portrait orientation
                printBackground: true,
                width: '8.27in',  // A4 width
                height: '11.69in', // A4 height
                margin: {
                    top: '0.5in',
                    right: '0.5in', 
                    bottom: '0.5in',
                    left: '0.5in'
                },
                preferCSSPageSize: true,
                scale: 1, // Full scale for professional printing
                displayHeaderFooter: false,
                pageRanges: '1', // Only generate first page
                omitBackground: false
            });
            
            await browser.close();
            console.log('PDF generated using Puppeteer (exact HTML rendering)');
            
        } catch (puppeteerError) {
            console.log('Puppeteer not available, falling back to PDFKit generation:', puppeteerError.message);
            // Fall back to the original PDF generation
            pdfBuffer = await generateCertificatePDF(volunteer, credits);
        }
        
        // Set response headers for PDF download
        const fileName = `TalkTime_Certificate_${volunteer.name.replace(/\s+/g, '_')}_${new Date().getFullYear()}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Error generating certificate PDF:', error);
        res.status(500).json({ error: 'Failed to generate certificate' });
    }
};

/**
 * Helper function to get volunteer data
 */
async function getVolunteerData(volunteerId) {
    const query = `
        SELECT 
            id, 
            full_name as name, 
            email, 
            created_at, 
            volunteer_type,
            location,
            phone,
            age,
            gender,
            static_certificate_id
        FROM users 
        WHERE id = $1 AND role = 'volunteer'
    `;
    const { rows } = await pool.query(query, [volunteerId]);
    return rows[0] || null;
}

/**
 * Helper function to get volunteer credit data
 */
async function getVolunteerCreditData(volunteerId) {
    const query = `
        SELECT 
            COUNT(*) as completed_calls
        FROM meetings 
        WHERE volunteer_id = $1 AND status = 'completed'
    `;
    const { rows } = await pool.query(query, [volunteerId]);
    const data = rows[0];
    
    const completedCalls = parseInt(data.completed_calls) || 0;
    
    return {
        completedCalls: completedCalls,
        totalMinutes: completedCalls * 40, // 40 minutes per meeting
        totalHours: Math.floor((completedCalls * 40) / 60),
        averageRating: completedCalls > 0 ? '4.0' : '0.0'
    };
}

/**
 * Generate certificate HTML for preview - CRITICAL: Single page portrait A4 only
 */
function generateCertificateHTML(volunteer, credits) {
    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    const startDate = new Date(volunteer.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Use static certificate ID that never changes
    const certificateId = volunteer.static_certificate_id;
    
    // Calculate volunteer service period
    const serviceMonths = Math.ceil((Date.now() - new Date(volunteer.created_at)) / (1000 * 60 * 60 * 24 * 30));
    
    return `
    <div style="
        width: 8.27in; 
        height: 11.69in;
        margin: 0; 
        padding: 0.6in; 
        font-family: 'Times New Roman', serif; 
        background: white; 
        box-sizing: border-box;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
    ">
        <!-- Header Section with Logo -->
        <div style="text-align: center; margin-bottom: 0.3in;">
            <!-- ADEA Foundation Logo -->
            <div style="margin-bottom: 0.2in;">
                <img src="https://adeafoundation.org/wp-content/uploads/2018/02/ADEA_Logo_rev.jpg" 
                     alt="ADEA Foundation" 
                     style="height: 0.6in; width: auto; object-fit: contain;">
            </div>
            
            <h1 style="
                font-size: 18pt; 
                color: #1e3a8a; 
                margin: 0 0 0.1in 0; 
                font-weight: bold;
                letter-spacing: 1.5pt;
                line-height: 1.2;
            ">CERTIFICATE OF COMMUNITY SERVICE</h1>
            
            <div style="
                font-size: 14pt; 
                color: #1e40af; 
                margin: 0 0 0.05in 0; 
                font-weight: bold;
                letter-spacing: 0.5pt;
            ">ADEA FOUNDATION</div>
            
            <div style="
                font-size: 10pt; 
                color: #64748b; 
                font-style: italic;
                margin-bottom: 0.1in;
            ">TalkTime Community Development Program</div>
            
            <!-- Decorative line -->
            <div style="
                width: 3in; 
                height: 2pt; 
                background: linear-gradient(to right, #1e3a8a, #3b82f6, #1e3a8a); 
                margin: 0.1in auto;
            "></div>
        </div>
        
        <!-- Main Content -->
        <div style="flex: 1; text-align: center; padding: 0.2in 0;">
            <!-- Official Declaration -->
            <div style="margin-bottom: 0.3in;">
                <p style="
                    font-size: 14pt; 
                    color: #374151; 
                    margin: 0 0 0.2in 0;
                    font-weight: 400;
                    line-height: 1.3;
                ">This is to certify that</p>
                
                <div style="
                    font-size: 24pt; 
                    color: #1e3a8a; 
                    font-weight: bold; 
                    margin: 0.2in 0; 
                    padding: 0.1in 0;
                    border-bottom: 2pt solid #1e3a8a;
                    letter-spacing: 1pt;
                    line-height: 1.1;
                    text-transform: uppercase;
                ">${volunteer.name}</div>
                
                <div style="
                    font-size: 12pt; 
                    color: #374151; 
                    margin: 0.2in 0 0.2in 0;
                    line-height: 1.4;
                    text-align: justify;
                ">has successfully completed ${credits.completedCalls} volunteer sessions through the TalkTime program, contributing ${credits.totalHours} hours of community service to support English language education for Maasai youth in Kenya.</div>
            </div>
            
            <!-- Service Details Section -->
            <div style="margin-bottom: 0.3in;">
                <!-- Service Summary Box -->
                <div style="
                    background: #f8fafc; 
                    border: 1pt solid #1e40af; 
                    border-radius: 6pt; 
                    padding: 0.15in; 
                    margin: 0.1in 0; 
                ">
                    <div style="color: #1e40af; font-weight: bold; font-size: 12pt; margin-bottom: 0.1in; text-align: center;">Service Summary</div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="color: #374151; font-size: 10pt; text-align: left; font-weight: bold; padding: 0.05in; border-bottom: 1pt solid #e5e7eb;">Total Sessions:</td>
                            <td style="color: #1e3a8a; font-size: 10pt; text-align: right; font-weight: bold; padding: 0.05in; border-bottom: 1pt solid #e5e7eb;">${credits.completedCalls}</td>
                        </tr>
                        <tr>
                            <td style="color: #374151; font-size: 10pt; text-align: left; font-weight: bold; padding: 0.05in; border-bottom: 1pt solid #e5e7eb;">Total Hours:</td>
                            <td style="color: #1e3a8a; font-size: 10pt; text-align: right; font-weight: bold; padding: 0.05in; border-bottom: 1pt solid #e5e7eb;">${credits.totalHours}</td>
                        </tr>
                        <tr>
                            <td style="color: #374151; font-size: 9pt; text-align: left; padding: 0.05in; border-bottom: 1pt solid #e5e7eb;">Program:</td>
                            <td style="color: #374151; font-size: 9pt; text-align: right; padding: 0.05in; border-bottom: 1pt solid #e5e7eb;">TalkTime Cultural Exchange</td>
                        </tr>
                        <tr>
                            <td style="color: #374151; font-size: 9pt; text-align: left; padding: 0.05in;">Service Type:</td>
                            <td style="color: #374151; font-size: 9pt; text-align: right; padding: 0.05in;">Educational Mentorship</td>
                        </tr>
                    </table>
                </div>
                
                <!-- Recognition Statement -->
                <div style="
                    font-size: 11pt; 
                    color: #374151; 
                    margin: 0.2in 0;
                    line-height: 1.4;
                    text-align: justify;
                    font-style: italic;
                    padding: 0.1in;
                    background: #f9fafb;
                    border-left: 3pt solid #1e40af;
                ">'This volunteer service represents a meaningful contribution to cross-cultural understanding and educational equity, demonstrating commitment to global citizenship and community development.'</div>
            </div>
        </div>
        
        <!-- Footer Section -->
        <div style="margin-top: auto;">
            <!-- Signatures Section -->
            <div style="margin-bottom: 0.2in;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="text-align: center; width: 50%; padding-right: 0.2in;">
                            <div style="border-bottom: 1pt solid #1e40af; height: 0.3in; margin-bottom: 0.05in;"></div>
                            <div style="font-size: 10pt; font-weight: bold; color: #374151;">Mr. Douglas McFalls</div>
                            <div style="font-size: 8pt; color: #64748b;">Director, ADEA Foundation</div>
                        </td>
                        <td style="text-align: center; width: 50%; padding-left: 0.2in;">
                            <div style="border-bottom: 1pt solid #1e40af; height: 0.3in; margin-bottom: 0.05in;"></div>
                            <div style="font-size: 10pt; font-weight: bold; color: #374151;">Date Issued</div>
                            <div style="font-size: 9pt; color: #1e3a8a; font-weight: bold;">${currentDate}</div>
                        </td>
                    </tr>
                </table>
            </div>
            
            <!-- Official Verification -->
            <div style="text-align: center;">
                <div style="
                    font-size: 8pt; 
                    color: #6b7280; 
                    line-height: 1.2;
                    margin-bottom: 0.05in;
                ">
                    <div style="font-weight: bold; color: #1e3a8a;">Certificate ID: ${certificateId} | Issued by ADEA Foundation TalkTime Program | Verification: http://localhost/volunteer/verify</div>
                </div>
                <div style="font-style: italic; color: #9ca3af; font-size: 7pt; line-height: 1.2;">
                    This document certifies authentic volunteer service and may be used for academic, professional, or immigration purposes.
                </div>
            </div>
        </div>
    </div>
    `;
}

/**
 * Generate certificate PDF
 */
async function generateCertificatePDF(volunteer, credits) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                layout: 'portrait', // CRITICAL: Changed from landscape to portrait
                margins: { top: 50, bottom: 50, left: 50, right: 50 }
            });
            
            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            
            // Certificate styling
            const pageWidth = doc.page.width;
            const pageHeight = doc.page.height;
            const margin = 60;
            
            // Border
            doc.rect(margin, margin, pageWidth - 2 * margin, pageHeight - 2 * margin)
               .lineWidth(8)
               .strokeColor('#1e3a8a')
               .stroke();
            
            doc.rect(margin + 20, margin + 20, pageWidth - 2 * margin - 40, pageHeight - 2 * margin - 40)
               .lineWidth(3)
               .strokeColor('#1e40af')
               .stroke();
            
            // Header
            doc.fontSize(28)
               .fillColor('#1e3a8a')
               .font('Helvetica-Bold')
               .text('CERTIFICATE OF VOLUNTEER SERVICE', margin + 40, margin + 60, {
                   width: pageWidth - 2 * margin - 80,
                   align: 'center'
               });
            
            // ADEA Foundation
            doc.fontSize(18)
               .fillColor('#1e40af')
               .text('ADEA FOUNDATION', margin + 40, margin + 100, {
                   width: pageWidth - 2 * margin - 80,
                   align: 'center'
               });
            
            doc.fontSize(12)
               .fillColor('#64748b')
               .font('Helvetica-Oblique')
               .text('TalkTime Cross-Cultural Education Initiative', margin + 40, margin + 125, {
                   width: pageWidth - 2 * margin - 80,
                   align: 'center'
               });
            
            // Main content
            doc.fontSize(16)
               .fillColor('#374151')
               .font('Helvetica')
               .text('This is to officially certify that', margin + 40, margin + 160, {
                   width: pageWidth - 2 * margin - 80,
                   align: 'center'
               });
            
            doc.fontSize(24)
               .fillColor('#1e3a8a')
               .font('Helvetica-Bold')
               .text(volunteer.name.toUpperCase(), margin + 40, margin + 190, {
                   width: pageWidth - 2 * margin - 80,
                   align: 'center'
               });
            
            // Volunteer details
            doc.fontSize(10)
               .fillColor('#64748b')
               .font('Helvetica-Oblique')
               .text(`Volunteer ID: ${volunteer.id} | Email: ${volunteer.email}`, margin + 40, margin + 225, {
                   width: pageWidth - 2 * margin - 80,
                   align: 'center'
               });
            
            const serviceText = `has demonstrated exceptional commitment to community service and cross-cultural education by successfully completing ${credits.completedCalls} volunteer tutoring session${credits.completedCalls !== 1 ? 's' : ''} through the TalkTime program. This volunteer has contributed ${credits.totalHours} hours of dedicated service providing English language instruction and cultural exchange opportunities to Maasai youth in rural Kenya.`;
            
            doc.fontSize(12)
               .fillColor('#374151')
               .font('Helvetica')
               .text(serviceText, margin + 60, margin + 250, {
                   width: pageWidth - 2 * margin - 120,
                   align: 'justify',
                   lineGap: 3
               });
            
            // Service details box
            const boxY = margin + 320;
            doc.rect(margin + 80, boxY, pageWidth - 2 * margin - 160, 100)
               .fillColor('#f8fafc')
               .fill()
               .strokeColor('#1e40af')
               .lineWidth(2)
               .stroke();
            
            doc.fontSize(11)
               .fillColor('#1e40af')
               .font('Helvetica-Bold')
               .text('OFFICIAL SERVICE RECORD', margin + 90, boxY + 10, {
                   width: pageWidth - 2 * margin - 180,
                   align: 'center'
               });
            
            doc.fontSize(10)
               .fillColor('#374151')
               .font('Helvetica-Bold')
               .text(`Total Sessions Completed: ${credits.completedCalls}`, margin + 90, boxY + 35)
               .text(`Total Service Hours: ${credits.totalHours}`, margin + 90, boxY + 50)
               .text('Program: TalkTime Cross-Cultural Education', margin + 90, boxY + 65)
               .text(`Volunteer Type: ${volunteer.volunteer_type || 'Community Volunteer'}`, margin + 90, boxY + 80);
            
            // Recognition statement
            const recognitionY = boxY + 110;
            doc.rect(margin + 60, recognitionY, pageWidth - 2 * margin - 120, 70)
               .fillColor('#eff6ff')
               .fill()
               .strokeColor('#dbeafe')
               .lineWidth(2)
               .stroke();
            
            const recognitionText = 'OFFICIAL RECOGNITION: This volunteer service represents verified contribution to sustainable development goals, cross-cultural understanding, and educational equity. This certificate serves as official documentation of community service hours for academic, professional, immigration, or scholarship purposes.';
            
            doc.fontSize(10)
               .fillColor('#1e40af')
               .font('Helvetica-Bold')
               .text(recognitionText, margin + 70, recognitionY + 10, {
                   width: pageWidth - 2 * margin - 140,
                   align: 'center',
                   lineGap: 2
               });
            
            // Signatures
            const sigY = recognitionY + 80;
            
            // Signature lines
            doc.moveTo(margin + 120, sigY + 40)
               .lineTo(margin + 300, sigY + 40)
               .strokeColor('#1e40af')
               .lineWidth(2)
               .stroke();
            
            doc.moveTo(pageWidth - margin - 300, sigY + 40)
               .lineTo(pageWidth - margin - 120, sigY + 40)
               .stroke();
            
            // Signature labels
            doc.fontSize(10)
               .fillColor('#374151')
               .font('Helvetica-Bold')
               .text('Dr. Sarah M. Williams', margin + 120, sigY + 50, { width: 180, align: 'center' })
               .text('Date of Issuance', pageWidth - margin - 300, sigY + 50, { width: 180, align: 'center' });
            
            doc.fontSize(9)
               .fillColor('#64748b')
               .font('Helvetica')
               .text('Executive Director', margin + 120, sigY + 65, { width: 180, align: 'center' })
               .text('ADEA Foundation', margin + 120, sigY + 78, { width: 180, align: 'center' });
            
            doc.fontSize(9)
               .fillColor('#1e3a8a')
               .font('Helvetica-Bold')
               .text(new Date().toLocaleDateString(), pageWidth - margin - 300, sigY + 65, { width: 180, align: 'center' });
            
            // Footer
            // Use static certificate ID that never changes
            const certificateId = volunteer.static_certificate_id;
            
            doc.fontSize(8)
               .fillColor('#1e3a8a')
               .font('Helvetica-Bold')
               .text(`Certificate ID: ${certificateId}`, margin + 40, pageHeight - margin - 35, {
                   width: pageWidth - 2 * margin - 80,
                   align: 'center'
               });
            
            doc.fontSize(7)
               .fillColor('#6b7280')
               .font('Helvetica')
               .text('Issued by ADEA Foundation TalkTime Program | Verification: www.adeafoundation.org/verify/' + certificateId, 
                     margin + 40, pageHeight - margin - 25, {
                         width: pageWidth - 2 * margin - 80,
                         align: 'center'
                     });
            
            doc.fontSize(6)
               .fillColor('#9ca3af')
               .font('Helvetica-Oblique')
               .text('This document constitutes official verification of volunteer service hours. ADEA Foundation is a registered 501(c)(3) nonprofit organization.',
                     margin + 40, pageHeight - margin - 15, {
                         width: pageWidth - 2 * margin - 80,
                         align: 'center'
                     });
            
            // Security badges
            doc.fontSize(7)
               .fillColor('#ffffff')
               .font('Helvetica-Bold');
            
            // Official badge
            doc.rect(pageWidth - margin - 70, margin + 70, 50, 15)
               .fillColor('#dc2626')
               .fill();
            doc.fillColor('#ffffff')
               .text('OFFICIAL', pageWidth - margin - 67, margin + 76);
            
            // Verified badge
            doc.rect(margin + 20, pageHeight - margin - 35, 50, 15)
               .fillColor('#059669')
               .fill();
            doc.fillColor('#ffffff')
               .text('VERIFIED ✓', margin + 23, pageHeight - margin - 30);
            
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

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
        const estimatedMinutesPerCall = 40; // Default meeting duration
        const totalMinutes = completedCalls * estimatedMinutesPerCall;
        const potentialStudentsImpacted = completedCalls * 1.2; // Multiplier effect
        const learningHoursProvided = Math.round(totalMinutes / 60 * 100) / 100;
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
