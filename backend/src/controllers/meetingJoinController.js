/**
 * Meeting Join Controller
 * Handles secure meeting access and student authentication flow
 */
import pool from '../config/database.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

function createMeetingAccessUrl(token) {
    const base = process.env.BASE_URL || '';
    const path = `/api/v1/meeting/join/${token}`;
    return base ? `${base}${path}` : path;
}

/**
 * Generate and store secure access token for a meeting
 * Called when a meeting is created or scheduled
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function generateMeetingAccessToken(req, res) {
    try {
        const { meetingId } = req.params;
        const { expiryHours = 24 } = req.body;
        
        // Permission: volunteer who owns meeting or admin
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        let whereClause = 'WHERE m.id = $1';
        const params = [meetingId];
        if (user.role === 'volunteer') {
            whereClause += ' AND m.volunteer_id = $2';
            params.push(user.id);
        } else if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // Get meeting details (no legacy joins)
        const meetingResult = await pool.query(`
            SELECT m.*
            FROM meetings m
            ${whereClause}
        `, params);
        
        if (meetingResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Meeting not found'
            });
        }
        
        const meeting = meetingResult.rows[0];
        
        // Generate opaque access token and expiry
        const token = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + Number(expiryHours) * 60 * 60 * 1000);
        
        // Store token in database
        await pool.query(`
            UPDATE meetings 
            SET student_access_token = $1, access_token_expires_at = $2
            WHERE id = $3
        `, [token, expiresAt, meetingId]);
        
        // Create meeting access URL
        const accessUrl = createMeetingAccessUrl(token);
        
        res.json({
            success: true,
            token,
            accessUrl,
            expiresAt,
            meeting: {
                id: meeting.id,
                scheduledTime: meeting.scheduled_time,
                studentId: meeting.student_id,
                volunteerId: meeting.volunteer_id
            }
        });
        
    } catch (error) {
        console.error('Error generating meeting access token:', error);
        res.status(500).json({
            error: 'Failed to generate meeting access token',
            message: error.message
        });
    }
}

/**
 * Handle meeting join request with secure token
 * This is the main entry point for /meeting/join/{token}
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function joinMeetingWithToken(req, res) {
    try {
        // Meeting access validation is handled by middleware
        // If we reach here, access is granted
        const { meeting, token, authenticatedUser } = req.meetingAccess;
        
        // Update meeting status to active if it's scheduled
        if (meeting.status === 'scheduled') {
            await pool.query(`
                UPDATE meetings 
                SET status = 'active'
                WHERE id = $1
            `, [meeting.id]);
        }
        
        // Return meeting room data for frontend
        res.json({
            success: true,
            meeting: {
                id: meeting.id,
                roomId: meeting.room_id,
                scheduledTime: meeting.scheduled_time,
                status: 'active',
                student: {
                    id: meeting.student_id,
                    name: meeting.student_name,
                    admissionNumber: meeting.admission_number
                },
                volunteer: {
                    id: meeting.volunteer_id,
                    name: meeting.volunteer_name
                }
            },
            user: {
                id: authenticatedUser.id,
                name: authenticatedUser.fullName || authenticatedUser.full_name || null,
                role: authenticatedUser.role
            },
            redirectTo: `/meeting/room/${meeting.room_id}`
        });
        
    } catch (error) {
        console.error('Error joining meeting:', error);
        res.status(500).json({
            error: 'Failed to join meeting',
            message: error.message
        });
    }
}

/**
 * Get meeting access status and information
 * Used for pre-join validation and UI display
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getMeetingAccessStatus(req, res) {
    try {
        const { meeting, authenticatedUser } = req.meetingAccess;
        
        res.json({
            success: true,
            meeting: {
                id: meeting.id,
                scheduledTime: meeting.scheduled_time,
                status: meeting.status,
                student: {
                    name: meeting.student_name,
                    admissionNumber: meeting.admission_number
                },
                volunteer: {
                    name: meeting.volunteer_name
                }
            },
            user: {
                id: authenticatedUser.id,
                name: authenticatedUser.fullName || authenticatedUser.full_name || null,
                role: authenticatedUser.role
            },
            canJoin: true,
            timeUntilMeeting: new Date(meeting.scheduled_time) - new Date()
        });
        
    } catch (error) {
        console.error('Error getting meeting access status:', error);
        res.status(500).json({
            error: 'Failed to get meeting status',
            message: error.message
        });
    }
}

/**
 * Revoke meeting access token (admin/volunteer action)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function revokeMeetingAccessToken(req, res) {
    try {
        const { meetingId } = req.params;
        
        // Verify user has permission (volunteer who created meeting or admin)
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        let whereClause = 'WHERE m.id = $1';
        let queryParams = [meetingId];
        
        if (user.role === 'volunteer') {
            whereClause += ' AND m.volunteer_id = $2';
            queryParams.push(user.id);
        } else if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        // Revoke token by setting it to null
        const result = await pool.query(`
            UPDATE meetings m
            SET student_access_token = NULL, access_token_expires_at = NULL
            ${whereClause}
            RETURNING m.id, m.room_id
        `, queryParams);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Meeting not found or access denied'
            });
        }
        
        res.json({
            success: true,
            message: 'Meeting access token revoked successfully',
            meetingId: result.rows[0].id
        });
        
    } catch (error) {
        console.error('Error revoking meeting access token:', error);
        res.status(500).json({
            error: 'Failed to revoke access token',
            message: error.message
        });
    }
}

/**
 * Regenerate meeting access token (admin/volunteer action)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function regenerateMeetingAccessToken(req, res) {
    try {
        const { meetingId } = req.params;
        const { expiryHours = 24 } = req.body;
        
        // Verify user has permission
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        let whereClause = 'WHERE m.id = $1';
        let queryParams = [meetingId];
        
        if (user.role === 'volunteer') {
            whereClause += ' AND m.volunteer_id = $2';
            queryParams.push(user.id);
        } else if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        // Get meeting details
        const meetingResult = await pool.query(`
            SELECT m.*
            FROM meetings m
            ${whereClause}
        `, queryParams);
        
        if (meetingResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Meeting not found or access denied'
            });
        }
        
        const meeting = meetingResult.rows[0];
        
        // Generate new opaque access token
        const token = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + Number(expiryHours) * 60 * 60 * 1000);
        
        // Update token in database
        await pool.query(`
            UPDATE meetings 
            SET student_access_token = $1, access_token_expires_at = $2
            WHERE id = $3
        `, [token, expiresAt, meetingId]);
        
        // Create new meeting access URL
        const accessUrl = createMeetingAccessUrl(token);
        
        res.json({
            success: true,
            token,
            accessUrl,
            expiresAt,
            message: 'Meeting access token regenerated successfully'
        });
        
    } catch (error) {
        console.error('Error regenerating meeting access token:', error);
        res.status(500).json({
            error: 'Failed to regenerate access token',
            message: error.message
        });
    }
}

export default {
    generateMeetingAccessToken,
    joinMeetingWithToken,
    getMeetingAccessStatus,
    revokeMeetingAccessToken,
    regenerateMeetingAccessToken
};
