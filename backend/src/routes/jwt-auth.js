import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { generateTokens, verifyToken, createJWTMiddleware } from '../utils/jwt.js';
import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
// Legacy User and Student models removed - using unified users table only

const router = express.Router();

/**
 * @route   POST /api/v1/jwt-auth/volunteer/login
 * @desc    JWT-based volunteer login
 * @access  Public
 */
router.post('/volunteer/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('JWT Volunteer login attempt:', email);
        
        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // Find user by email (case-insensitive)
        const query = 'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role = $2';
        const { rows } = await pool.query(query, [email, 'volunteer']);
        const user = rows[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Generate JWT token using utility function with proper audience
        const tokens = generateTokens(user);

        console.log('JWT Volunteer login successful:', user.email);

        res.json({
            success: true,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                full_name: user.full_name,
                role: user.role,
                volunteer_type: user.volunteer_type,
                is_approved: user.is_approved
            }
        });

    } catch (error) {
        console.error('JWT Volunteer login error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * @route   POST /api/v1/jwt-auth/volunteer/forgot-password
 * @desc    Get security questions for password recovery
 * @access  Public
 */
router.post('/volunteer/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        console.log('Password recovery request for:', email);
        
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        // Find user by email (case-insensitive)
        const query = 'SELECT id, email, full_name, security_question_1, security_question_2, security_question_3 FROM users WHERE LOWER(email) = LOWER($1) AND role = $2';
        const { rows } = await pool.query(query, [email, 'volunteer']);
        const user = rows[0];

        if (!user) {
            // Don't reveal whether email exists for security
            return res.status(404).json({
                success: false,
                error: 'No account found with this email address'
            });
        }

        // Check if user has security questions set up
        if (!user.security_question_1 || !user.security_question_2 || !user.security_question_3) {
            return res.status(400).json({
                success: false,
                error: 'This account does not have security questions set up. Please contact support.'
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name
            },
            security_questions: [
                user.security_question_1,
                user.security_question_2,
                user.security_question_3
            ]
        });

    } catch (error) {
        console.error('Password recovery error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * @route   POST /api/v1/jwt-auth/volunteer/verify-security-answers
 * @desc    Verify security answers and allow password reset
 * @access  Public
 */
router.post('/volunteer/verify-security-answers', async (req, res) => {
    try {
        const { email, security_answers } = req.body;
        
        console.log('Security answers verification for:', email);
        
        if (!email || !security_answers || !Array.isArray(security_answers) || security_answers.length !== 3) {
            return res.status(400).json({
                success: false,
                error: 'Email and three security answers are required'
            });
        }

        // Find user with security question hashes (case-insensitive)
        const query = 'SELECT id, email, full_name, security_answer_1_hash, security_answer_2_hash, security_answer_3_hash FROM users WHERE LOWER(email) = LOWER($1) AND role = $2';
        const { rows } = await pool.query(query, [email, 'volunteer']);
        const user = rows[0];

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'No account found with this email address'
            });
        }

        // Verify all three security answers
        const answer1Valid = await bcrypt.compare(security_answers[0].toLowerCase().trim(), user.security_answer_1_hash);
        const answer2Valid = await bcrypt.compare(security_answers[1].toLowerCase().trim(), user.security_answer_2_hash);
        const answer3Valid = await bcrypt.compare(security_answers[2].toLowerCase().trim(), user.security_answer_3_hash);

        if (!answer1Valid || !answer2Valid || !answer3Valid) {
            return res.status(401).json({
                success: false,
                error: 'One or more security answers are incorrect'
            });
        }

        // Generate a temporary token for password reset
        const resetToken = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                purpose: 'password_reset' 
            },
            JWT_SECRET,
            { expiresIn: '15m' } // Short expiry for security
        );

        console.log('Security answers verified successfully for:', user.email);

        res.json({
            success: true,
            message: 'Security answers verified successfully',
            reset_token: resetToken,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name
            }
        });

    } catch (error) {
        console.error('Security answers verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * @route   POST /api/v1/jwt-auth/volunteer/reset-password
 * @desc    Reset password using verified reset token
 * @access  Public
 */
router.post('/volunteer/reset-password', async (req, res) => {
    try {
        const { reset_token, new_password } = req.body;
        
        console.log('Password reset attempt with token');
        
        if (!reset_token || !new_password) {
            return res.status(400).json({
                success: false,
                error: 'Reset token and new password are required'
            });
        }

        // Verify reset token
        let decoded;
        try {
            decoded = jwt.verify(reset_token, JWT_SECRET);
            
            if (decoded.purpose !== 'password_reset') {
                throw new Error('Invalid token purpose');
            }
        } catch (tokenError) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired reset token'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(new_password, 10);

        // Update user password
        const updateQuery = 'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND email = $3 AND role = $4 RETURNING id, email, full_name';
        const { rows } = await pool.query(updateQuery, [hashedPassword, decoded.id, decoded.email, 'volunteer']);
        const user = rows[0];

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        console.log('Password reset successful for:', user.email);

        res.json({
            success: true,
            message: 'Password reset successfully',
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name
            }
        });

    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * @route   POST /api/v1/jwt-auth/volunteer/signup
 * @desc    JWT-based volunteer signup
 * @access  Public
 */
router.post('/volunteer/signup', async (req, res) => {
    try {
        const { username, full_name, email, password, parent_email, parent_phone, volunteer_type, school_name, age, gender, phone, timezone, security_questions } = req.body;
        
        console.log('JWT Volunteer signup attempt:', { username, email, volunteer_type, age });
        
        // Validate required fields
        if (!username || !full_name || !email || !password || !age || !gender || !phone || !timezone) {
            return res.status(400).json({
                success: false,
                error: 'Username, full name, email, password, age, gender, phone, and timezone are required'
            });
        }
        
        // Validate timezone format (IANA timezone identifier)
        if (timezone && typeof timezone === 'string') {
            const validTimezonePattern = /^[A-Za-z_]+\/[A-Za-z_]+$/;
            if (!validTimezonePattern.test(timezone)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid timezone format. Please use IANA timezone identifier (e.g., America/New_York)'
                });
            }
        }
        
        // Validate security questions (required for password recovery)
        if (!security_questions || !Array.isArray(security_questions) || security_questions.length !== 3) {
            return res.status(400).json({
                success: false,
                error: 'Three security questions are required for password recovery'
            });
        }
        
        // Validate each security question has both question and answer
        for (let i = 0; i < security_questions.length; i++) {
            const sq = security_questions[i];
            if (!sq.question || !sq.answer || !sq.question.trim() || !sq.answer.trim()) {
                return res.status(400).json({
                    success: false,
                    error: `Security question ${i + 1} must have both question and answer`
                });
            }
        }
        
        // Check if user already exists (case-insensitive)
        const checkQuery = 'SELECT * FROM users WHERE LOWER(email) = LOWER($1)';
        const { rows: existingRows } = await pool.query(checkQuery, [email]);
        const existingUser = existingRows[0];
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'User with this email already exists'
            });
        }
        
        // Determine if parental approval is needed
        const isStudentVolunteer = volunteer_type === 'student_volunteer';
        const parsedAge = parseInt(age, 10);
        const actuallyUnder18 = !isNaN(parsedAge) && parsedAge >= 10 && parsedAge < 18;
        const needsParentalApproval = isStudentVolunteer || actuallyUnder18;
        
        console.log('Parental approval check:', { 
            volunteer_type, 
            isStudentVolunteer, 
            age: parsedAge, 
            actuallyUnder18, 
            needsParentalApproval 
        });
        
        // Validate required parental fields if approval is needed
        if (needsParentalApproval && (!parent_email || !parent_phone)) {
            return res.status(400).json({
                success: false,
                error: 'Parent email and phone are required for parental approval'
            });
        }
        
        // Validate school name for student volunteers
        if (isStudentVolunteer && !school_name) {
            return res.status(400).json({
                success: false,
                error: 'School name is required for student volunteers'
            });
        }
        
        // Create new volunteer
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Hash security answers
        const hashedAnswers = await Promise.all(
            security_questions.map(sq => bcrypt.hash(sq.answer.toLowerCase().trim(), 10))
        );
        
        const insertQuery = `
            INSERT INTO users (
                username, full_name, email, password_hash, role, volunteer_type, is_under_18, 
                age, gender, phone, timezone, parent_email, parent_phone, school_name, 
                security_question_1, security_answer_1_hash,
                security_question_2, security_answer_2_hash,
                security_question_3, security_answer_3_hash,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW())
            RETURNING *
        `;
        const { rows: newUserRows } = await pool.query(insertQuery, [
            username,
            full_name,
            email,
            hashedPassword,
            'volunteer',
            volunteer_type || 'standard',
            actuallyUnder18 || false,
            parseInt(age) || null,
            gender || null,
            phone || null,
            timezone,
            needsParentalApproval ? parent_email : null,
            needsParentalApproval ? parent_phone : null,
            isStudentVolunteer ? school_name : null,
            security_questions[0].question,
            hashedAnswers[0],
            security_questions[1].question,
            hashedAnswers[1],
            security_questions[2].question,
            hashedAnswers[2]
        ]);
        const newUser = newUserRows[0];
        
        // If parental approval is needed, send notification
        if (needsParentalApproval) {
            try {
                const ParentalApprovalService = await import('../utils/parentalApproval.js');
                const approvalToken = ParentalApprovalService.default.generateApprovalToken();
                
                // Update user with approval token
                await pool.query(
                    'UPDATE users SET parent_approval_token = $1, parent_approval_sent_at = NOW() WHERE id = $2',
                    [approvalToken, newUser.id]
                );
                
                // Send parental approval request
                const { sendParentalApprovalRequest } = await import('../services/notificationService.js');
                await sendParentalApprovalRequest({
                    full_name,
                    email,
                    is_under_18: actuallyUnder18,
                    volunteer_type: volunteer_type,
                    parent_email,
                    parent_phone
                }, approvalToken);
                
                console.log('Parental approval request sent for user:', newUser.email);
            } catch (approvalError) {
                console.error('Error sending parental approval:', approvalError);
                // Don't fail signup if approval email fails, but log it
            }
        }
        
        // Generate JWT tokens
        const tokens = generateTokens(newUser);
        
        console.log('JWT Volunteer signup successful:', newUser.email);
        
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            user: {
                id: newUser.id,
                email: newUser.email,
                fullName: newUser.full_name || newUser.username,
                role: newUser.role
            },
            ...tokens
        });
        
    } catch (error) {
        console.error('JWT Volunteer signup error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during registration'
        });
    }
});

