/**
 * Meeting API Routes
 * RESTful API endpoints for meeting functionality
 */
import express from 'express';
const router = express.Router();
import { createJWTMiddleware } from '../../../utils/jwt.js';
// Legacy studentAvailabilityMiddleware removed - using unified users table only
import * as meetingController from '../controllers/meetingController.js';

// Create JWT authentication middleware
const jwtAuth = createJWTMiddleware();

/**
 * @route   GET /api/v1/meetings/student/:studentId
 * @desc    Get meetings by student ID
 * @access  Private (Volunteers and Admins)
 */
router.get('/student/:studentId', jwtAuth, meetingController.getMeetingsByStudentId);

/**
 * @route   GET /api/v1/meetings/:id
 * @desc    Get meeting by ID
 * @access  Private (Meeting participants and Admins)
 */
router.get('/:id', jwtAuth, meetingController.getMeetingById);

/**
 * @route   POST /api/v1/meetings
 * @desc    Create new meeting
 * @access  Private (Volunteers only)
 */
router.post('/', jwtAuth, meetingController.createMeeting);

/**
 * @route   PUT /api/v1/meetings/:id
 * @desc    Update meeting
 * @access  Private (Meeting owner and Admins)
 */
router.put('/:id', jwtAuth, meetingController.updateMeeting);

/**
 * @route   DELETE /api/v1/meetings/:id
 * @desc    Cancel meeting
 * @access  Private (Meeting owner and Admins)
 */
router.delete('/:id', jwtAuth, meetingController.cancelMeeting);

/**
 * @route   POST /api/v1/meetings/:meetingId/end
 * @desc    End meeting (universal endpoint for both volunteer and student)
 * @access  Private (Meeting participants and Admins)
 */
router.post('/:meetingId/end', jwtAuth, meetingController.endMeeting);

/**
 * @route   GET /api/v1/meetings/:id/join
 * @desc    Join meeting
 * @access  Private (Meeting participants and Admins)
 */
router.get('/:id/join', jwtAuth, meetingController.joinMeeting);

export default router;
