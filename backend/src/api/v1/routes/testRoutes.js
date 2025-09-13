// Test routes for development and testing
// These routes should only be available in development mode

import express from 'express';
import { testNotificationScheduler, createTestMeeting } from '../controllers/testController.js';

const router = express.Router();

// Only enable test routes in development
if (process.env.NODE_ENV !== 'production') {
    
    // Test notification scheduler
    router.post('/scheduler', testNotificationScheduler);
    
    // Create test meeting
    router.post('/meeting', createTestMeeting);
    
    // Test endpoint info
    router.get('/', (req, res) => {
        res.json({
            message: 'TalkTime Test API - Development Only',
            available_endpoints: [
                'POST /api/v1/test/scheduler - Test notification scheduler',
                'POST /api/v1/test/meeting - Create test meeting',
                'GET /api/v1/test - This info'
            ],
            environment: process.env.NODE_ENV || 'development'
        });
    });
    
} else {
    // Production safety
    router.all('*', (req, res) => {
        res.status(404).json({
            error: 'Test endpoints not available in production'
        });
    });
}

export default router;
