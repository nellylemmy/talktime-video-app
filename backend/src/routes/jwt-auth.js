import express from 'express';
import bcrypt from 'bcrypt';
import { generateTokens, verifyToken, createJWTMiddleware } from '../utils/jwt.js';
import pool from '../config/database.js';
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
        
        console.log('JWT Volunteer login attempt:', { email });
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }
        
        // Find user by email
        const query = 'SELECT * FROM users WHERE email = $1';
        const { rows } = await pool.query(query, [email]);
        const user = rows[0];
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }
        
        // Verify user is a volunteer
        if (user.role !== 'volunteer') {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }
        
        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }
        
        // Generate JWT tokens
        const tokens = generateTokens(user);
        
        console.log('JWT Volunteer login successful:', user.email);
        
        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name || user.username,
                role: user.role
            },
            ...tokens
        });
        
    } catch (error) {
        console.error('JWT Volunteer login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during login'
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
        const { username, full_name, email, password, is_under_18, parent_email, parent_phone } = req.body;
        
        console.log('JWT Volunteer signup attempt:', { username, email, is_under_18 });
        
        // Validate required fields
        if (!username || !full_name || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username, full name, email, and password are required'
            });
        }
        
        // Check if user already exists
        const checkQuery = 'SELECT * FROM users WHERE email = $1';
        const { rows: existingRows } = await pool.query(checkQuery, [email]);
        const existingUser = existingRows[0];
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'User with this email already exists'
            });
        }
        
        // Create new volunteer
        const hashedPassword = await bcrypt.hash(password, 10);
        const insertQuery = `
            INSERT INTO users (username, full_name, email, password_hash, role, is_under_18, parent_email, parent_phone, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
            RETURNING *
        `;
        const { rows: newUserRows } = await pool.query(insertQuery, [
            username,
            full_name,
            email,
            hashedPassword,
            'volunteer',
            is_under_18 || false,
            is_under_18 ? parent_email : null,
            is_under_18 ? parent_phone : null
        ]);
        const newUser = newUserRows[0];
        
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
        // Match by full name and handle both "ADM0001" and "0001" admission number formats
        const trimmedAdmissionNumber = admission_number.trim();
        const normalizedAdmissionNumber = trimmedAdmissionNumber.startsWith('ADM') ? 
            trimmedAdmissionNumber : `ADM${trimmedAdmissionNumber}`;
        
        const query = 'SELECT * FROM users WHERE full_name = $1 AND username LIKE $2 AND role = $3';
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
        
        // Find user by email
        const query = 'SELECT * FROM users WHERE email = $1';
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
        
        // Verify secret code
        const expectedSecretCode = process.env.ADMIN_SECRET_CODE;
        if (!expectedSecretCode || secret_code !== expectedSecretCode) {
            return res.status(401).json({
                success: false,
                error: 'Invalid secret code'
            });
        }
        
        // Check if admin already exists
        const checkQuery = 'SELECT * FROM users WHERE email = $1';
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
                fullName: user.fullName,
                role: user.role,
                ...(user.role === 'student' && {
                    admissionNumber: user.admissionNumber
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
