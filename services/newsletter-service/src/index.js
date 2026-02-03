import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { testConnection } from './config/database.js';
import { pingMailchimp } from './services/mailchimpService.js';
import newsletterRoutes from './routes/newsletterRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3006;

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
        console.log(`[Newsletter Service] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// Health endpoints
app.get('/health', async (req, res) => {
    const mailchimpStatus = await pingMailchimp();

    res.json({
        success: true,
        service: 'newsletter-service',
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        mailchimp: mailchimpStatus.success ? 'connected' : 'not_configured'
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
app.use('/api/v1/newsletter', newsletterRoutes);

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
    console.error('[Newsletter Service] Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// Start server
const startServer = async () => {
    console.log(`[Newsletter Service] Starting on port ${PORT}...`);

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
        console.error('[Newsletter Service] Warning: Database connection failed');
    }

    // Check Mailchimp connection
    const mailchimpStatus = await pingMailchimp();
    if (!mailchimpStatus.success) {
        console.warn('[Newsletter Service] Mailchimp not configured or unavailable');
    } else {
        console.log('[Newsletter Service] Mailchimp connected');
    }

    app.listen(PORT, () => {
        console.log(`[Newsletter Service] Ready to accept connections`);
        console.log(`[Newsletter Service] Health: http://localhost:${PORT}/health`);
        console.log(`[Newsletter Service] API: http://localhost:${PORT}/api/v1/newsletter`);
    });
};

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`[Newsletter Service] ${signal} received, shutting down gracefully...`);
    process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();

export default app;
