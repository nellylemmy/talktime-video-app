import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection } from './config/database.js';
import authRoutes from './routes/auth.js';
import internalRoutes from './routes/internal.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

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
        console.log(`[Auth Service] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// Health check endpoints
app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'auth-service',
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

app.get('/ready', async (req, res) => {
    const dbReady = await testConnection();
    if (dbReady) {
        res.json({
            success: true,
            ready: true,
            database: 'connected'
        });
    } else {
        res.status(503).json({
            success: false,
            ready: false,
            database: 'disconnected'
        });
    }
});

// Mount routes
// External auth routes (for frontend)
app.use('/api/v1/auth', authRoutes);

// Backward compatibility routes (mirror monolith paths)
app.use('/api/v1/jwt-auth', authRoutes);

// Internal routes (for service-to-service communication)
app.use('/internal', internalRoutes);

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
    console.error('[Auth Service] Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// Start server
const server = app.listen(PORT, async () => {
    console.log(`[Auth Service] Starting on port ${PORT}...`);

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
        console.error('[Auth Service] Warning: Database connection failed');
    }

    console.log(`[Auth Service] Ready to accept connections`);
    console.log(`[Auth Service] Health: http://localhost:${PORT}/health`);
    console.log(`[Auth Service] Auth API: http://localhost:${PORT}/api/v1/auth`);
    console.log(`[Auth Service] Internal API: http://localhost:${PORT}/internal`);
});

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`[Auth Service] ${signal} received, shutting down gracefully...`);
    server.close(() => {
        console.log('[Auth Service] HTTP server closed');
        process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
        console.error('[Auth Service] Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
