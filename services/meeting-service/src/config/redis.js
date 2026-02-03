import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Publisher client for events
const publisher = new Redis(REDIS_URL, {
    retryDelayOnFailover: 1000,
    maxRetriesPerRequest: 3,
    lazyConnect: true
});

// Subscriber client for events (separate connection required)
const subscriber = new Redis(REDIS_URL, {
    retryDelayOnFailover: 1000,
    maxRetriesPerRequest: 3,
    lazyConnect: true
});

publisher.on('connect', () => {
    console.log('[Meeting Service] Redis publisher connected');
});

publisher.on('error', (err) => {
    console.error('[Meeting Service] Redis publisher error:', err.message);
});

subscriber.on('connect', () => {
    console.log('[Meeting Service] Redis subscriber connected');
});

subscriber.on('error', (err) => {
    console.error('[Meeting Service] Redis subscriber error:', err.message);
});

/**
 * Initialize Redis connections
 */
export const initializeRedis = async () => {
    try {
        await publisher.connect();
        await subscriber.connect();
        console.log('[Meeting Service] Redis connections established');
        return true;
    } catch (error) {
        console.error('[Meeting Service] Redis connection failed:', error.message);
        return false;
    }
};

export { publisher, subscriber };
export default { publisher, subscriber, initializeRedis };
