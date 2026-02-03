import redisClient from '../config/redis.js';
import pool from '../config/database.js';

// Instant call timeout: 3 minutes
const INSTANT_CALL_TIMEOUT_MS = 3 * 60 * 1000;

// Active instant call timers
const instantCallTimers = new Map();

/**
 * Start a timer for instant call response
 * If student doesn't respond within 3 minutes, auto-cancel
 */
export const startInstantCallTimer = (io, callId, volunteerId, studentId, roomId) => {
    if (instantCallTimers.has(callId)) {
        console.log(`[Call Service] Instant call timer already running for ${callId}`);
        return;
    }

    const startTime = Date.now();
    const endTime = startTime + INSTANT_CALL_TIMEOUT_MS;

    // Store in Redis
    redisClient.hset(`instant_call:${callId}`, {
        volunteerId: volunteerId.toString(),
        studentId: studentId.toString(),
        roomId,
        startTime: startTime.toString(),
        endTime: endTime.toString(),
        status: 'pending'
    });
    redisClient.expire(`instant_call:${callId}`, 300); // 5 min TTL

    // Set timeout for auto-cancellation
    const timeoutId = setTimeout(async () => {
        await cancelInstantCall(io, callId, 'timeout');
    }, INSTANT_CALL_TIMEOUT_MS);

    instantCallTimers.set(callId, {
        timeoutId,
        volunteerId,
        studentId,
        roomId,
        startTime,
        endTime
    });

    console.log(`[Call Service] Instant call timer started: ${callId}, expires in 3 minutes`);
    return { callId, endTime };
};

/**
 * Cancel instant call timer (when student responds or timeout)
 */
export const cancelInstantCall = async (io, callId, reason = 'cancelled') => {
    const timerData = instantCallTimers.get(callId);

    if (timerData) {
        clearTimeout(timerData.timeoutId);
        instantCallTimers.delete(callId);
    }

    // Get call data from Redis
    const callData = await redisClient.hgetall(`instant_call:${callId}`);

    if (callData && callData.volunteerId) {
        // Update status in Redis
        await redisClient.hset(`instant_call:${callId}`, 'status', reason);

        // Notify volunteer
        io.to(`user_${callData.volunteerId}`).emit('instant-call-cancelled', {
            callId,
            reason,
            message: reason === 'timeout'
                ? 'Student did not respond in time'
                : 'Instant call was cancelled'
        });

        // Notify student if not timeout
        if (reason !== 'timeout') {
            io.to(`user_${callData.studentId}`).emit('instant-call-cancelled', {
                callId,
                reason
            });
        }

        console.log(`[Call Service] Instant call ${callId} cancelled: ${reason}`);
    }

    // Clean up Redis
    await redisClient.del(`instant_call:${callId}`);
};

/**
 * Accept instant call (student response)
 */
export const acceptInstantCall = async (io, callId) => {
    const timerData = instantCallTimers.get(callId);

    if (timerData) {
        clearTimeout(timerData.timeoutId);
        instantCallTimers.delete(callId);
    }

    const callData = await redisClient.hgetall(`instant_call:${callId}`);

    if (callData && callData.volunteerId) {
        await redisClient.hset(`instant_call:${callId}`, 'status', 'accepted');

        // Notify volunteer
        io.to(`user_${callData.volunteerId}`).emit('instant-call-accepted', {
            callId,
            roomId: callData.roomId,
            studentId: callData.studentId
        });

        console.log(`[Call Service] Instant call ${callId} accepted`);
        return callData;
    }

    return null;
};

/**
 * Decline instant call (student response)
 */
export const declineInstantCall = async (io, callId) => {
    const timerData = instantCallTimers.get(callId);

    if (timerData) {
        clearTimeout(timerData.timeoutId);
        instantCallTimers.delete(callId);
    }

    const callData = await redisClient.hgetall(`instant_call:${callId}`);

    if (callData && callData.volunteerId) {
        await redisClient.hset(`instant_call:${callId}`, 'status', 'declined');

        // Notify volunteer
        io.to(`user_${callData.volunteerId}`).emit('instant-call-declined', {
            callId,
            studentId: callData.studentId,
            message: 'Student declined the instant call'
        });

        console.log(`[Call Service] Instant call ${callId} declined`);
    }

    await redisClient.del(`instant_call:${callId}`);
};

/**
 * Get instant call status
 */
export const getInstantCallStatus = async (callId) => {
    const callData = await redisClient.hgetall(`instant_call:${callId}`);
    if (!callData || !callData.status) return null;

    return {
        callId,
        status: callData.status,
        volunteerId: parseInt(callData.volunteerId),
        studentId: parseInt(callData.studentId),
        roomId: callData.roomId,
        remainingMs: Math.max(0, parseInt(callData.endTime) - Date.now())
    };
};

export default {
    startInstantCallTimer,
    cancelInstantCall,
    acceptInstantCall,
    declineInstantCall,
    getInstantCallStatus
};
