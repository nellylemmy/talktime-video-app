import express from 'express';
import {
    getDashboardStats,
    getVolunteerMetrics,
    getMeetingTrends,
    getTopVolunteers,
    getStudentEngagement
} from '../controllers/analyticsController.js';

const router = express.Router();

// Dashboard overview
router.get('/dashboard', getDashboardStats);

// Volunteer metrics
router.get('/volunteers/:volunteerId', getVolunteerMetrics);
router.get('/volunteers/top', getTopVolunteers);

// Meeting trends
router.get('/meetings/trends', getMeetingTrends);

// Student engagement
router.get('/students/engagement', getStudentEngagement);

export default router;
