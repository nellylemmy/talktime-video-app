import express from 'express';
import {
    getAllMeetings,
    getMeetingById,
    getMeetingByRoomId,
    createMeeting,
    updateMeeting,
    cancelMeeting,
    endMeeting,
    getMeetingsByStudentId,
    getUpcomingMeetings,
    getPastMeetings
} from '../controllers/meetingController.js';
import { adminOrVolunteerAuth, jwtAuth, adminAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Volunteer meetings
router.get('/upcoming', adminOrVolunteerAuth, getUpcomingMeetings);
router.get('/past', adminOrVolunteerAuth, getPastMeetings);

// CRUD operations
router.get('/', adminAuth, getAllMeetings);
router.get('/:id', jwtAuth, getMeetingById);
router.get('/room/:roomId', jwtAuth, getMeetingByRoomId);
router.post('/', adminOrVolunteerAuth, createMeeting);
router.put('/:id', adminOrVolunteerAuth, updateMeeting);
router.delete('/:id', adminOrVolunteerAuth, cancelMeeting);

// Meeting lifecycle
router.post('/:meetingId/end', jwtAuth, endMeeting);
router.get('/student/:studentId', adminOrVolunteerAuth, getMeetingsByStudentId);

export default router;
