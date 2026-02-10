import redisClient from '../config/redis.js';
import pool from '../config/database.js';
import { getTimerConfig } from '../config/appConfig.js';

// Active timers map
const activeTimers = new Map();

// Cached config (refreshed periodically)
let timerConfig = null;
let configLastFetched = 0;
const CONFIG_REFRESH_INTERVAL = 60000; // Refresh config every minute

/**
 * Get timer configuration (with caching)
 */
async function getConfig() {
    const now = Date.now();
    if (!timerConfig || now - configLastFetched > CONFIG_REFRESH_INTERVAL) {
        timerConfig = await getTimerConfig();
        configLastFetched = now;
        console.log(`[Call Service] Timer config loaded: ${timerConfig.durationMinutes} min duration`);
    }
    return timerConfig;
}

/**
 * Start the meeting timer for a room
 * Emits warnings at configured intervals, then auto-ends
 */
export const startMeetingTimer = async (io, roomId, meetingId) => {
    // Don't start if already running
    if (activeTimers.has(roomId)) {
        console.log(`[Call Service] Timer already running for room ${roomId}`);
        return activeTimers.get(roomId);
    }

    // Get configurable timer settings
    const config = await getConfig();
    const { durationMs, warning1Ms, warning2Ms, warning1Minutes, warning2Minutes, durationMinutes } = config;

    const startTime = Date.now();
    const timerState = {
        roomId,
        meetingId,
        startTime,
        endTime: startTime + durationMs,
        warned5min: false,  // Keeping legacy names for compatibility
        warned1min: false,
        config
    };

    // Store timer state in Redis for persistence
    redisClient.hset(`timer:${roomId}`, {
        meetingId: meetingId?.toString() || '',
        startTime: startTime.toString(),
        endTime: timerState.endTime.toString(),
        durationMs: durationMs.toString(),
        warning1Ms: warning1Ms.toString(),
        warning2Ms: warning2Ms.toString()
    });
    redisClient.expire(`timer:${roomId}`, 3600); // 1 hour TTL

    // Main timer loop - check every 10 seconds
    const intervalId = setInterval(async () => {
        const elapsed = Date.now() - startTime;
        const remaining = durationMs - elapsed;

        // First warning (e.g., 5 minutes remaining)
        if (!timerState.warned5min && elapsed >= warning1Ms) {
            timerState.warned5min = true;
            io.to(roomId).emit('meeting-timer-warning', {
                roomId,
                meetingId,
                remainingMs: remaining,
                remainingMinutes: warning1Minutes,
                message: `${warning1Minutes} minutes remaining in the call`
            });
            console.log(`[Call Service] ${warning1Minutes}-minute warning sent for room ${roomId}`);
        }

        // Second warning (e.g., 1 minute remaining)
        if (!timerState.warned1min && elapsed >= warning2Ms) {
            timerState.warned1min = true;
            io.to(roomId).emit('meeting-timer-warning', {
                roomId,
                meetingId,
                remainingMs: remaining,
                remainingMinutes: warning2Minutes,
                message: `${warning2Minutes} minute${warning2Minutes === 1 ? '' : 's'} remaining in the call`
            });
            console.log(`[Call Service] ${warning2Minutes}-minute warning sent for room ${roomId}`);
        }

        // Timer expired - auto-end meeting
        if (elapsed >= durationMs) {
            await endMeetingTimer(io, roomId, meetingId, 'timer_expired');
        }
    }, 10000); // Check every 10 seconds

    timerState.intervalId = intervalId;
    activeTimers.set(roomId, timerState);

    // Emit timer started event with config
    io.to(roomId).emit('meeting-timer-start', {
        roomId,
        meetingId,
        durationMs,
        durationMinutes,
        startTime,
        endTime: timerState.endTime,
        warnings: {
            first: { ms: warning1Ms, minutes: warning1Minutes },
            second: { ms: warning2Ms, minutes: warning2Minutes }
        }
    });

    console.log(`[Call Service] Meeting timer started for room ${roomId}, ${durationMinutes}min duration, ends at ${new Date(timerState.endTime).toISOString()}`);
    return timerState;
};

/**
 * End the meeting timer and clean up
 */
