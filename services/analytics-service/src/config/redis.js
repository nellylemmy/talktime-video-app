import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisClient = new Redis(redisUrl);

redisClient.on('connect', () => {
    console.log('[Analytics Service] Redis connected');
});

redisClient.on('error', (err) => {
    console.error('[Analytics Service] Redis error:', err);
});

export const initializeRedis = async () => {
    try {
        await redisClient.ping();
        console.log('[Analytics Service] Redis connection verified');
        return true;
    } catch (error) {
        console.error('[Analytics Service] Redis connection failed:', error);
        return false;
    }
};

export default redisClient;
