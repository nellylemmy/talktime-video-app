import express from 'express';
import {
    subscribe,
    unsubscribe,
    checkStatus,
    getAllSubscribers,
    getStats
} from '../controllers/newsletterController.js';

const router = express.Router();

// Public endpoints
router.post('/subscribe', subscribe);
router.post('/unsubscribe', unsubscribe);
router.get('/status/:email', checkStatus);

// Admin endpoints (should be protected by auth middleware in production)
router.get('/subscribers', getAllSubscribers);
router.get('/stats', getStats);

export default router;
