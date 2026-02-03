import redisClient from '../config/redis.js';

// User presence tracking
const userSockets = new Map(); // userId -> Set of socketIds

/**
 * Setup presence tracking handlers
 */
export const setupPresenceHandlers = (io, socket) => {
    /**
     * Register user presence
     */
    socket.on('register-presence', async (data) => {
        const { userId, role } = data;

        if (!userId) return;

        // Store socket -> user mapping
        socket.userId = userId;
        socket.userRole = role;

        // Join user's personal room for direct messages
        socket.join(`user_${userId}`);

        // Track in memory
        if (!userSockets.has(userId)) {
            userSockets.set(userId, new Set());
        }
        userSockets.get(userId).add(socket.id);

        // Store in Redis
        await redisClient.sadd(`user:${userId}:sockets`, socket.id);
        await redisClient.hset(`socket:${socket.id}`, {
            userId: userId.toString(),
            role: role || 'unknown',
            connectedAt: new Date().toISOString()
        });
        await redisClient.expire(`socket:${socket.id}`, 7200); // 2 hour TTL

        // Set user as online
        await redisClient.set(`user:${userId}:online`, 'true', 'EX', 7200);

        console.log(`[Call Service] User ${userId} (${role}) registered presence, socket: ${socket.id}`);

        // Broadcast online status
        io.emit('user-online', { userId, role });
    });

    /**
     * Get online users
     */
    socket.on('get-online-users', async (data, callback) => {
        const { userIds } = data;
        const onlineUsers = [];

        for (const userId of userIds) {
            const isOnline = await redisClient.get(`user:${userId}:online`);
            if (isOnline === 'true') {
                onlineUsers.push(userId);
            }
        }

        if (typeof callback === 'function') {
            callback({ onlineUsers });
        } else {
            socket.emit('online-users', { onlineUsers });
        }
    });

    /**
     * Handle disconnect for presence
     */
    socket.on('disconnect', async () => {
        if (socket.userId) {
            const userId = socket.userId;

            // Remove from memory
            const sockets = userSockets.get(userId);
            if (sockets) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    userSockets.delete(userId);
                    // User fully offline
                    await redisClient.del(`user:${userId}:online`);
                    io.emit('user-offline', { userId });
                }
            }

            // Clean up Redis
            await redisClient.srem(`user:${userId}:sockets`, socket.id);
            await redisClient.del(`socket:${socket.id}`);

            console.log(`[Call Service] User ${userId} disconnected, socket: ${socket.id}`);
        }
    });
};

/**
 * Check if user is online
 */
export const isUserOnline = async (userId) => {
    // Check memory first
    const sockets = userSockets.get(userId);
    if (sockets && sockets.size > 0) return true;

    // Check Redis
    const online = await redisClient.get(`user:${userId}:online`);
    return online === 'true';
};

/**
 * Get all sockets for a user
 */
export const getUserSockets = async (userId) => {
    // Check memory first
    const sockets = userSockets.get(userId);
    if (sockets && sockets.size > 0) {
        return Array.from(sockets);
    }

    // Check Redis
    return await redisClient.smembers(`user:${userId}:sockets`);
};

/**
 * Send message to specific user (all their sockets)
 */
export const sendToUser = (io, userId, event, data) => {
    io.to(`user_${userId}`).emit(event, data);
};

export default {
    setupPresenceHandlers,
    isUserOnline,
    getUserSockets,
    sendToUser
};
