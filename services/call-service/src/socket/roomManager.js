import { v4 as uuidv4 } from 'uuid';
import redisClient from '../config/redis.js';
import pool from '../config/database.js';

// In-memory room state (backed by Redis for persistence)
const rooms = new Map();

/**
 * Room data structure:
 * {
 *   id: string (UUID),
 *   meetingId: number,
 *   participants: Map<socketId, { peerId, role, userId, joinedAt }>,
 *   createdAt: Date,
 *   timerStarted: boolean,
 *   timerStartedAt: Date | null
 * }
 */

export const createRoom = async (roomId) => {
    if (!roomId) {
        roomId = uuidv4();
    }

    const room = {
        id: roomId,
        meetingId: null,
        participants: new Map(),
        createdAt: new Date(),
        timerStarted: false,
        timerStartedAt: null
    };

    rooms.set(roomId, room);

    // Persist to Redis
    await redisClient.hset(`room:${roomId}`, {
        id: roomId,
        createdAt: room.createdAt.toISOString(),
        timerStarted: 'false',
        participantCount: '0'
    });
    await redisClient.expire(`room:${roomId}`, 7200); // 2 hours TTL

    console.log(`[Call Service] Room created: ${roomId}`);
    return room;
};

export const getRoom = async (roomId) => {
    // Check memory first
    if (rooms.has(roomId)) {
        return rooms.get(roomId);
    }

    // Check Redis
    const roomData = await redisClient.hgetall(`room:${roomId}`);
    if (roomData && roomData.id) {
        const room = {
            id: roomData.id,
            meetingId: roomData.meetingId ? parseInt(roomData.meetingId) : null,
            participants: new Map(),
            createdAt: new Date(roomData.createdAt),
            timerStarted: roomData.timerStarted === 'true',
            timerStartedAt: roomData.timerStartedAt ? new Date(roomData.timerStartedAt) : null
        };
        rooms.set(roomId, room);
        return room;
    }

    return null;
};

export const joinRoom = async (roomId, socketId, participantData) => {
    let room = await getRoom(roomId);

    if (!room) {
        room = await createRoom(roomId);
    }

    room.participants.set(socketId, {
        ...participantData,
        joinedAt: new Date()
    });

    // Update Redis
    await redisClient.hset(`room:${roomId}`, 'participantCount', room.participants.size.toString());

    // Store participant mapping
    await redisClient.set(`socket:${socketId}:room`, roomId, 'EX', 7200);

    console.log(`[Call Service] User joined room ${roomId}, total participants: ${room.participants.size}`);
    return room;
};

export const leaveRoom = async (roomId, socketId) => {
    const room = await getRoom(roomId);
    if (!room) return null;

    const participant = room.participants.get(socketId);
    room.participants.delete(socketId);

    // Update Redis
    await redisClient.hset(`room:${roomId}`, 'participantCount', room.participants.size.toString());
    await redisClient.del(`socket:${socketId}:room`);

    console.log(`[Call Service] User left room ${roomId}, remaining participants: ${room.participants.size}`);

    // Clean up empty rooms
    if (room.participants.size === 0) {
        rooms.delete(roomId);
        await redisClient.del(`room:${roomId}`);
        console.log(`[Call Service] Room ${roomId} deleted (empty)`);
    }

    return { room, participant };
};

export const getRoomBySocketId = async (socketId) => {
    const roomId = await redisClient.get(`socket:${socketId}:room`);
    if (!roomId) return null;
    return getRoom(roomId);
};

export const getParticipantCount = async (roomId) => {
    const room = await getRoom(roomId);
    return room ? room.participants.size : 0;
};

export const setMeetingId = async (roomId, meetingId) => {
    const room = await getRoom(roomId);
    if (room) {
        room.meetingId = meetingId;
        await redisClient.hset(`room:${roomId}`, 'meetingId', meetingId.toString());
    }
};

export const startTimer = async (roomId) => {
    const room = await getRoom(roomId);
    if (room && !room.timerStarted) {
        room.timerStarted = true;
        room.timerStartedAt = new Date();

        await redisClient.hset(`room:${roomId}`, {
            timerStarted: 'true',
            timerStartedAt: room.timerStartedAt.toISOString()
        });

        console.log(`[Call Service] Timer started for room ${roomId}`);
        return room.timerStartedAt;
    }
    return room?.timerStartedAt || null;
};

export const getTimerState = async (roomId) => {
    const room = await getRoom(roomId);
    if (!room) return null;

    return {
        started: room.timerStarted,
        startedAt: room.timerStartedAt,
        elapsedMs: room.timerStartedAt ? Date.now() - room.timerStartedAt.getTime() : 0
    };
};

export const getAllRooms = () => {
    return Array.from(rooms.entries()).map(([id, room]) => ({
        id,
        participantCount: room.participants.size,
        timerStarted: room.timerStarted,
        createdAt: room.createdAt
    }));
};

export default {
    createRoom,
    getRoom,
    joinRoom,
    leaveRoom,
    getRoomBySocketId,
    getParticipantCount,
    setMeetingId,
    startTimer,
    getTimerState,
    getAllRooms
};
