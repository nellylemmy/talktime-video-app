/**
 * Volunteer API Routes
 * RESTful API endpoints for volunteer functionality
 */
import express from 'express';
const router = express.Router();
import * as volunteerController from '../controllers/volunteerController.js';

/**
 * @route   GET /api/v1/volunteers/dashboard-data
 * @desc    Get volunteer dashboard data including name and meetings
 * @access  Private (Volunteers only)
 */
router.get('/dashboard-data', volunteerController.getDashboardData);

/**
 * @route   GET /api/v1/volunteers/test
 * @desc    Test endpoint to verify route registration
 * @access  Private (Volunteers only)
 */
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Volunteer routes are working', user: req.user });
});

/**
 * @route   GET /api/v1/volunteers/students/cards
 * @desc    Get available student cards HTML
 * @access  Private (Volunteers only)
 */
router.get('/students/cards', volunteerController.getStudentCards);

/**
 * @route   GET /api/v1/volunteers/students/:id/profile
 * @desc    Get detailed student profile data for volunteers
 * @access  Private (Volunteers only)
 */
router.get('/students/:id/profile', volunteerController.getStudentProfile);

/**
 * @route   POST /api/v1/volunteers/meetings
 * @desc    Create a new meeting between volunteer and student
 * @access  Private (Volunteers only)
 */
router.post('/meetings', volunteerController.createMeeting);

export default router;
