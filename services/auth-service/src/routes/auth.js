import express from 'express';
import volunteerAuth from '../controllers/volunteerAuth.js';
import studentAuth from '../controllers/studentAuth.js';
import adminAuth from '../controllers/adminAuth.js';
import User from '../models/User.js';
import { generateTokens, verifyToken, extractTokenFromHeader } from '../services/tokenService.js';

const router = express.Router();

// ==================== Volunteer Routes ====================

/**
 * @route   POST /api/v1/auth/volunteer/login
 * @desc    Volunteer login
 * @access  Public
 */
router.post('/volunteer/login', volunteerAuth.login);

/**
 * @route   POST /api/v1/auth/volunteer/signup
 * @desc    Volunteer signup
 * @access  Public
 */
router.post('/volunteer/signup', volunteerAuth.signup);

/**
 * @route   POST /api/v1/auth/volunteer/forgot-password
 * @desc    Get security questions for password recovery
 * @access  Public
 */
router.post('/volunteer/forgot-password', volunteerAuth.forgotPassword);

/**
 * @route   POST /api/v1/auth/volunteer/verify-security-answers
 * @desc    Verify security answers for password reset
 * @access  Public
 */
router.post('/volunteer/verify-security-answers', volunteerAuth.verifySecurityAnswers);

/**
 * @route   POST /api/v1/auth/volunteer/reset-password
 * @desc    Reset password with verified token
 * @access  Public
 */
router.post('/volunteer/reset-password', volunteerAuth.resetPassword);

// ==================== Student Routes ====================

/**
 * @route   POST /api/v1/auth/student/login
 * @desc    Student login (name + admission number)
 * @access  Public
 */
router.post('/student/login', studentAuth.login);

/**
 * @route   POST /api/v1/auth/student/logout
 * @desc    Student logout
 * @access  Private
 */
router.post('/student/logout', studentAuth.logout);

// ==================== Admin Routes ====================

/**
 * @route   POST /api/v1/auth/admin/login
 * @desc    Admin login
 * @access  Public
 */
router.post('/admin/login', adminAuth.login);

/**
 * @route   POST /api/v1/auth/admin/signup
 * @desc    Admin signup (requires secret code)
 * @access  Public
 */
router.post('/admin/signup', adminAuth.signup);

// ==================== Universal Token Routes ====================

/**
 * @route   POST /api/v1/auth/token/refresh
 * @desc    Refresh JWT token
 * @access  Public (with valid refresh token)
 */
router.post('/token/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token is required'
            });
        }

        const decoded = verifyToken(refreshToken);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid refresh token'
            });
        }

        const tokens = generateTokens(user);

        res.json({
            success: true,
            message: 'Token refreshed successfully',
            ...tokens
        });
    } catch (error) {
        console.error('[Auth Service] Refresh token error:', error);
        res.status(401).json({
            success: false,
            error: 'Invalid refresh token'
        });
    }
});

/**
 * @route   GET /api/v1/auth/token/verify
 * @desc    Verify JWT token and return user info
 * @access  Private
 */
router.get('/token/verify', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = extractTokenFromHeader(authHeader);

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                message: 'No token provided'
            });
        }

        const decoded = verifyToken(token);

        res.json({
            success: true,
            authenticated: true,
            user: {
                id: decoded.id,
                email: decoded.email || null,
                username: decoded.username || null,
                full_name: decoded.full_name || decoded.fullName || null,
                role: decoded.role,
                volunteer_type: decoded.volunteer_type || null,
                is_approved: decoded.is_approved || true,
                ...(decoded.role === 'student' && {
                    admissionNumber: decoded.admissionNumber,
                    admission_number: decoded.admissionNumber
                })
            }
        });
    } catch (error) {
        console.error('[Auth Service] Verify token error:', error);
        res.status(401).json({
            success: false,
            error: 'Invalid token',
            message: error.message
        });
    }
});

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout (client-side token removal)
 * @access  Private
 */
router.post('/logout', (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

export default router;
