import express from 'express';
import { validateMeetingAccess, generateSecureMeetingLink } from '../controllers/meetingValidationController.js';
import { isAuthenticated } from '../../../middleware/auth.js';

const router = express.Router();

// Validate student access to meeting
router.post('/validate-access', isAuthenticated, validateMeetingAccess);

// Generate secure meeting link (for volunteers)
router.post('/generate-link', isAuthenticated, generateSecureMeetingLink);

export default router;
