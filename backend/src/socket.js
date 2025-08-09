import { Server } from 'socket.io';
import http from 'http';

// Socket.IO instance
let io;

/**
 * Initialize Socket.IO with an HTTP server
 * @param {http.Server} server - HTTP server instance
 */
export const initializeSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: '*', // In production, this should be restricted
            methods: ['GET', 'POST']
        }
    });

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
            const { roomId, userId, userType } = data;
            if (roomId) {
                socket.join(`call-${roomId}`);
                console.log(`${userType} ${userId} joined call room: call-${roomId}`);
                
                // Notify others in the room
                socket.to(`call-${roomId}`).emit('user-joined', {
                    userId,
                    userType,
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
