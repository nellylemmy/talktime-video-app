/**
 * Student JWT Authentication Routes
 * New system using users table with role='student'
 */
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../../../config/database.js';
import { createJWTMiddleware } from '../../../utils/jwt.js';

const router = express.Router();

// Create JWT middleware for student authentication
const studentJWTMiddleware = createJWTMiddleware(['student']);

/**
 * @route   POST /api/v1/jwt-auth/student/login
 * @desc    Authenticate student using users table
 * @access  Public
 */
router.post('/login', async (req, res) => {
    try {
        const { name, admission_number } = req.body;
        
        console.log('Student JWT login attempt:', { name, admission_number });
        
        // Validate required fields
        if (!name || !admission_number) {
            return res.status(400).json({ 
                success: false, 
                message: 'Full name and admission number are required' 
            });
        }
        
        // Find student user by username (admission number) and full name
        // Handle various admission number formats
        const formattedName = name.trim().toLowerCase().replace(/\s+/g, '-');
        const admissionVariants = [
            admission_number.trim(),
            `ADM${admission_number.trim()}`,
            `ADM${admission_number.trim()}-${formattedName}`,
            `${admission_number.trim()}-${formattedName}`
        ];

        const userQuery = `
            SELECT * FROM users
            WHERE role = 'student'
            AND (username = ANY($1) OR username LIKE $2)
            AND LOWER(full_name) = LOWER($3)
        `;

        const userResult = await pool.query(userQuery, [
            admissionVariants,
            `%${admission_number.trim()}%`,
            name.trim()
        ]);
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials. Please check your name and admission number.' 
            });
        }
        
        const user = userResult.rows[0];
        
        // For now, we'll skip password verification since students don't have passwords in the old system
        // In production, you might want to set a default password or implement a different auth method
        
        // Generate JWT token for student authentication
        // Include all relevant student data (exclude sensitive fields like password_hash)
        const tokenPayload = {
            id: user.id,
            fullName: user.full_name,
            username: user.username,
            admissionNumber: user.username, // Admission number = username
            role: user.role,
            email: user.email,
            profileImage: user.profile_image || null,
            age: user.age || null,
            gender: user.gender || null,
            phone: user.phone || null,
            timezone: user.timezone || 'UTC',
            schoolName: user.school_name || null
        };

        const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });

        console.log('Student JWT login successful:', { id: user.id, fullName: user.full_name, username: user.username });

        res.json({
            success: true,
            message: 'Login successful',
            accessToken: accessToken,
            user: {
                id: user.id,
                fullName: user.full_name,
                username: user.username,
                admissionNumber: user.username,
                email: user.email,
                role: user.role,
                profileImage: user.profile_image || null,
                age: user.age || null,
                gender: user.gender || null,
                phone: user.phone || null,
                timezone: user.timezone || 'UTC',
                schoolName: user.school_name || null,
                createdAt: user.created_at
            },
            redirectUrl: '/student/dashboard'
        });
        
    } catch (error) {
        console.error('Error in student JWT login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login. Please try again.' 
        });
    }
});

/**
 * @route   POST /api/v1/jwt-auth/student/logout
 * @desc    Logout student
 * @access  Private (Student only)
 */
router.post('/logout', studentJWTMiddleware, (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(401).json({ 
                success: false, 
                message: 'Not authenticated as student' 
            });
        }
        
        // For JWT, we don't need to destroy jwt_auths - just return success
        // The client will remove the JWT token
        res.json({
            success: true,
            message: 'Logged out successfully',
            redirectUrl: '/student/login'
        });
        
    } catch (error) {
        console.error('Error in student JWT logout:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during logout' 
        });
    }
});

/**
 * @route   GET /api/v1/jwt-auth/student/verify
 * @desc    Verify student JWT token
 * @access  Private (Student only)
 */
router.get('/verify', studentJWTMiddleware, (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(401).json({ 
                success: false, 
                message: 'Not authenticated as student' 
            });
        }
        
        res.json({
            success: true,
            user: {
                id: req.user.id,
                fullName: req.user.fullName,
                username: req.user.username,
                email: req.user.email,
                role: req.user.role
            }
        });
        
    } catch (error) {
        console.error('Error in student JWT verify:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during verification' 
        });
    }
});

export default router;
