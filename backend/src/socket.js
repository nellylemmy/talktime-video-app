import { Server } from 'socket.io';
import http from 'http';
import pool from './config/database.js';
import Redis from 'ioredis';

// Socket.IO instance
let io;

// Redis subscriber for real-time notifications
let notificationSubscriber = null;

/**
 * Initialize Redis subscriber for real-time notifications from notification-service
 */
const initializeNotificationSubscriber = () => {
    const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

    try {
        notificationSubscriber = new Redis(redisUrl);

        notificationSubscriber.on('connect', () => {
            console.log('📡 Redis notification subscriber connected');
        });

        notificationSubscriber.on('error', (err) => {
            console.error('❌ Redis notification subscriber error:', err.message);
        });

        // Subscribe to notification channel
        notificationSubscriber.subscribe('talktime:notifications:realtime', (err, count) => {
            if (err) {
                console.error('❌ Failed to subscribe to notifications channel:', err);
            } else {
                console.log(`✅ Subscribed to talktime:notifications:realtime (${count} channels)`);
            }
        });

        // Handle incoming notification messages
        notificationSubscriber.on('message', (channel, message) => {
            if (channel === 'talktime:notifications:realtime') {
                try {
                    const data = JSON.parse(message);
                    handleRealtimeNotification(data);
                } catch (parseError) {
                    console.error('❌ Error parsing notification message:', parseError);
                }
            }
        });

    } catch (error) {
        console.error('❌ Failed to initialize notification subscriber:', error);
    }
};

/**
 * Handle real-time notification from notification-service
 */
const handleRealtimeNotification = (data) => {
    if (!io) {
        console.error('❌ Socket.IO not initialized, cannot forward notification');
        return;
    }

    const { type, recipient_id, recipient_role, notification, recipients } = data;

    // Handle meeting auto-launch (special case with multiple recipients)
    if (type === 'meeting-auto-launch' && data.data) {
        console.log(`🚀 Forwarding meeting auto-launch event`);
        const launchData = data.data;

        // Emit to both volunteer and student (using primary room only to avoid duplicates)
        if (recipients && Array.isArray(recipients)) {
            recipients.forEach(recipient => {
                const primaryRoom = `${recipient.role}_${recipient.id}`;
                io.to(primaryRoom).emit('meeting-auto-launch', {
                    ...launchData,
                    timestamp: new Date().toISOString()
                });
                console.log(`🚀 Auto-launch event sent to room: ${primaryRoom}`);
            });
        }
        return;
    }

    console.log(`📬 Forwarding real-time notification to ${recipient_role}_${recipient_id}:`, notification?.title);

    // Use a single primary room to avoid duplicate notifications
    // The user joins multiple rooms but we only emit to one to prevent duplicates
    const primaryRoom = `${recipient_role}_${recipient_id}`;

    // Emit the generic new-notification event to the primary room only
    io.to(primaryRoom).emit('new-notification', {
        notification,
        timestamp: new Date().toISOString()
    });

    // Emit badge update to the primary room only
    io.to(primaryRoom).emit('notification-badge-update', {
        increment: 1,
        timestamp: new Date().toISOString()
    });

    // Emit specific meeting events based on notification type to trigger UI updates
    const notificationType = notification?.type;
    const metadata = notification?.metadata || {};

    if (notificationType) {
        let specificEvent = null;
        let eventData = {
            meetingId: metadata.meeting_id,
            roomId: metadata.room_id,
            message: notification?.message,
            timestamp: new Date().toISOString()
        };

        switch (notificationType) {
            case 'meeting_scheduled':
            case 'meeting_scheduled_confirmation':
                specificEvent = 'meeting-scheduled';
                eventData.scheduledTime = metadata.scheduled_time;
                eventData.volunteerName = metadata.volunteer_name;
                eventData.studentName = metadata.student_name;
                break;

            case 'meeting_rescheduled':
                specificEvent = 'meeting-rescheduled';
                eventData.oldTime = metadata.original_time;
                eventData.newTime = metadata.new_time;
                eventData.rescheduledBy = metadata.rescheduled_by;
                eventData.volunteerName = metadata.volunteer_name;
                eventData.studentName = metadata.student_name;
                break;

            case 'meeting_canceled':
                specificEvent = 'meeting-canceled';
                eventData.originalTime = metadata.original_time;
                eventData.canceledBy = metadata.canceled_by;
                eventData.canceledByRole = metadata.canceled_by_role;
                eventData.volunteerName = metadata.volunteer_name;
                eventData.studentName = metadata.student_name;
                break;

            case 'meeting_completed':
            case 'meeting_ended':
                specificEvent = 'meeting-completed';
                eventData.duration = metadata.duration;
                eventData.status = metadata.status;
                eventData.volunteerName = metadata.volunteer_name;
                eventData.studentName = metadata.student_name;
                break;

            case 'meeting_missed':
                specificEvent = 'meeting-missed';
                eventData.scheduledTime = metadata.scheduled_time;
                eventData.reason = metadata.reason;
                eventData.volunteerName = metadata.volunteer_name;
                eventData.studentName = metadata.student_name;
                break;

            case 'meeting_reminder_5min':
            case 'meeting_reminder_10min':
            case 'meeting_reminder_30min':
                specificEvent = 'meeting-reminder';
                eventData.minutesBefore = notificationType.includes('5min') ? 5 :
                                          notificationType.includes('10min') ? 10 : 30;
                eventData.scheduledTime = metadata.scheduled_time;
                break;
        }

        // Emit the specific event if we have one (to primary room only)
        if (specificEvent) {
            io.to(primaryRoom).emit(specificEvent, eventData);
            console.log(`📢 Emitted specific event '${specificEvent}' to room: ${primaryRoom}`);
        }
    }

    console.log(`✅ Notification forwarded to room: ${primaryRoom}`);
};

