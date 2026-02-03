import redisClient from '../config/redis.js';
import pool from '../config/database.js';

// Meeting duration: 40 minutes
const MEETING_DURATION_MS = 40 * 60 * 1000;
const WARNING_5MIN_MS = 35 * 60 * 1000; // 5 min before end
const WARNING_1MIN_MS = 39 * 60 * 1000; // 1 min before end

// Active timers map
const activeTimers = new Map();

/**
 * Start the meeting timer for a room
 * Emits warnings at 5min and 1min remaining, then auto-ends
 */
export const startMeetingTimer = (io, roomId, meetingId) => {
    // Don't start if already running
    if (activeTimers.has(roomId)) {
        console.log(`[Call Service] Timer already running for room ${roomId}`);
        return activeTimers.get(roomId);
    }

    const startTime = Date.now();
    const timerState = {
        roomId,
        meetingId,
        startTime,
        endTime: startTime + MEETING_DURATION_MS,
        warned5min: false,
        warned1min: false
    };

    // Store timer state in Redis for persistence
    redisClient.hset(`timer:${roomId}`, {
        meetingId: meetingId?.toString() || '',
        startTime: startTime.toString(),
        endTime: timerState.endTime.toString()
    });
    redisClient.expire(`timer:${roomId}`, 3600); // 1 hour TTL

    // Main timer loop - check every 10 seconds
    const intervalId = setInterval(async () => {
        const elapsed = Date.now() - startTime;
        const remaining = MEETING_DURATION_MS - elapsed;

        // 5-minute warning
        if (!timerState.warned5min && elapsed >= WARNING_5MIN_MS) {
            timerState.warned5min = true;
            io.to(roomId).emit('meeting-timer-warning', {
                roomId,
                meetingId,
                remainingMs: remaining,
                remainingMinutes: 5,
                message: '5 minutes remaining in the call'
            });
            console.log(`[Call Service] 5-minute warning sent for room ${roomId}`);
        }

        // 1-minute warning
        if (!timerState.warned1min && elapsed >= WARNING_1MIN_MS) {
            timerState.warned1min = true;
            io.to(roomId).emit('meeting-timer-warning', {
                roomId,
                meetingId,
                remainingMs: remaining,
                remainingMinutes: 1,
                message: '1 minute remaining in the call'
            });
            console.log(`[Call Service] 1-minute warning sent for room ${roomId}`);
        }

        // Timer expired - auto-end meeting
        if (elapsed >= MEETING_DURATION_MS) {
            await endMeetingTimer(io, roomId, meetingId, 'timer_expired');
        }
    }, 10000); // Check every 10 seconds

    timerState.intervalId = intervalId;
    activeTimers.set(roomId, timerState);

    // Emit timer started event
    io.to(roomId).emit('meeting-timer-start', {
        roomId,
        meetingId,
        durationMs: MEETING_DURATION_MS,
        startTime,
        endTime: timerState.endTime
    });

    console.log(`[Call Service] Meeting timer started for room ${roomId}, ends at ${new Date(timerState.endTime).toISOString()}`);
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

    const keys = await redisClient.keys('timer:*');
    let recovered = 0;

    for (const key of keys) {
        const roomId = key.replace('timer:', '');
        const timerData = await redisClient.hgetall(key);

        if (timerData && timerData.endTime) {
            const endTime = parseInt(timerData.endTime);
            const remaining = endTime - Date.now();

            if (remaining > 0) {
                // Timer still has time - recreate it
                const startTime = parseInt(timerData.startTime);
                const meetingId = timerData.meetingId ? parseInt(timerData.meetingId) : null;

                const timerState = {
                    roomId,
                    meetingId,
                    startTime,
                    endTime,
                    warned5min: (Date.now() - startTime) >= WARNING_5MIN_MS,
                    warned1min: (Date.now() - startTime) >= WARNING_1MIN_MS
                };

                // Set up the interval
                const intervalId = setInterval(async () => {
                    const elapsed = Date.now() - startTime;
                    const rem = MEETING_DURATION_MS - elapsed;

                    if (!timerState.warned5min && elapsed >= WARNING_5MIN_MS) {
                        timerState.warned5min = true;
                        io.to(roomId).emit('meeting-timer-warning', {
                            roomId, meetingId, remainingMs: rem, remainingMinutes: 5
                        });
                    }

                    if (!timerState.warned1min && elapsed >= WARNING_1MIN_MS) {
                        timerState.warned1min = true;
                        io.to(roomId).emit('meeting-timer-warning', {
                            roomId, meetingId, remainingMs: rem, remainingMinutes: 1
                        });
                    }

                    if (elapsed >= MEETING_DURATION_MS) {
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
