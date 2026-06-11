import { Router } from 'express';
import { createJWTMiddleware } from '../../../utils/jwt.js';
import {
    submitFeedback,
    getMyFeedback,
    getAllFeedback,
    updateFeedbackStatus
} from '../controllers/feedbackController.js';

const router = Router();
const adminOnlyJWT = createJWTMiddleware(['admin']);

// Volunteer endpoints (base middleware handles auth)
router.post('/', submitFeedback);
router.get('/mine', getMyFeedback);

// Admin endpoints (additional admin check)
router.get('/', adminOnlyJWT, getAllFeedback);
router.put('/:id', adminOnlyJWT, updateFeedbackStatus);

export default router;