/**
 * Initialize Socket.IO with an HTTP server
 * @param {http.Server} server - HTTP server instance
 */
export const initializeSocket = (server) => {
    console.log('🔌 Initializing Socket.IO...');
    io = new Server(server, {
        cors: {
            origin: '*', // In production, this should be restricted
            methods: ['GET', 'POST']
        }
    });
    console.log('✅ Socket.IO initialized successfully');

    // Initialize Redis subscriber for real-time notifications
    initializeNotificationSubscriber();

    // Socket.IO connection event
    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);
        
        // Store rooms that socket is in
        const socketRooms = new Map();

        // Join room for user-specific notifications (updated for meeting termination)
        socket.on('join-user-room', (data) => {
            const { userId, role, rooms } = data;
            console.log(`🔌 Socket ${socket.id} joining user rooms:`, data);
            
            if (userId && role) {
                // Join multiple rooms for comprehensive notification coverage
                const roomsToJoin = rooms || [
                    `user_${userId}`,
                    `${role}_${userId}`
                ];
                
                roomsToJoin.forEach(roomName => {
                    socket.join(roomName);
                    console.log(`✅ Socket ${socket.id} joined room: ${roomName}`);
                });
                
                // Store user info on socket for debugging
                socket.userId = userId;
                socket.userRole = role;
                
                console.log(`🎯 Socket ${socket.id} ready for meeting termination notifications (user: ${userId}, role: ${role})`);
            } else {
                console.log(`❌ Invalid join-user-room data:`, data);
            }
        });

        // Simple join-room event for compatibility with enhanced-instant-call-ui.js and call.html
        socket.on('join-room', (roomName) => {
            if (roomName) {
                socket.join(roomName);
                console.log(`✅ Socket ${socket.id} joined room via join-room: ${roomName}`);

                // Extract user info from room name if possible
                if (roomName.includes('student_') || roomName.includes('student-')) {
                    socket.userRole = 'student';
                    socket.userId = roomName.replace('student_', '').replace('student-', '');
                } else if (roomName.includes('volunteer_') || roomName.includes('volunteer-')) {
                    socket.userRole = 'volunteer';
                    socket.userId = roomName.replace('volunteer_', '').replace('volunteer-', '');
                } else if (roomName.includes('user_')) {
                    socket.userId = roomName.replace('user_', '');
                }
            }
        });

        // ===== WebRTC Signaling Implementation =====
        
        // Handle room join for WebRTC
        socket.on('join', (roomId) => {
            console.log(`Socket ${socket.id} joining WebRTC room: ${roomId}`);
            
            // Store the room this socket is joining
            socketRooms.set(socket.id, roomId);
            
            // Get all sockets in the room
            const roomClients = io.sockets.adapter.rooms.get(roomId);
            const numClients = roomClients ? roomClients.size : 0;
            
            if (numClients === 0) {
                // First client joining the room
                socket.join(roomId);
                socket.emit('createdRoom');
                console.log(`Client ${socket.id} created room ${roomId}`);
            } else {
                // Additional clients joining the room
                socket.join(roomId);
                socket.emit('joinedRoom');
                console.log(`Client ${socket.id} joined room ${roomId}`);
                
                // Notify existing clients about new user
                socket.to(roomId).emit('newUser', socket.id);
            }
        });
        
        // Handle WebRTC offer
        socket.on('offer', (desc, toId) => {
            console.log(`Relaying offer from ${socket.id} to ${toId}`);
            io.to(toId).emit('offer', desc, socket.id);
        });
        
        // Handle WebRTC answer
        socket.on('answer', (desc, toId) => {
            console.log(`Relaying answer from ${socket.id} to ${toId}`);
            io.to(toId).emit('answer', desc, socket.id);
        });
        
        // Handle ICE candidates
        socket.on('iceCandidate', (candidate, toId) => {
            console.log(`Relaying ICE candidate from ${socket.id} to ${toId}`);
            io.to(toId).emit('iceCandidate', candidate, socket.id);
        });
        
        // Handle kick user (admin only)
        socket.on('kickUser', (userId) => {
            console.log(`User ${socket.id} attempting to kick ${userId}`);
            const roomId = socketRooms.get(socket.id);
            if (roomId) {
                io.to(userId).emit('kicked');
            }
        });

        // Handle call ended by volunteer - broadcast to all in room
        socket.on('call-ended', (data) => {
            console.log(`📞 Call ended by ${socket.id}:`, data);
            const roomId = data.room || socketRooms.get(socket.id);
            if (roomId) {
                // Broadcast to all OTHER participants in the room
                socket.to(roomId).emit('call-ended', {
                    endedBy: data.endedBy || 'volunteer',
                    reason: data.reason || 'Call ended',
                    timestamp: new Date().toISOString()
                });
                console.log(`✅ Broadcasted call-ended to room ${roomId}`);
            }
        });

        // Handle instant call request
        socket.on('instant-call-request', (data) => {
            const { studentId, meetingId } = data;
            if (studentId) {
                io.to(`student-${studentId}`).emit('instant-call-request', {
                    ...data,
                    timestamp: new Date().toISOString()
                });
                console.log(`Instant call request sent to student-${studentId} for meeting ${meetingId}`);
            }
        });

        // Handle instant call response (accept/decline)
        socket.on('instant-call-response', (data) => {
            const { volunteerId, response, meetingId, message } = data;
            if (volunteerId) {
                // Try multiple room formats to ensure volunteer receives the message
                const volunteerRooms = [
                    `volunteer_${volunteerId}`,
                    `volunteer-${volunteerId}`,
                    `user_${volunteerId}`
                ];

                const responseData = {
                    ...data,
                    timestamp: new Date().toISOString()
                };

                // Emit to all possible room formats
                volunteerRooms.forEach(room => {
                    io.to(room).emit('instant-call-response', responseData);
                });

                console.log(`📞 Instant call ${response} sent to volunteer ${volunteerId} (rooms: ${volunteerRooms.join(', ')}) for meeting ${meetingId}`);
                if (message) {
                    console.log(`   Message: ${message}`);
                }
            }
        });

        // Handle chat messages (two-way messaging, separate from instant-message which ends calls)
        socket.on('chat-message', async (data) => {
            const { recipientId, content, recipientRole } = data;
            const senderId = socket.userId;
            const senderRole = socket.userRole;

            console.log(`[Chat] chat-message from ${senderRole} ${senderId} to ${recipientRole} ${recipientId}`);

            if (!recipientId || !content) {
                console.error('[Chat] Missing recipientId or content');
                socket.emit('chat-message-error', {
                    error: 'Missing recipientId or content',
                    timestamp: new Date().toISOString()
                });
                return;
            }

            try {
                // Get sender info
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
                    'direct'
                ]);

                const savedMessage = result.rows[0];

                // Prepare message data
                const messageData = {
                    id: savedMessage.id,
                    senderId,
                    senderName,
                    senderImage,
                    senderRole,
                    recipientId,
                    content: savedMessage.content,
                    createdAt: savedMessage.created_at,
                    type: 'direct'
                };

                // Emit to recipient's room (use only one room to avoid duplicates)
                const recipientRoom = `user_${recipientId}`;

                io.to(recipientRoom).emit('new-chat-message', messageData);

                // Emit badge update and sound trigger
                io.to(recipientRoom).emit('notification-badge-update', {
                    increment: 1,
                    timestamp: new Date().toISOString()
                });
                io.to(recipientRoom).emit('notification-sound-trigger', {
                    sound_type: 'new_message',
                    priority: 'medium',
                    notification: { type: 'new_message' }
                });

                // Confirm to sender
                socket.emit('chat-message-sent', {
                    messageId: savedMessage.id,
                    recipientId,
                    content: savedMessage.content,
                    createdAt: savedMessage.created_at,
                    timestamp: new Date().toISOString()
                });

                console.log(`[Chat] Message ${savedMessage.id} sent and saved`);

            } catch (error) {
                console.error('[Chat] Error handling chat-message:', error);
                socket.emit('chat-message-error', {
                    error: 'Failed to send message',
                    originalContent: content,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Handle instant call timeout - student didn't respond
        socket.on('instant-call-no-response', (data) => {
            const { roomId, volunteerId, studentId, reason, message } = data;
            console.log('⏰ Instant call no response:', { roomId, volunteerId, reason });

            // Notify the volunteer that the student didn't respond
            // Send to the call room (where volunteer is waiting)
            if (roomId) {
                io.to(roomId).emit('instant-call-timeout', {
                    roomId,
                    volunteerId,
                    studentId,
                    reason: reason || 'timeout',
                    message: message || 'Student did not respond to the call',
                    timestamp: new Date().toISOString()
                });
                console.log(`📤 Sent instant-call-timeout to room: ${roomId}`);
            }

            // Also send directly to volunteer's personal room as backup
            if (volunteerId) {
                const volunteerRooms = [
                    `volunteer_${volunteerId}`,
                    `user_${volunteerId}`
                ];
                volunteerRooms.forEach(room => {
                    io.to(room).emit('instant-call-timeout', {
                        roomId,
                        volunteerId,
                        studentId,
                        reason: reason || 'timeout',
                        message: message || 'Student did not respond to the call',
                        timestamp: new Date().toISOString()
                    });
                });
                console.log(`📤 Sent instant-call-timeout to volunteer rooms: ${volunteerRooms.join(', ')}`);
            }
        });

        // Handle instant messages during calls
        socket.on('instant-message', async (data) => {
            let { volunteerId, studentId, message, senderRole, meetingId } = data;
            console.log(`💬 Instant message from ${senderRole}:`, message);
            console.log(`   volunteerId: ${volunteerId}, studentId: ${studentId} (from students table)`);

            // Use socket's stored user info as fallback
            if (!studentId && senderRole === 'student' && socket.userId) {
                studentId = socket.userId;
                console.log(`📋 Using socket userId as studentId: ${studentId}`);
            }
            if (!volunteerId && senderRole === 'volunteer' && socket.userId) {
                volunteerId = socket.userId;
                console.log(`📋 Using socket userId as volunteerId: ${volunteerId}`);
            }

            // Validate we have both IDs
            if (!volunteerId || !studentId) {
                console.error('❌ Missing required IDs for message:', { volunteerId, studentId });
                socket.emit('message-error', {
                    error: 'Missing user identification',
                    originalMessage: message
                });
                return;
            }

            try {
                // CRITICAL: Convert studentId from students.id to users.id
                // The studentId coming from callData is students.id, but we need users.id for messages
                let studentUserId = studentId;
                let studentName = 'Student';

                const studentLookup = await pool.query(
                    'SELECT user_id, full_name FROM students WHERE id = $1',
                    [studentId]
                );

                if (studentLookup.rows.length > 0) {
                    studentUserId = studentLookup.rows[0].user_id;
                    studentName = studentLookup.rows[0].full_name || 'Student';
                    console.log(`📋 Converted students.id ${studentId} to users.id ${studentUserId} (${studentName})`);
                } else {
                    // Fallback: studentId might already be a users.id, try to look it up
                    const userLookup = await pool.query(
                        'SELECT id, full_name FROM users WHERE id = $1',
                        [studentId]
                    );
                    if (userLookup.rows.length > 0) {
                        studentUserId = userLookup.rows[0].id;
                        studentName = userLookup.rows[0].full_name || 'Student';
                        console.log(`📋 studentId ${studentId} is already a users.id (${studentName})`);
                    }
                }

                // Get volunteer name
                let volunteerName = 'Volunteer';
                const volunteerLookup = await pool.query(
                    'SELECT full_name FROM users WHERE id = $1',
                    [volunteerId]
                );
                if (volunteerLookup.rows.length > 0) {
                    volunteerName = volunteerLookup.rows[0].full_name || 'Volunteer';
                }

                // Determine sender and recipient based on role using users.id
                const senderId = senderRole === 'student' ? studentUserId : volunteerId;
                const recipientId = senderRole === 'student' ? volunteerId : studentUserId;
                const senderName = senderRole === 'student' ? studentName : volunteerName;

                console.log(`📝 Saving message: sender=${senderId} (${senderName}), recipient=${recipientId}`);

                // Save message to database with correct users.id
                const query = `
                    INSERT INTO messages (
                        sender_id,
                        recipient_id,
                        content,
                        type,
                        meeting_id,
                        created_at
                    ) VALUES ($1, $2, $3, $4, $5, NOW())
                    RETURNING id, created_at
                `;

                const result = await pool.query(query, [
                    senderId,
                    recipientId,
                    message,
                    'direct',  // Use 'direct' type so it shows in regular messages
                    meetingId || null
                ]);

                console.log(`✅ Message saved to database with ID: ${result.rows[0].id}`);

                // Forward message to recipient with proper sender info
                const recipientRooms = senderRole === 'student'
                    ? [`volunteer_${volunteerId}`, `volunteer-${volunteerId}`, `user_${volunteerId}`]
                    : [`student_${studentUserId}`, `student-${studentUserId}`, `user_${studentUserId}`];

                const messageData = {
                    messageId: result.rows[0].id,
                    senderId,
                    senderRole,
                    message,
                    timestamp: result.rows[0].created_at,
                    // Include sender object for frontend compatibility
                    sender: {
                        id: senderId,
                        name: senderName,
                        role: senderRole
                    }
                };

                // Emit to all possible room formats
                recipientRooms.forEach(room => {
                    io.to(room).emit('instant-message-received', messageData);
                });

                // Also emit as regular chat message so it shows in messages list
                recipientRooms.forEach(room => {
                    io.to(room).emit('new-chat-message', {
                        id: result.rows[0].id,
                        senderId,
                        senderName,
                        senderRole,
                        recipientId,
                        content: message,
                        createdAt: result.rows[0].created_at,
                        type: 'direct'
                    });
                });

                // Send back to sender for confirmation with call-end signal
                socket.emit('message-sent-confirmation', {
                    messageId: result.rows[0].id,
                    timestamp: result.rows[0].created_at,
                    callEnded: true
                });

                // Notify volunteer that student sent a message and ended the call
                recipientRooms.forEach(room => {
                    io.to(room).emit('instant-call-ended-by-student', {
                        studentId: studentUserId,
                        studentName,
                        message: message,
                        reason: 'student_sent_message',
                        timestamp: new Date().toISOString()
                    });
                });

                // Update the meeting status to 'declined' when student sends a message
                if (senderRole === 'student') {
                    try {
                        const updateResult = await pool.query(`
                            UPDATE meetings
                            SET status = 'declined', updated_at = NOW()
                            WHERE student_id = $1
                            AND volunteer_id = $2
                            AND is_instant = TRUE
                            AND status = 'pending'
                            AND created_at > NOW() - INTERVAL '10 minutes'
                            RETURNING id
                        `, [studentUserId, volunteerId]);

                        if (updateResult.rows.length > 0) {
                            console.log(`✅ Meeting ${updateResult.rows[0].id} marked as declined`);
                        } else {
                            console.log('⚠️ No pending instant call found to update');
                        }
                    } catch (updateError) {
                        console.error('❌ Error updating meeting status:', updateError);
                    }
                }

                console.log('📞 Call ended by student after sending message');
            } catch (error) {
                console.error('❌ Error handling instant message:', error);
                socket.emit('message-error', {
                    error: 'Failed to send message',
                    originalMessage: message
                });
            }
        });

        // Handle user joined call
        socket.on('user-joined-call', async (data) => {
            const { roomId, userId, userType, meetingId, studentId, volunteerName } = data;
            if (roomId) {
                socket.join(`call-${roomId}`);
                console.log(`${userType} ${userId} joined call room: call-${roomId}`);

                // Store meeting info on socket
                socket.meetingId = meetingId;
                socket.roomId = roomId;
                socket.participantId = userId;
                socket.participantType = userType;

                // Get number of participants in the call room
                const callRoom = io.sockets.adapter.rooms.get(`call-${roomId}`);
                const participantCount = callRoom ? callRoom.size : 1;

                console.log(`📊 Call room call-${roomId} now has ${participantCount} participants`);

                // Notify others in the room about new participant
                socket.to(`call-${roomId}`).emit('user-joined', {
                    userId,
                    userType,
                    participantCount,
                    timestamp: new Date().toISOString()
                });

                // ==========================================
                // VOLUNTEER JOINED - NOTIFY STUDENT DASHBOARD
                // ==========================================
                // When volunteer joins first, notify the student's dashboard
                // so they see an "incoming call" notification
                if (userType === 'volunteer' && participantCount === 1) {
                    console.log(`📞 Volunteer joined first - notifying student dashboard`);

                    // Try to get student ID from the meeting if not provided
                    let targetStudentId = studentId;
                    if (!targetStudentId && meetingId) {
                        try {
                            const meetingResult = await pool.query(
                                'SELECT student_id FROM meetings WHERE id = $1 OR room_id = $2',
                                [meetingId, roomId]
                            );
                            if (meetingResult.rows[0]) {
                                targetStudentId = meetingResult.rows[0].student_id;
                            }
                        } catch (err) {
                            console.log('Could not fetch student ID from meeting:', err.message);
                        }
                    }

                    if (targetStudentId) {
                        // Emit to student's dashboard rooms (they're not in call room yet)
                        const studentRooms = [
                            `student_${targetStudentId}`,
                            `user_${targetStudentId}`,
                            `notifications_student_${targetStudentId}`
                        ];

                        const incomingCallData = {
                            type: 'scheduled-meeting-started',
                            meetingId,
                            roomId,
                            volunteerId: userId,
                            volunteerName: volunteerName || 'Your volunteer',
                            callUrl: `/call/call.html?room=${roomId}&role=student`,
                            message: `${volunteerName || 'Your volunteer'} has joined and is waiting for you!`,
                            timestamp: new Date().toISOString()
                        };

                        studentRooms.forEach(room => {
                            io.to(room).emit('scheduled-meeting-started', incomingCallData);
                            io.to(room).emit('incoming-scheduled-call', incomingCallData);
                        });

                        console.log(`✅ Notified student ${targetStudentId} about incoming scheduled call`);
                    }
                }

                // If this is the second participant joining, start the 40-minute timer
                if (participantCount === 2 && meetingId) {
                    console.log(`🚀 Starting 40-minute timer for meeting ${meetingId} - both participants joined`);

                    // Emit timer start event to all participants
                    io.to(`call-${roomId}`).emit('meeting-timer-start', {
                        meetingId,
                        duration: 40 * 60, // 40 minutes in seconds
                        startTime: new Date().toISOString(),
                        message: '40-minute session timer started!'
                    });
                }

                // Send participant joined event with meeting context
                io.to(`call-${roomId}`).emit('participant-joined-room', {
                    meetingId,
                    participantId: userId,
                    participantType: userType,
                    participantCount,
                    isSecondParticipant: participantCount === 2,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Handle user left call
        socket.on('user-left-call', (data) => {
            const { roomId, userId, userType } = data;
            if (roomId) {
                socket.leave(`call-${roomId}`);
                console.log(`${userType} ${userId} left call room: call-${roomId}`);
                
                // Notify others in the room
                socket.to(`call-${roomId}`).emit('user-left', {
                    userId,
                    userType,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Handle notification room join
        socket.on('join-notification-room', (data) => {
            const { userId, role } = data;
            if (userId && role) {
                const notificationRoom = `notifications_${role}_${userId}`;
                socket.join(notificationRoom);
                console.log(`Socket ${socket.id} joined notification room: ${notificationRoom}`);
                
                // Store notification room info
                socket.notificationRoom = notificationRoom;
                socket.userId = userId;
                socket.userRole = role;
            }
        });

        // Handle mark notification as read
        socket.on('notification-read', (data) => {
            const { notificationId, userId, role } = data;
            // Broadcast to all sessions of this user that notification was read
            const notificationRoom = `notifications_${role}_${userId}`;
            socket.to(notificationRoom).emit('notification-marked-read', {
                notificationId,
                timestamp: new Date().toISOString()
            });
        });

        // Handle mark all notifications as read
        socket.on('notifications-read-all', (data) => {
            const { userId, role } = data;
            const notificationRoom = `notifications_${role}_${userId}`;
            socket.to(notificationRoom).emit('notifications-marked-all-read', {
                timestamp: new Date().toISOString()
            });
        });

        // ===== Meeting Timer Events =====
        
        // Handle meeting timer warnings (sent from frontend timer)
        socket.on('meeting-timer-warning', (data) => {
            const { roomId, meetingId, minutesRemaining, message } = data;
            if (roomId) {
                console.log(`⏰ Timer warning for meeting ${meetingId}: ${minutesRemaining} minutes remaining`);
                
                // Broadcast warning to all participants in the room
                io.to(`call-${roomId}`).emit('meeting-timer-warning', {
                    meetingId,
                    minutesRemaining,
                    message: message || `${minutesRemaining} minutes remaining in your session`,
                    timestamp: new Date().toISOString(),
                    urgency: minutesRemaining <= 2 ? 'high' : minutesRemaining <= 5 ? 'medium' : 'low'
                });
            }
        });
        
        // Handle automatic meeting end when timer expires
        socket.on('meeting-timer-expired', (data) => {
            const { roomId, meetingId } = data;
            if (roomId) {
                console.log(`⏰ Timer expired for meeting ${meetingId} - auto-ending meeting`);
                
                // Broadcast auto-end event to all participants
                io.to(`call-${roomId}`).emit('meeting-auto-end', {
                    meetingId,
                    reason: 'timer_expired',
                    message: '40-minute session completed. Thank you for your participation!',
                    redirectUrl: '/dashboard',
                    timestamp: new Date().toISOString()
                });
                
                // Force disconnect all participants from the call room after a delay
                setTimeout(() => {
                    const callRoom = io.sockets.adapter.rooms.get(`call-${roomId}`);
                    if (callRoom) {
                        callRoom.forEach(socketId => {
                            const participantSocket = io.sockets.sockets.get(socketId);
                            if (participantSocket) {
                                participantSocket.leave(`call-${roomId}`);
                                participantSocket.emit('meeting-force-end', {
                                    meetingId,
                                    reason: 'session_timeout',
                                    message: 'Session has ended automatically',
                                    forceRedirect: true
                                });
                            }
                        });
                    }
                }, 5000); // 5 second delay to allow UI updates
            }
        });
        
        // Handle manual meeting end
        socket.on('end-meeting', (data) => {
            const { roomId, meetingId, reason, endedBy } = data;
            if (roomId) {
                console.log(`🔚 Meeting ${meetingId} ended manually by ${endedBy}`);
                
                // Notify all participants
                socket.to(`call-${roomId}`).emit('meeting-ended', {
                    meetingId,
                    reason: reason || 'ended_by_participant',
                    endedBy,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
            
            // Clean up WebRTC rooms
            const roomId = socketRooms.get(socket.id);
            if (roomId) {
                socket.to(roomId).emit('removeUser', socket.id);
                console.log(`Notified room ${roomId} that user ${socket.id} disconnected`);
                socketRooms.delete(socket.id);
            }
        });
    });

    return io;
};

/**
 * Get the Socket.IO instance
 * @returns {Server} Socket.IO server instance
 */
export const getIO = () => {
    if (!io) {
        throw new Error('Socket.IO not initialized');
    }
    return io;
};

// Export the io instance for use in other modules
export { io };
