/**
 * Volunteer View Routes
 * Routes for rendering volunteer-related HTML views
 */
import express from 'express';
const router = express.Router();
import { isAuthenticated } from '../../middleware/auth.js';
import * as volunteerViewController from '../controllers/volunteerViewController.js';

/**
 * @route   GET /views/volunteers/students/cards
 * @desc    Render HTML for available student cards
 * @access  Private (Volunteers only)
 */
router.get('/students/cards', isAuthenticated, volunteerViewController.renderStudentCards);

export default router;
