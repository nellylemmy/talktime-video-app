// server.js
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new socketIO.Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from "public" folder
app.use(express.static('public'));

io.on('connection', socket => {
  console.log(`Client connected [id=${socket.id}]`);
  socket.emit('log', [`Connected as ${socket.id}`]);

  socket.on('join', roomId => {
    const room = io.sockets.adapter.rooms.get(roomId);
    const clientsInRoom = room ? Array.from(room) : [];

    // Notify the new user about everyone already in the room.
    clientsInRoom.forEach(clientId => {
        socket.emit('newUser', clientId);
    });

    // Join the room
    socket.join(roomId);
    socket.emit('createdRoom', clientsInRoom.length === 0);
    socket.emit('joinedRoom', clientsInRoom.length > 0);
    io.to(roomId).emit('log', [`${socket.id} joined room ${roomId}`]);

    // Notify all OTHER peers in room of new user
    socket.to(roomId).emit('newUser', socket.id);
  });

  socket.on('offer', (offer, toId) => {
    io.to(toId).emit('offer', offer, socket.id);
    io.to(toId).emit('log', [`Forwarded offer from ${socket.id} to ${toId}`]);
  });

  socket.on('answer', (answer, toId) => {
    io.to(toId).emit('answer', answer, socket.id);
    io.to(toId).emit('log', [`Forwarded answer from ${socket.id} to ${toId}`]);
  });

  socket.on('iceCandidate', (candidate, toId) => {
    io.to(toId).emit('iceCandidate', candidate, socket.id);
    io.to(toId).emit('log', [`Forwarded ICE candidate from ${socket.id} to ${toId}`]);
  });

  socket.on('kickUser', userId => {
    io.to(userId).emit('removeUser', socket.id);
    io.to(userId).emit('log', [`${socket.id} kicked ${userId}`]);
  });

  socket.on('disconnecting', () => {
    const rooms = socket.rooms;
    rooms.forEach(roomId => {
      if (roomId !== socket.id) {
        socket.to(roomId).emit('removeUser', socket.id);
        io.to(roomId).emit('log', [`${socket.id} is leaving room ${roomId}`]);
      }
    });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected [id=${socket.id}]`);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
