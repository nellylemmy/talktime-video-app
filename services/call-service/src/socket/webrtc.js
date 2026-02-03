import roomManager from './roomManager.js';
import { startMeetingTimer, endMeetingTimer, getRemainingTime } from '../timer/meetingTimer.js';
import pool from '../config/database.js';

/**
 * Setup WebRTC signaling handlers for a socket
 */
export const setupWebRTCHandlers = (io, socket) => {
    /**
     * Join a room for WebRTC signaling
     */
    socket.on('join', async (data) => {
        try {
            const { roomId, peerId, role, userId, meetingId } = data;

            if (!roomId) {
                socket.emit('error', { message: 'Room ID is required' });
                return;
            }

            // Leave any previous room
            const previousRoom = await roomManager.getRoomBySocketId(socket.id);
            if (previousRoom) {
                await roomManager.leaveRoom(previousRoom.id, socket.id);
                socket.leave(previousRoom.id);
            }

            // Join Socket.IO room
            socket.join(roomId);

            // Join room manager
            const room = await roomManager.joinRoom(roomId, socket.id, {
                peerId,
                role,
                userId
            });

            // Associate meeting ID if provided
            if (meetingId) {
                await roomManager.setMeetingId(roomId, meetingId);
            }

            // Get existing peers in room (excluding self)
            const existingPeers = [];
            room.participants.forEach((participant, socketId) => {
                if (socketId !== socket.id) {
                    existingPeers.push({
                        peerId: participant.peerId,
                        role: participant.role,
                        userId: participant.userId
                    });
                }
            });

            // Determine if this is room creator or joiner
            const isCreator = room.participants.size === 1;

            if (isCreator) {
                socket.emit('createdRoom', {
                    roomId,
                    peerId,
                    isCreator: true
                });
            } else {
                socket.emit('joinedRoom', {
                    roomId,
                    peerId,
                    isCreator: false,
                    existingPeers
                });

                // Notify existing participants
                socket.to(roomId).emit('user-joined-call', {
                    roomId,
                    peerId,
                    role,
                    userId,
                    socketId: socket.id
                });
            }

            // Check if we should start the meeting timer (both participants present)
            if (room.participants.size === 2 && !room.timerStarted && meetingId) {
                await roomManager.startTimer(roomId);
                startMeetingTimer(io, roomId, meetingId);

                // Update meeting status to in_progress
                try {
                    await pool.query(`
                        UPDATE meetings
                        SET status = 'in_progress',
                            actual_start_time = NOW(),
                            updated_at = NOW()
                        WHERE id = $1 AND status = 'scheduled'
                    `, [meetingId]);
                } catch (dbError) {
                    console.error('[Call Service] Error updating meeting status:', dbError);
                }
            }

            // If joining existing room with timer, send remaining time
            if (room.timerStarted) {
                const remaining = await getRemainingTime(roomId);
                if (remaining !== null) {
                    socket.emit('meeting-timer-sync', {
                        roomId,
                        remainingMs: remaining,
                        endTime: Date.now() + remaining
                    });
                }
            }

            console.log(`[Call Service] User ${userId || 'unknown'} (${role || 'unknown'}) joined room ${roomId}`);
        } catch (error) {
            console.error('[Call Service] Error in join:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    /**
     * WebRTC Offer
     */
    socket.on('offer', (data) => {
        const { roomId, offer, targetPeerId } = data;
        console.log(`[Call Service] Relaying offer in room ${roomId}`);
        socket.to(roomId).emit('offer', {
            offer,
            peerId: data.peerId,
            fromSocketId: socket.id
        });
    });

    /**
     * WebRTC Answer
     */
    socket.on('answer', (data) => {
        const { roomId, answer, targetPeerId } = data;
        console.log(`[Call Service] Relaying answer in room ${roomId}`);
        socket.to(roomId).emit('answer', {
            answer,
            peerId: data.peerId,
            fromSocketId: socket.id
        });
    });

    /**
     * ICE Candidate
     */
    socket.on('iceCandidate', (data) => {
        const { roomId, candidate } = data;
        socket.to(roomId).emit('iceCandidate', {
            candidate,
            peerId: data.peerId,
            fromSocketId: socket.id
        });
    });

    /**
     * Leave room
     */
    socket.on('leave', async (data) => {
        const { roomId } = data;
        await handleLeaveRoom(io, socket, roomId);
    });

    /**
     * End meeting (manual)
     */
    socket.on('end-meeting', async (data) => {
        const { roomId, meetingId, reason = 'manual' } = data;

        console.log(`[Call Service] End meeting request for room ${roomId}`);

        // Notify all participants
        io.to(roomId).emit('meeting-terminated', {
            roomId,
            meetingId,
            reason,
            message: 'Meeting has been ended'
        });

        // End the timer
        if (meetingId) {
            await endMeetingTimer(io, roomId, meetingId, reason);
        }
    });

    /**
     * Handle disconnect
     */
    socket.on('disconnect', async () => {
        const room = await roomManager.getRoomBySocketId(socket.id);
        if (room) {
            await handleLeaveRoom(io, socket, room.id);
        }
    });
};

/**
 * Handle user leaving a room
 */
const handleLeaveRoom = async (io, socket, roomId) => {
    try {
        const result = await roomManager.leaveRoom(roomId, socket.id);

        if (result && result.participant) {
            socket.leave(roomId);

            // Notify other participants
            io.to(roomId).emit('user-left-call', {
                roomId,
                peerId: result.participant.peerId,
                userId: result.participant.userId,
                role: result.participant.role,
                socketId: socket.id
            });

            console.log(`[Call Service] User ${result.participant.userId || 'unknown'} left room ${roomId}`);

            // If room is now empty or has 1 person, consider ending meeting
            const count = await roomManager.getParticipantCount(roomId);
            if (count <= 1 && result.room?.meetingId) {
                // Give 2 minutes for reconnection before auto-ending
                setTimeout(async () => {
                    const currentCount = await roomManager.getParticipantCount(roomId);
                    if (currentCount <= 1) {
                        await endMeetingTimer(io, roomId, result.room.meetingId, 'participant_left');
                    }
                }, 120000); // 2 minute grace period
            }
        }
    } catch (error) {
        console.error('[Call Service] Error leaving room:', error);
    }
};

export default { setupWebRTCHandlers };
