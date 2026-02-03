import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection } from './config/database.js';
import { initializeRedis } from './config/redis.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { startMeetingSubscriber } from './subscribers/meetingSubscriber.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[Notification Service] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// Health endpoints
app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'notification-service',
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

app.get('/ready', async (req, res) => {
    const dbReady = await testConnection();
    if (dbReady) {
        res.json({ success: true, ready: true, database: 'connected' });
    } else {
        res.status(503).json({ success: false, ready: false, database: 'disconnected' });
    }
});

// Mount routes
app.use('/api/v1/notifications', notificationRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[Notification Service] Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// Start server
const server = app.listen(PORT, async () => {
    console.log(`[Notification Service] Starting on port ${PORT}...`);

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
        console.error('[Notification Service] Warning: Database connection failed');
    }

    // Initialize Redis
    const redisConnected = await initializeRedis();
    if (!redisConnected) {
        console.error('[Notification Service] Warning: Redis connection failed');
    }

    // Start meeting event subscriber
    await startMeetingSubscriber();

    // Start scheduler
    startScheduler();

    console.log(`[Notification Service] Ready to accept connections`);
    console.log(`[Notification Service] Health: http://localhost:${PORT}/health`);
    console.log(`[Notification Service] API: http://localhost:${PORT}/api/v1/notifications`);
});

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`[Notification Service] ${signal} received, shutting down gracefully...`);
    stopScheduler();
    server.close(() => {
        console.log('[Notification Service] HTTP server closed');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('[Notification Service] Forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
