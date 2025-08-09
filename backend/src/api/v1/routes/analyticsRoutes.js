/**
 * Analytics Routes
 * Routes for admin analytics dashboard
 */
import express from 'express';
import { createJWTMiddleware } from '../../../utils/jwt.js';
import { 
    getSystemStats, 
    getMeetingStats, 
    getTopVolunteers,
    getStudentEngagement
} from '../controllers/analyticsController.js';

const router = express.Router();

// All routes require admin authentication
const adminOnlyJWT = createJWTMiddleware(['admin']);
router.use(adminOnlyJWT);

// Get system overview statistics
router.get('/system-stats', getSystemStats);

// Get meeting statistics by time period
router.get('/meeting-stats', getMeetingStats);

// Get top volunteers by meeting count
router.get('/top-volunteers', getTopVolunteers);

// Get student engagement statistics
router.get('/student-engagement', getStudentEngagement);

export default router;
