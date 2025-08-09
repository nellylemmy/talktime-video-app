import express from 'express';
import { signup, login, logout, getCurrentAdmin, resetStudentMeetings, getAllMeetings, getAllStudents, getStudent, createStudent, updateStudent, deleteStudent, deleteAllStudents } from '../controllers/adminController.js';
// Legacy studentAvailabilityController removed - using unified users table only
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
// Legacy student availability reset route removed - using unified users table
router.post('/reset-student-meetings/:id', adminOnlyJWT, resetStudentMeetings);
router.get('/meetings', adminOnlyJWT, getAllMeetings);

// Student management routes (unified users table)
router.get('/students', adminOnlyJWT, getAllStudents);
router.get('/students/:id', adminOnlyJWT, getStudent);
router.post('/students', adminOnlyJWT, createStudent);
router.put('/students/:id', adminOnlyJWT, updateStudent);
router.delete('/students/:id', adminOnlyJWT, deleteStudent);
router.delete('/students', adminOnlyJWT, deleteAllStudents);

export default router;
