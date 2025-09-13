import { Server } from 'socket.io';
import http from 'http';

// Socket.IO instance
let io;

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
            const { volunteerId, response, meetingId } = data;
            if (volunteerId) {
                io.to(`volunteer-${volunteerId}`).emit('instant-call-response', {
                    ...data,
                    timestamp: new Date().toISOString()
                });
                console.log(`Instant call ${response} sent to volunteer-${volunteerId} for meeting ${meetingId}`);
            }
        });

        // Handle user joined call
        socket.on('user-joined-call', (data) => {
            const { roomId, userId, userType, meetingId } = data;
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
                    
                    // Trigger student call notification when volunteer joins
                    if (userType === 'volunteer') {
                        // Find student in the room and send them the incoming call notification
                        setTimeout(() => {
                            io.to(`call-${roomId}`).emit('student-incoming-call', {
                                meetingId,
                                volunteerName: data.volunteerName || 'Volunteer',
                                volunteerId: userId,
                                message: 'Your volunteer has joined the meeting!',
                                timestamp: new Date().toISOString()
                            });
                        }, 1000); // Small delay to ensure student is ready
                    }
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
