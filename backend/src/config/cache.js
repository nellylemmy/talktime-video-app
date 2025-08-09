import dotenv from 'dotenv';
dotenv.config();
import { createClient } from 'redis';

/**
 * Initializes and connects the Redis clients.
 * @returns {Promise<{redisClient: *, bloomClient: *}>}
 */
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

/**
 * Initializes and connects the Redis clients with a retry mechanism.
 * @returns {Promise<{redisClient: *, bloomClient: *}>}
 */
async function initializeCache() {
    const redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://redis:6379'
    });

    redisClient.on('error', (err) => console.error('Redis Client Error', err));

    let retries = 0;
    while (retries < MAX_RETRIES) {
        try {
            console.log(`Attempting to connect to Redis (attempt ${retries + 1}/${MAX_RETRIES})...`);
            await redisClient.connect();
            console.log('Redis client connected successfully.');
            // Both the main client and the bloom client are the same object
            return { redisClient, bloomClient: redisClient };
        } catch (err) {
            retries++;
            console.error(`Redis connection failed. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
            if (retries >= MAX_RETRIES) {
                console.error('Max retries reached. Could not connect to Redis.');
                throw err; // Re-throw the last error to be caught by the server startup logic
            }
            await new Promise(res => setTimeout(res, RETRY_DELAY_MS));
        }
    }
}

export { initializeCache };

// Also export a direct redisClient for backward compatibility
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

export { redisClient };