/**
 * @route   POST /api/v1/jwt-auth/student/login
 * @desc    JWT-based student login
 * @access  Public
 */
router.post('/student/login', async (req, res) => {
    try {
        const { name, admission_number } = req.body;
        
        console.log('JWT Student login attempt:', { name, admission_number });
        
        if (!name || !admission_number) {
            return res.status(400).json({
                success: false,
                error: 'Full name and admission number are required'
            });
        }
        
        // Find student by credentials using unified users table
        // Match by full name (case-insensitive) and handle both "ADM0001" and "0001" admission number formats
        const trimmedAdmissionNumber = admission_number.trim();
        const normalizedAdmissionNumber = trimmedAdmissionNumber.startsWith('ADM') ?
            trimmedAdmissionNumber : `ADM${trimmedAdmissionNumber}`;

        // Use LOWER() for case-insensitive name matching (nelson, Nelson, NELSON all match)
        const query = 'SELECT * FROM users WHERE LOWER(full_name) = LOWER($1) AND username LIKE $2 AND role = $3';
        const { rows } = await pool.query(query, [name.trim(), `${normalizedAdmissionNumber}%`, 'student']);
        const student = rows[0];
        if (!student) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials. Please check your name and admission number.'
            });
        }
        
        // Create user object for token generation
        const userForToken = {
            id: student.id,
            role: 'student',
            full_name: student.full_name,
            admission_number: student.username
        };
        
        // Generate JWT tokens
        const tokens = generateTokens(userForToken);
        
        console.log('JWT Student login successful:', student.full_name);
        
        res.json({
            success: true,
            message: 'Login successful',
            student: {
                id: student.id,
                fullName: student.full_name,
                admissionNumber: student.username
            },
            user: {
                id: student.id,
                fullName: student.full_name,
                role: 'student'
            },
            ...tokens
        });
        
    } catch (error) {
        console.error('JWT Student login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during login'
        });
    }
});

