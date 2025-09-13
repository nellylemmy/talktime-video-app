import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Public certificate verification page (no auth required)
router.get('/verify', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', '..', 'frontends', 'volunteer', 'public', 'verify.html'));
});

// Middleware to check if user is authenticated as a volunteer
const isVolunteerAuthenticated = (req, res, next) => {
    // This would be replaced with actual authentication logic
    // For now, we'll just pass through
    next();
};

// Apply authentication middleware to all volunteer routes except verification
router.use(isVolunteerAuthenticated);

// Volunteer dashboard - main page (redirects to students tab)
router.get('/dashboard', (req, res) => {
    res.redirect('/volunteer/dashboard/students');
});

// Volunteer dashboard - students tab
router.get('/dashboard/students', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'volunteer', 'dashboard', 'students.html'));
});

// Volunteer dashboard - upcoming tab
router.get('/dashboard/upcoming', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'volunteer', 'dashboard', 'upcoming.html'));
});

// Volunteer dashboard - history tab
router.get('/dashboard/history', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'volunteer', 'dashboard', 'history.html'));
});

// Student detail page - matches pattern: /volunteer/dashboard/students/{admission-number}-{student-name}
router.get('/dashboard/students/:studentId', (req, res) => {
    // The :studentId parameter will capture the "{admission-number}-{student-name}" part
    res.sendFile(path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'volunteer', 'dashboard', 'student-detail.html'));
});

// Schedule new meeting page - matches pattern: /volunteer/dashboard/students/{admission-number}-{student-name}/new/schedule
router.get('/dashboard/students/:studentId/new/schedule', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'volunteer', 'dashboard', 'schedule.html'));
});

// Update/reschedule meeting page - matches pattern: /volunteer/dashboard/students/{admission-number}-{student-name}/update/schedule
router.get('/dashboard/students/:studentId/update/schedule', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'volunteer', 'dashboard', 'schedule.html'));
});

// Legacy route for backward compatibility - redirects to students tab
router.get('/dashboard.html', (req, res) => {
    res.redirect('/volunteer/dashboard/students');
});

export default router;
