import express from 'express';
import {
    signup,
    login,
    logout,
    getCurrentAdmin,
    resetStudentMeetings,
    getAllMeetings,
    getAllStudents,
    getStudent,
    createStudent,
    updateStudent,
    deleteStudent,
    deleteAllStudents,
    getAllVolunteers,
    getVolunteerPerformance,
    clearVolunteerRecord,
    getVolunteerDetails,
    deleteVolunteer,
    getVolunteerActivity,
    getAnalyticsSystemStats,
    getAnalyticsMeetingStats,
    getAnalyticsTopVolunteers,
    getAnalyticsStudentEngagement,
    getAllSettings,
    getSettingsByCategory,
    updateSetting,
    updateSettings,
    invalidateSettingsCache
} from '../controllers/adminController.js';
import { createJWTMiddleware } from '../../../utils/jwt.js';

const router = express.Router();

// Create JWT middleware for admin-only access
const adminOnlyJWT = createJWTMiddleware(['admin']);

// Public admin routes (no authentication required)
router.post('/signup', signup); // Public route for initial admin signup
router.post('/login', login);

// Protected admin routes (require JWT authentication)
router.get('/logout', adminOnlyJWT, logout);
router.get('/me', adminOnlyJWT, getCurrentAdmin);
router.post('/reset-student-meetings/:id', adminOnlyJWT, resetStudentMeetings);
router.get('/meetings', adminOnlyJWT, getAllMeetings);

// Student management routes
router.get('/students', adminOnlyJWT, getAllStudents);
router.get('/students/:id', adminOnlyJWT, getStudent);
router.post('/students', adminOnlyJWT, createStudent);
router.put('/students/:id', adminOnlyJWT, updateStudent);
router.delete('/students/:id', adminOnlyJWT, deleteStudent);
router.delete('/students', adminOnlyJWT, deleteAllStudents);

// Volunteer management routes
router.get('/volunteers', adminOnlyJWT, getAllVolunteers);
router.get('/volunteers/:id/details', adminOnlyJWT, getVolunteerDetails);
router.get('/volunteers/:id/performance', adminOnlyJWT, getVolunteerPerformance);
router.get('/volunteers/:id/activity', adminOnlyJWT, getVolunteerActivity);
router.delete('/volunteers/:id', adminOnlyJWT, deleteVolunteer);
router.post('/volunteers/:id/clear-record', adminOnlyJWT, clearVolunteerRecord);

// Analytics routes (served from monolith instead of broken microservice)
router.get('/analytics/system-stats', adminOnlyJWT, getAnalyticsSystemStats);
router.get('/analytics/meeting-stats', adminOnlyJWT, getAnalyticsMeetingStats);
router.get('/analytics/top-volunteers', adminOnlyJWT, getAnalyticsTopVolunteers);
router.get('/analytics/student-engagement', adminOnlyJWT, getAnalyticsStudentEngagement);

// Application settings routes (admin only)
router.get('/settings', adminOnlyJWT, getAllSettings);
router.get('/settings/category/:category', adminOnlyJWT, getSettingsByCategory);
router.put('/settings/:key', adminOnlyJWT, updateSetting);
router.put('/settings', adminOnlyJWT, updateSettings);
router.post('/settings/invalidate-cache', adminOnlyJWT, invalidateSettingsCache);

export default router;
