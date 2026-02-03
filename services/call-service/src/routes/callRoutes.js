import express from 'express';
import roomManager from '../socket/roomManager.js';
import { getRemainingTime, isTimerRunning } from '../timer/meetingTimer.js';
import { getInstantCallStatus } from '../timer/instantCallTimer.js';

const router = express.Router();

/**
 * Get room info
 */
router.get('/rooms/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        const room = await roomManager.getRoom(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                error: 'Room not found'
            });
        }

        const participants = [];
        room.participants.forEach((p, socketId) => {
            participants.push({
                peerId: p.peerId,
                role: p.role,
                userId: p.userId,
                joinedAt: p.joinedAt
            });
        });

        res.json({
            success: true,
            room: {
                id: room.id,
                meetingId: room.meetingId,
                participantCount: participants.length,
                participants,
                timerStarted: room.timerStarted,
                timerStartedAt: room.timerStartedAt,
                createdAt: room.createdAt
            }
        });
    } catch (error) {
        console.error('[Call Service] Error getting room:', error);
        res.status(500).json({ success: false, error: 'Failed to get room info' });
    }
});

/**
 * Get all active rooms
 */
router.get('/rooms', (req, res) => {
    try {
        const rooms = roomManager.getAllRooms();
        res.json({
            success: true,
            rooms,
            count: rooms.length
        });
    } catch (error) {
        console.error('[Call Service] Error getting rooms:', error);
        res.status(500).json({ success: false, error: 'Failed to get rooms' });
    }
});

/**
 * Get timer status for a room
 */
router.get('/rooms/:roomId/timer', async (req, res) => {
    try {
        const { roomId } = req.params;
        const remaining = await getRemainingTime(roomId);
        const running = isTimerRunning(roomId);

        res.json({
            success: true,
            timer: {
                roomId,
                running,
                remainingMs: remaining,
                remainingMinutes: remaining ? Math.floor(remaining / 60000) : null
            }
        });
    } catch (error) {
        console.error('[Call Service] Error getting timer:', error);
        res.status(500).json({ success: false, error: 'Failed to get timer status' });
    }
});

/**
 * Get instant call status
 */
router.get('/instant-calls/:callId', async (req, res) => {
    try {
        const { callId } = req.params;
        const status = await getInstantCallStatus(callId);

        if (!status) {
            return res.status(404).json({
                success: false,
                error: 'Instant call not found'
            });
        }

        res.json({
            success: true,
            call: status
        });
    } catch (error) {
        console.error('[Call Service] Error getting instant call:', error);
        res.status(500).json({ success: false, error: 'Failed to get instant call status' });
    }
});

export default router;
