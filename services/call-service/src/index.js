import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import cors from 'cors';
import dotenv from 'dotenv';

import { testConnection } from './config/database.js';
import { initializeRedis, pubClient, subClient } from './config/redis.js';
import { setupWebRTCHandlers } from './socket/webrtc.js';
import { setupPresenceHandlers } from './socket/presence.js';
import { setupInstantCallHandlers } from './socket/instantCall.js';
import { initializeSubscriber } from './events/subscriber.js';
import { recoverTimers } from './timer/meetingTimer.js';
import callRoutes from './routes/callRoutes.js';

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3004;

// Socket.IO with Redis adapter for scaling
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

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
        console.log(`[Call Service] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// Health endpoints
app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'call-service',
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        connections: io.engine.clientsCount
    });
});

app.get('/ready', async (req, res) => {
    const dbReady = await testConnection();
    const redisReady = await initializeRedis();

    if (dbReady && redisReady) {
        res.json({
            success: true,
            ready: true,
            database: 'connected',
            redis: 'connected',
            connections: io.engine.clientsCount
        });
    } else {
        res.status(503).json({
            success: false,
            ready: false,
            database: dbReady ? 'connected' : 'disconnected',
            redis: redisReady ? 'connected' : 'disconnected'
        });
    }
});

// Mount API routes
app.use('/api/v1/calls', callRoutes);

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
    console.error('[Call Service] Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log(`[Call Service] New connection: ${socket.id}`);

    // Setup all handlers
    setupWebRTCHandlers(io, socket);
    setupPresenceHandlers(io, socket);
    setupInstantCallHandlers(io, socket);

    socket.on('error', (error) => {
        console.error(`[Call Service] Socket error for ${socket.id}:`, error);
    });
});

// Start server
const startServer = async () => {
    console.log(`[Call Service] Starting on port ${PORT}...`);

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
        console.error('[Call Service] Warning: Database connection failed');
    }

    // Initialize Redis and adapter
    const redisConnected = await initializeRedis();
    if (redisConnected) {
        // Use Redis adapter for Socket.IO
        io.adapter(createAdapter(pubClient, subClient));
        console.log('[Call Service] Socket.IO Redis adapter initialized');
    } else {
        console.error('[Call Service] Warning: Redis connection failed, running without adapter');
    }

    // Initialize event subscriber
    initializeSubscriber(io);

    // Recover persisted timers
    await recoverTimers(io);

    server.listen(PORT, () => {
        console.log(`[Call Service] Ready to accept connections`);
        console.log(`[Call Service] Health: http://localhost:${PORT}/health`);
        console.log(`[Call Service] Socket.IO: ws://localhost:${PORT}/socket.io/`);
        console.log(`[Call Service] API: http://localhost:${PORT}/api/v1/calls`);
    });
};

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`[Call Service] ${signal} received, shutting down gracefully...`);

    // Close all socket connections
    io.close(() => {
        console.log('[Call Service] Socket.IO server closed');
    });

    server.close(() => {
        console.log('[Call Service] HTTP server closed');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('[Call Service] Forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();

export { io };
export default app;
