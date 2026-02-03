import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Publisher for events
export const pubClient = new Redis(redisUrl);

// Subscriber for events
export const subClient = new Redis(redisUrl);

// General Redis client for data storage
export const redisClient = new Redis(redisUrl);

pubClient.on('connect', () => {
    console.log('[Call Service] Redis publisher connected');
});

subClient.on('connect', () => {
    console.log('[Call Service] Redis subscriber connected');
});

redisClient.on('connect', () => {
    console.log('[Call Service] Redis client connected');
});

pubClient.on('error', (err) => {
    console.error('[Call Service] Redis publisher error:', err);
});

subClient.on('error', (err) => {
    console.error('[Call Service] Redis subscriber error:', err);
});

redisClient.on('error', (err) => {
    console.error('[Call Service] Redis client error:', err);
});

export const initializeRedis = async () => {
    try {
        await redisClient.ping();
        console.log('[Call Service] Redis connection verified');
        return true;
    } catch (error) {
        console.error('[Call Service] Redis connection failed:', error);
        return false;
    }
};

export default redisClient;