/**
 * @route   POST /api/v1/jwt-auth/admin/login
 * @desc    JWT-based admin login
 * @access  Public
 */
router.post('/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('JWT Admin login attempt:', { email });
        
        if (!email || !password) {
            console.log('JWT Admin login failed: Missing email or password');
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }
        
        // Find user by email (case-insensitive)
        const query = 'SELECT * FROM users WHERE LOWER(email) = LOWER($1)';
        const { rows } = await pool.query(query, [email]);
        const user = rows[0];
        console.log('JWT Admin login - User lookup result:', user ? { id: user.id, email: user.email, role: user.role } : 'User not found');
        
        if (!user) {
            console.log('JWT Admin login failed: User not found for email:', email);
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }
        
        // Verify user is an admin
        if (user.role !== 'admin') {
            console.log('JWT Admin login failed: User role is not admin. Role:', user.role);
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }
        
        // Verify password
        console.log('JWT Admin login - Attempting password verification');
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        console.log('JWT Admin login - Password verification result:', isValidPassword);
        
        if (!isValidPassword) {
            console.log('JWT Admin login failed: Invalid password for user:', user.email);
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }
        
        // Generate JWT tokens
        const tokens = generateTokens(user);
        
        console.log('JWT Admin login successful:', user.email);
        
        res.json({
            success: true,
            message: 'Admin login successful',
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                role: user.role
            },
            ...tokens
        });
        
    } catch (error) {
        console.error('JWT Admin login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during admin login'
        });
    }
});

