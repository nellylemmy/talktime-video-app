import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_URL = process.env.REDIS_URL || `redis://${REDIS_HOST}:${REDIS_PORT}`;

const publisher = new Redis(REDIS_URL, {
    retryDelayOnFailover: 1000,
    maxRetriesPerRequest: 3,
    lazyConnect: true
});

const subscriber = new Redis(REDIS_URL, {
    retryDelayOnFailover: 1000,
    maxRetriesPerRequest: 3,
    lazyConnect: true
});

publisher.on('connect', () => {
    console.log('[Notification Service] Redis publisher connected');
});

publisher.on('error', (err) => {
    console.error('[Notification Service] Redis publisher error:', err.message);
});

subscriber.on('connect', () => {
    console.log('[Notification Service] Redis subscriber connected');
});

subscriber.on('error', (err) => {
    console.error('[Notification Service] Redis subscriber error:', err.message);
});

export const initializeRedis = async () => {
    try {
        await publisher.connect();
        await subscriber.connect();
        console.log('[Notification Service] Redis connections established');
        return true;
    } catch (error) {
        console.error('[Notification Service] Redis connection failed:', error.message);
        return false;
    }
};

export { publisher, subscriber };
export default { publisher, subscriber, initializeRedis };
