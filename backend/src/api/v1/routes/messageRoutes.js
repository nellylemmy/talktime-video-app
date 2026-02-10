/**
 * Message Routes
 * Two-way chat messaging between volunteers and students
 */
import express from 'express';
import pool from '../../../config/database.js';
import { createJWTMiddleware } from '../../../utils/jwt.js';
import { getIO } from '../../../socket.js';
import * as notificationService from '../../../services/notificationService.js';

const router = express.Router();

// Create JWT middleware that allows both volunteers and students
const chatJWTMiddleware = createJWTMiddleware(['volunteer', 'student']);

/**
 * @route   POST /api/v1/messages/send
 * @desc    Send a chat message to another user
 * @access  Private (Volunteers and Students)
 */
router.post('/send', chatJWTMiddleware, async (req, res) => {
    try {
        const senderId = req.user.id;
        const senderRole = req.user.role;
        const { recipientId, content } = req.body;

        // Validate input
        if (!recipientId || !content) {
            return res.status(400).json({
                success: false,
                message: 'recipientId and content are required'
            });
        }

        if (content.length > 2000) {
            return res.status(400).json({
                success: false,
                message: 'Message content too long (max 2000 characters)'
            });
        }

        // Verify recipient exists and get their info
        const recipientQuery = await pool.query(
            `SELECT id, full_name, role FROM users WHERE id = $1`,
            [recipientId]
        );

        if (recipientQuery.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Recipient not found'
            });
        }

        const recipient = recipientQuery.rows[0];

        // Get sender name
        const senderQuery = await pool.query(
            `SELECT full_name, profile_image FROM users WHERE id = $1`,
            [senderId]
        );
        const senderName = senderQuery.rows[0]?.full_name || 'User';
        const senderImage = senderQuery.rows[0]?.profile_image || null;

        // Save message to database
        const insertQuery = `
            INSERT INTO messages (
                sender_id,
                recipient_id,
                content,
                type,
                is_read,
                created_at
            ) VALUES ($1, $2, $3, $4, FALSE, NOW())
            RETURNING id, content, created_at
        `;

        const result = await pool.query(insertQuery, [
            senderId,
            recipientId,
            content,
            'direct' // Type for regular chat messages
        ]);

        const savedMessage = result.rows[0];

        console.log(`[Chat] Message saved: ${senderId} -> ${recipientId}, ID: ${savedMessage.id}`);

        // Get Socket.IO instance and emit real-time event
        try {
            const io = getIO();
            const recipientRole = recipient.role;

            // Prepare message data for Socket.IO
            const messageData = {
                id: savedMessage.id,
                senderId,
                senderName,
                senderImage,
                senderRole,
                recipientId,
                content: savedMessage.content,
                createdAt: savedMessage.created_at,
                type: 'chat'
            };

            // Emit to recipient's room (use only one room to avoid duplicates)
            const recipientRoom = `user_${recipientId}`;

            io.to(recipientRoom).emit('new-chat-message', messageData);

            // Also emit notification badge update and sound trigger
            io.to(recipientRoom).emit('notification-badge-update', {
                increment: 1,
                timestamp: new Date().toISOString()
            });

            io.to(recipientRoom).emit('notification-sound-trigger', {
                sound_type: 'new_message',
                priority: 'medium',
                notification: { type: 'new_message' }
            });

            console.log(`[Chat] Real-time message sent to room: ${recipientRoom}`);

        } catch (socketError) {
            console.error('[Chat] Socket.IO error (continuing):', socketError.message);
        }

        // Create in-app notification for recipient
        try {
            await notificationService.sendNotification({
                recipient_id: recipientId,
                recipient_role: recipient.role,
                title: 'New Message',
                message: `${senderName}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
                type: 'new_message',
                priority: 'medium',
                metadata: {
                    sender_id: senderId,
                    sender_name: senderName,
                    sender_role: senderRole,
                    message_id: savedMessage.id,
                    action_url: senderRole === 'volunteer'
                        ? '/student/dashboard#messages'
                        : '/volunteer/dashboard/messages'
                }
            }, ['in-app', 'push'], {
                persistent: true,
                tag: `chat_${senderId}_${recipientId}`
            });
        } catch (notifError) {
            console.error('[Chat] Notification error (continuing):', notifError.message);
        }

        res.json({
            success: true,
            message: {
                id: savedMessage.id,
                content: savedMessage.content,
                createdAt: savedMessage.created_at
            }
        });

    } catch (error) {
        console.error('Error sending chat message:', error);
        res.status(500).json({
            success: false,
            message: 'Server error sending message'
        });
    }
});

/**
 * @route   GET /api/v1/messages/conversation/:userId
 * @desc    Get conversation with a specific user
 * @access  Private (Volunteers and Students)
 */
router.get('/conversation/:userId', chatJWTMiddleware, async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const otherUserId = parseInt(req.params.userId);

        // Validate
        if (!otherUserId || isNaN(otherUserId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID'
            });
        }

        // Get conversation messages
        const query = `
            SELECT
                m.id,
                m.sender_id,
                m.recipient_id,
                m.content,
                m.type,
                m.is_read,
                m.created_at,
                sender.full_name as sender_name,
                sender.profile_image as sender_image,
                sender.role as sender_role
            FROM messages m
            LEFT JOIN users sender ON m.sender_id = sender.id
            WHERE (m.sender_id = $1 AND m.recipient_id = $2)
               OR (m.sender_id = $2 AND m.recipient_id = $1)
            ORDER BY m.created_at ASC
            LIMIT 100
        `;

        const { rows } = await pool.query(query, [currentUserId, otherUserId]);

        // Get other user info
        const userQuery = await pool.query(
            `SELECT id, full_name, role, profile_image FROM users WHERE id = $1`,
            [otherUserId]
        );
        const otherUser = userQuery.rows[0] || null;

        res.json({
            success: true,
            otherUser: otherUser ? {
                id: otherUser.id,
                name: otherUser.full_name,
                role: otherUser.role,
                image: otherUser.profile_image
            } : null,
            messages: rows.map(msg => ({
                id: msg.id,
                senderId: msg.sender_id,
                recipientId: msg.recipient_id,
                content: msg.content,
                type: msg.type,
                isRead: msg.is_read,
                createdAt: msg.created_at,
                senderName: msg.sender_name,
                senderImage: msg.sender_image,
                senderRole: msg.sender_role,
                isSentByMe: msg.sender_id === currentUserId
            }))
        });

    } catch (error) {
        console.error('Error fetching conversation:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching conversation'
        });
    }
});

export default router;
