/**
 * Authentication API Routes
 * RESTful API endpoints for authentication
 */
import express from 'express';
const router = express.Router();
import * as authController from '../controllers/authController.js';
import { isAuthenticated } from '../../../middleware/auth.js';

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', authController.login);

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post('/register', authController.register);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user info
 * @access  Private
 */
router.get('/me', isAuthenticated, authController.getCurrentUser);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', isAuthenticated, authController.logout);

/**
 * @route   GET /api/v1/auth/check-admin
 * @desc    Check if user is authenticated as admin
 * @access  Private
 */
router.get('/check-admin', isAuthenticated, authController.checkAdminAuth);

export default router;