export const endMeetingTimer = async (io, roomId, meetingId, reason = 'manual') => {
    const timerState = activeTimers.get(roomId);

    if (timerState && timerState.intervalId) {
        clearInterval(timerState.intervalId);
    }

    activeTimers.delete(roomId);
    await redisClient.del(`timer:${roomId}`);

    // Update meeting status in database
    if (meetingId) {
        try {
            const newStatus = reason === 'timer_expired' ? 'completed' : 'completed';
            await pool.query(`
                UPDATE meetings
                SET status = $1,
                    actual_end_time = NOW(),
                    updated_at = NOW()
                WHERE id = $2 AND status = 'in_progress'
            `, [newStatus, meetingId]);
            console.log(`[Call Service] Meeting ${meetingId} marked as ${newStatus}`);
        } catch (error) {
            console.error('[Call Service] Error updating meeting status:', error);
        }
    }

    // Emit meeting end event
    io.to(roomId).emit('meeting-auto-end', {
        roomId,
        meetingId,
        reason,
        message: reason === 'timer_expired'
            ? 'Meeting time has ended'
            : 'Meeting has ended'
    });

    // Force disconnect all participants
    io.to(roomId).emit('meeting-force-end', {
        roomId,
        meetingId,
        reason,
        redirectUrl: '/dashboard'
    });

    console.log(`[Call Service] Meeting timer ended for room ${roomId}, reason: ${reason}`);
};

/**
 * Get remaining time for a room's meeting
 */
export const getRemainingTime = async (roomId) => {
    const timerState = activeTimers.get(roomId);

    if (timerState) {
        const remaining = timerState.endTime - Date.now();
        return Math.max(0, remaining);
    }

    // Check Redis for persisted timer
    const timerData = await redisClient.hgetall(`timer:${roomId}`);
    if (timerData && timerData.endTime) {
        const remaining = parseInt(timerData.endTime) - Date.now();
        return Math.max(0, remaining);
    }

    return null;
};

/**
 * Check if timer is running for a room
 */
export const isTimerRunning = (roomId) => {
    return activeTimers.has(roomId);
};

/**
 * Recover timers from Redis after service restart
 */
export const recoverTimers = async (io) => {
    console.log('[Call Service] Recovering persisted timers...');

    const config = await getConfig();

    const keys = await redisClient.keys('timer:*');
    let recovered = 0;

    for (const key of keys) {
        const roomId = key.replace('timer:', '');
        const timerData = await redisClient.hgetall(key);

        if (timerData && timerData.endTime) {
            const endTime = parseInt(timerData.endTime);
            const remaining = endTime - Date.now();

            // Use stored config or current config
            const durationMs = timerData.durationMs ? parseInt(timerData.durationMs) : config.durationMs;
            const warning1Ms = timerData.warning1Ms ? parseInt(timerData.warning1Ms) : config.warning1Ms;
            const warning2Ms = timerData.warning2Ms ? parseInt(timerData.warning2Ms) : config.warning2Ms;

            if (remaining > 0) {
                // Timer still has time - recreate it
                const startTime = parseInt(timerData.startTime);
                const meetingId = timerData.meetingId ? parseInt(timerData.meetingId) : null;

                const timerState = {
                    roomId,
                    meetingId,
                    startTime,
                    endTime,
                    warned5min: (Date.now() - startTime) >= warning1Ms,
                    warned1min: (Date.now() - startTime) >= warning2Ms,
                    config: { durationMs, warning1Ms, warning2Ms }
                };

                // Set up the interval
                const intervalId = setInterval(async () => {
                    const elapsed = Date.now() - startTime;
                    const rem = durationMs - elapsed;

                    if (!timerState.warned5min && elapsed >= warning1Ms) {
                        timerState.warned5min = true;
                        io.to(roomId).emit('meeting-timer-warning', {
                            roomId, meetingId, remainingMs: rem, remainingMinutes: config.warning1Minutes
                        });
                    }

                    if (!timerState.warned1min && elapsed >= warning2Ms) {
                        timerState.warned1min = true;
                        io.to(roomId).emit('meeting-timer-warning', {
                            roomId, meetingId, remainingMs: rem, remainingMinutes: config.warning2Minutes
                        });
                    }

                    if (elapsed >= durationMs) {
                        await endMeetingTimer(io, roomId, meetingId, 'timer_expired');
                    }
                }, 10000);

                timerState.intervalId = intervalId;
                activeTimers.set(roomId, timerState);
                recovered++;
            } else {
                // Timer expired while service was down - end the meeting
                const meetingId = timerData.meetingId ? parseInt(timerData.meetingId) : null;
                await endMeetingTimer(io, roomId, meetingId, 'timer_expired');
            }
        }
    }

    console.log(`[Call Service] Recovered ${recovered} active timers`);
};

export default {
    startMeetingTimer,
    endMeetingTimer,
    getRemainingTime,
    isTimerRunning,
    recoverTimers
};
