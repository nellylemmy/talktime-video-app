import { Router } from 'express';
import { createJWTMiddleware } from '../../../utils/jwt.js';
import { submitAppeal, getMyAppeals, getAllAppeals, resolveAppeal } from '../controllers/appealController.js';

const router = Router();
const adminOnlyJWT = createJWTMiddleware(['admin']);

// Volunteer endpoints (base middleware handles auth)
router.post('/', submitAppeal);
router.get('/mine', getMyAppeals);

// Admin endpoints
router.get('/', adminOnlyJWT, getAllAppeals);
router.put('/:id', adminOnlyJWT, resolveAppeal);

export default router;
