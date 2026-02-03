import { v4 as uuidv4 } from 'uuid';
import {
    startInstantCallTimer,
    cancelInstantCall,
    acceptInstantCall,
    declineInstantCall,
    getInstantCallStatus
} from '../timer/instantCallTimer.js';
import { isUserOnline, sendToUser } from './presence.js';
import pool from '../config/database.js';

/**
 * Setup instant call handlers
 */
export const setupInstantCallHandlers = (io, socket) => {
    /**
     * Volunteer initiates instant call to student
     */
    socket.on('instant-call-request', async (data) => {
        try {
            const { volunteerId, studentId, volunteerName } = data;

            if (!volunteerId || !studentId) {
                socket.emit('instant-call-error', { message: 'Missing required fields' });
                return;
            }

            // Check if student is online
            const studentOnline = await isUserOnline(studentId);
            if (!studentOnline) {
                socket.emit('instant-call-error', {
                    message: 'Student is not currently online'
                });
                return;
            }

            // Check for existing pending instant call
            const existingCall = await pool.query(`
                SELECT id FROM instant_calls
                WHERE student_id = $1
                AND status = 'pending'
                AND created_at > NOW() - INTERVAL '5 minutes'
            `, [studentId]);

            if (existingCall.rows.length > 0) {
                socket.emit('instant-call-error', {
                    message: 'Student already has a pending instant call'
                });
                return;
            }

            // Generate call ID and room ID
            const callId = uuidv4();
            const roomId = uuidv4();

            // Store instant call in database
            await pool.query(`
                INSERT INTO instant_calls (id, volunteer_id, student_id, room_id, status)
                VALUES ($1, $2, $3, $4, 'pending')
            `, [callId, volunteerId, studentId, roomId]);

            // Start 3-minute timer
            startInstantCallTimer(io, callId, volunteerId, studentId, roomId);

            // Notify student
            sendToUser(io, studentId, 'instant-call-incoming', {
                callId,
                roomId,
                volunteerId,
                volunteerName: volunteerName || 'Volunteer',
                expiresIn: 180000 // 3 minutes in ms
            });

            // Confirm to volunteer
            socket.emit('instant-call-sent', {
                callId,
                roomId,
                studentId,
                expiresIn: 180000
            });

            console.log(`[Call Service] Instant call ${callId} from volunteer ${volunteerId} to student ${studentId}`);
        } catch (error) {
            console.error('[Call Service] Error in instant-call-request:', error);
            socket.emit('instant-call-error', { message: 'Failed to initiate instant call' });
        }
    });

    /**
     * Student responds to instant call
     */
    socket.on('instant-call-response', async (data) => {
        try {
            const { callId, accepted, studentId } = data;

            if (!callId) {
                socket.emit('instant-call-error', { message: 'Call ID is required' });
                return;
            }

            if (accepted) {
                const callData = await acceptInstantCall(io, callId);

                if (callData) {
                    // Update database
                    await pool.query(`
                        UPDATE instant_calls
                        SET status = 'accepted', answered_at = NOW()
                        WHERE id = $1
                    `, [callId]);

                    // Tell student to join the room
                    socket.emit('instant-call-join', {
                        callId,
                        roomId: callData.roomId
                    });
                }
            } else {
                await declineInstantCall(io, callId);

                // Update database
                await pool.query(`
                    UPDATE instant_calls
                    SET status = 'declined', answered_at = NOW()
                    WHERE id = $1
                `, [callId]);
            }
        } catch (error) {
            console.error('[Call Service] Error in instant-call-response:', error);
            socket.emit('instant-call-error', { message: 'Failed to process response' });
        }
    });

    /**
     * Cancel instant call (volunteer can cancel before student responds)
     */
    socket.on('instant-call-cancel', async (data) => {
        try {
            const { callId, volunteerId } = data;

            if (!callId) {
                socket.emit('instant-call-error', { message: 'Call ID is required' });
                return;
            }

            await cancelInstantCall(io, callId, 'volunteer_cancelled');

            // Update database
            await pool.query(`
                UPDATE instant_calls
                SET status = 'cancelled'
                WHERE id = $1 AND volunteer_id = $2
            `, [callId, volunteerId]);

            socket.emit('instant-call-cancelled', { callId, reason: 'cancelled' });
        } catch (error) {
            console.error('[Call Service] Error in instant-call-cancel:', error);
        }
    });

    /**
     * Get instant call status
     */
    socket.on('instant-call-status', async (data, callback) => {
        try {
            const { callId } = data;
            const status = await getInstantCallStatus(callId);

            if (typeof callback === 'function') {
                callback(status);
            } else {
                socket.emit('instant-call-status-response', status);
            }
        } catch (error) {
            console.error('[Call Service] Error getting instant call status:', error);
        }
    });

    /**
     * Instant messaging during call
     */
    socket.on('instant-message', (data) => {
        const { roomId, message, senderId, senderName } = data;

        if (!roomId || !message) return;

        // Broadcast to room
        socket.to(roomId).emit('instant-message', {
            message,
            senderId,
            senderName,
            timestamp: new Date().toISOString()
        });
    });
};

export default { setupInstantCallHandlers };