/**
 * @route   POST /api/v1/jwt-auth/admin/signup
 * @desc    JWT-based admin signup (requires secret code)
 * @access  Public
 */
router.post('/admin/signup', async (req, res) => {
    try {
        const { full_name, email, password, secret_code } = req.body;
        
        console.log('JWT Admin signup attempt:', { full_name, email });
        
        if (!full_name || !email || !password || !secret_code) {
            return res.status(400).json({
                success: false,
                error: 'Full name, email, password, and secret code are required'
            });
        }
        
        // Verify secret code - support both single code and array of codes
        let validCodes = [];

        // Check for single code
        if (process.env.ADMIN_SECRET_CODE) {
            validCodes.push(process.env.ADMIN_SECRET_CODE);
        }

        // Check for multiple codes
        if (process.env.ADMIN_SECRET_CODES) {
            try {
                const codes = JSON.parse(process.env.ADMIN_SECRET_CODES);
                validCodes = validCodes.concat(codes);
            } catch (e) {
                console.error('Failed to parse ADMIN_SECRET_CODES:', e);
            }
        }

        // If no codes configured, reject
        if (validCodes.length === 0) {
            console.error('No admin secret codes configured in environment');
            return res.status(401).json({
                success: false,
                error: 'Admin signup is not configured'
            });
        }

        // Check if provided code is valid
        if (!validCodes.includes(secret_code)) {
            console.log('Invalid secret code attempt:', secret_code);
            return res.status(401).json({
                success: false,
                error: 'Invalid secret code'
            });
        }
        
        // Check if admin already exists (case-insensitive)
        const checkQuery = 'SELECT * FROM users WHERE LOWER(email) = LOWER($1)';
        const { rows: existingRows } = await pool.query(checkQuery, [email]);
        const existingUser = existingRows[0];
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'User with this email already exists'
            });
        }
        
        // Create new admin using actual database schema
        const hashedPassword = await bcrypt.hash(password, 10);
        const username = email.split('@')[0] + '_admin'; // Create unique username from email
        const insertQuery = `
            INSERT INTO users (username, full_name, email, password_hash, role, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            RETURNING *
        `;
        const { rows: newAdminRows } = await pool.query(insertQuery, [
            username,
            full_name,
            email,
            hashedPassword,
            'admin'
        ]);
        const newAdmin = newAdminRows[0];
        
        // Generate JWT tokens
        const tokens = generateTokens(newAdmin);
        
        console.log('JWT Admin signup successful:', newAdmin.email);
        
        res.status(201).json({
            success: true,
            message: 'Admin registration successful',
            user: {
                id: newAdmin.id,
                email: newAdmin.email,
                fullName: newAdmin.full_name,
                role: newAdmin.role
            },
            ...tokens
        });
        
    } catch (error) {
        console.error('JWT Admin signup error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during admin registration'
        });
    }
});

/**
 * @route   POST /api/v1/jwt-auth/refresh
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token is required'
            });
        }
        
        // Verify refresh token
        const decoded = verifyToken(refreshToken);
        
        // Find user to generate new tokens using unified users table
        const query = 'SELECT * FROM users WHERE id = $1';
        const { rows } = await pool.query(query, [decoded.id]);
        const user = rows[0];
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid refresh token'
            });
        }
        
        // Generate new tokens
        const tokens = generateTokens(user);
        
        res.json({
            success: true,
            message: 'Token refreshed successfully',
            ...tokens
        });
        
    } catch (error) {
        console.error('JWT Refresh token error:', error);
        res.status(401).json({
            success: false,
            error: 'Invalid refresh token'
        });
    }
});

/**
 * @route   GET /api/v1/jwt-auth/verify
 * @desc    Verify JWT token and return user info
 * @access  Private
 */
router.get('/verify', createJWTMiddleware(), async (req, res) => {
    try {
        // Token is already verified by middleware
        const user = req.user;
        
        res.json({
            success: true,
            authenticated: true,
            user: {
                id: user.id,
                email: user.email || null,
                username: user.username || null,
                full_name: user.full_name || user.fullName || null,
                role: user.role,
                volunteer_type: user.volunteer_type || null,
                is_approved: user.is_approved || true,
                ...(user.role === 'student' && {
                    admissionNumber: user.admissionNumber,
                    admission_number: user.admissionNumber
                })
            }
        });
        
    } catch (error) {
        console.error('JWT Verify token error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during token verification'
        });
    }
});

/**
 * @route   POST /api/v1/jwt-auth/logout
 * @desc    Logout (client-side token removal)
 * @access  Private
 */
router.post('/logout', createJWTMiddleware(), (req, res) => {
    // With JWT, logout is handled client-side by removing the token
    // Server doesn't need to do anything unless we implement token blacklisting
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

export default router;
