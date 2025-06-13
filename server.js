const path = require('path');
const express = require('express');
const app = express();
const socketIO = require('socket.io');

const port = process.env.PORT || 5051;
const env = process.env.NODE_ENV || 'development';

// Redirect to https
app.get('*', (req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https' && env !== 'development') {
        return res.redirect(['https://', req.get('Host'), req.url].join(''));
    }
    next();
});

// Disable caching for development
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'node_modules')));

const server = require('http').createServer(app);
server.listen(port, () => {
    console.log(`listening on port ${port}`);
});

/**
 * Socket.io events
 */
const io = socketIO(server);
const roomAdmins = {}; // Using robust, multi-room admin tracking

io.sockets.on('connection', function (socket) {
    /**
     * Log actions to the client
     */
    function log() {
        const array = ['Server:'];
        array.push.apply(array, arguments);
        socket.emit('log', array);
    }

    /**
     * Handle message from a client (from reference repo)
     */
    socket.on('message', (message, toId = null, room = null) => {
        log('Client ' + socket.id + ' said: ', message);

        if (toId) {
            io.to(toId).emit('message', message, socket.id);
        } else if (room) {
            socket.broadcast.to(room).emit('message', message, socket.id);
        } else {
            socket.broadcast.emit('message', message, socket.id);
        }
    });

    /**
     * When room gets created or someone joins it (from reference repo)
     */
    socket.on('create or join', (room) => {
        log('Create or Join room: ' + room);

        const clientsInRoom = io.sockets.adapter.rooms.get(room);
        let numClients = clientsInRoom ? clientsInRoom.size : 0;
        log('Room ' + room + ' has ' + numClients + ' client(s)');

        if (numClients === 0) {
            // Create room
            socket.join(room);
            roomAdmins[room] = socket.id; // Store admin for this room
            socket.emit('created', room, socket.id);
        } else {
            log('Client ' + socket.id + ' joined room ' + room);

            // Join room
            io.sockets.in(room).emit('join', room); // Notify users in room
            socket.join(room);
            io.to(socket.id).emit('joined', room, socket.id); // Notify client that they joined a room
            io.sockets.in(room).emit('ready', socket.id); // Room is ready for creating connections
        }
    });

    /**
     * Kick participant from a call (from reference repo, adapted for multi-room admin)
     */
    socket.on('kickout', (socketId, room) => {
        if (socket.id === roomAdmins[room]) {
            log(`Admin ${socket.id} kicking ${socketId} from room ${room}`);
            socket.broadcast.to(room).emit('kickout', socketId);
            const kickedSocket = io.sockets.sockets.get(socketId);
            if (kickedSocket) {
                kickedSocket.leave(room);
            }
        } else {
            log(`Unauthorized kick attempt by ${socket.id} in room ${room}`);
        }
    });

    // participant leaves room (from reference repo)
    socket.on('leave room', (room) => {
        socket.leave(room);
        socket.emit('left room', room);
        socket.broadcast.to(room).emit('message', { type: 'leave' }, socket.id);
    });

    /**
     * When participant leaves, notify other participants (from reference repo)
     */
    socket.on('disconnecting', () => {
        socket.rooms.forEach((room) => {
            if (room === socket.id) return;

            // Clean up admin mapping if the admin is the one disconnecting
            if (roomAdmins[room] && socket.id === roomAdmins[room]) {
                delete roomAdmins[room];
            }

            socket.broadcast
                .to(room)
                .emit('message', { type: 'leave' }, socket.id);
        });
    });
});
