import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { testConnection } from './config/database.js';
import { initializeRedis } from './config/redis.js';
import analyticsRoutes from './routes/analyticsRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3007;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[Analytics Service] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// Health endpoints
app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'analytics-service',
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        mode: 'read-only'
    });
});

app.get('/ready', async (req, res) => {
    const dbReady = await testConnection();
    const redisReady = await initializeRedis();

    if (dbReady) {
        res.json({
            success: true,
            ready: true,
            database: 'connected',
            redis: redisReady ? 'connected' : 'disconnected'
        });
    } else {
        res.status(503).json({
            success: false,
            ready: false,
            database: 'disconnected',
            redis: redisReady ? 'connected' : 'disconnected'
        });
    }
});

// Mount routes
app.use('/api/v1/analytics', analyticsRoutes);

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
    console.error('[Analytics Service] Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// Start server
const startServer = async () => {
    console.log(`[Analytics Service] Starting on port ${PORT}...`);
    console.log(`[Analytics Service] Running in read-only mode`);

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
        console.error('[Analytics Service] Warning: Database connection failed');
    }

    // Initialize Redis for caching
    const redisConnected = await initializeRedis();
    if (!redisConnected) {
        console.warn('[Analytics Service] Warning: Redis not available, caching disabled');
    }

    app.listen(PORT, () => {
        console.log(`[Analytics Service] Ready to accept connections`);
        console.log(`[Analytics Service] Health: http://localhost:${PORT}/health`);
        console.log(`[Analytics Service] API: http://localhost:${PORT}/api/v1/analytics`);
    });
};

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`[Analytics Service] ${signal} received, shutting down gracefully...`);
    process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();

export default app;
