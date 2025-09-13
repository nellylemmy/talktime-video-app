import express from 'express';
import newsletterController from '../api/v1/controllers/newsletterController.js';
import { createJWTMiddleware } from '../utils/jwt.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Create admin JWT middleware
const adminJWTMiddleware = createJWTMiddleware(['admin']);

// Rate limiting for newsletter subscriptions
const subscribeRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 subscription requests per windowMs
    message: {
        success: false,
        message: 'Too many subscription attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiting for general newsletter endpoints
const generalRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false
});

// Basic validation middleware (without express-validator)
const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validateRole = (role) => {
    return ['visitor', 'volunteer', 'student', 'admin'].includes(role);
};

const validateToken = (token) => {
    return typeof token === 'string' && token.length >= 32 && token.length <= 64 && /^[a-zA-Z0-9]+$/.test(token);
};

// Public Routes

/**
 * @route POST /api/v1/newsletter/subscribe
 * @desc Subscribe to newsletter
 * @access Public
 */
router.post('/subscribe', 
    subscribeRateLimit,
    newsletterController.subscribe
);

/**
 * @route GET /api/v1/newsletter/verify/:token
 * @desc Verify email subscription
 * @access Public
 */
router.get('/verify/:token',
    generalRateLimit,
    newsletterController.verify
);

/**
 * @route GET /api/v1/newsletter/unsubscribe/:token
 * @desc Unsubscribe from newsletter
 * @access Public
 */
router.get('/unsubscribe/:token',
    generalRateLimit,
    newsletterController.unsubscribe
);

/**
 * @route POST /api/v1/newsletter/unsubscribe/:token
 * @desc Unsubscribe from newsletter (POST for forms)
 * @access Public
 */
router.post('/unsubscribe/:token',
    generalRateLimit,
    newsletterController.unsubscribe
);

/**
 * @route PUT /api/v1/newsletter/preferences/:token
 * @desc Update subscription preferences
 * @access Public (with token)
 */
router.put('/preferences/:token',
    generalRateLimit,
    newsletterController.updatePreferences
);

/**
 * @route POST /api/v1/newsletter/track
 * @desc Track newsletter analytics events
 * @access Public
 */
router.post('/track',
    generalRateLimit,
    newsletterController.trackEvent
);

// Admin-only Routes

/**
 * @route GET /api/v1/newsletter/admin/statistics
 * @desc Get newsletter subscription statistics
 * @access Admin only
 */
router.get('/admin/statistics',
    adminJWTMiddleware,
    newsletterController.getStatistics
);

/**
 * @route GET /api/v1/newsletter/admin/subscribers
 * @desc Get paginated list of subscribers
 * @access Admin only
 */
router.get('/admin/subscribers',
    adminJWTMiddleware,
    newsletterController.getSubscribers
);

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Newsletter service is healthy',
        timestamp: new Date().toISOString()
    });
});

export default router;
