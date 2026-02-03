import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection } from './config/database.js';
import { initializeRedis } from './config/redis.js';
import meetingRoutes from './routes/meetingRoutes.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

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
        console.log(`[Meeting Service] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// Health endpoints
app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'meeting-service',
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
app.use('/api/v1/meetings', meetingRoutes);

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
    console.error('[Meeting Service] Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// Start server
const server = app.listen(PORT, async () => {
    console.log(`[Meeting Service] Starting on port ${PORT}...`);

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
        console.error('[Meeting Service] Warning: Database connection failed');
    }

    // Initialize Redis
    const redisConnected = await initializeRedis();
    if (!redisConnected) {
        console.error('[Meeting Service] Warning: Redis connection failed');
    }

    // Start scheduler for auto-timeout
    startScheduler();

    console.log(`[Meeting Service] Ready to accept connections`);
    console.log(`[Meeting Service] Health: http://localhost:${PORT}/health`);
    console.log(`[Meeting Service] API: http://localhost:${PORT}/api/v1/meetings`);
});

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`[Meeting Service] ${signal} received, shutting down gracefully...`);
    stopScheduler();
    server.close(() => {
        console.log('[Meeting Service] HTTP server closed');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('[Meeting Service] Forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
