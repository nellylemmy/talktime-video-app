import pool from '../../../config/database.js';
import crypto from 'crypto';

/**
 * Validate student access to a specific meeting
 * Ensures only the targeted student can join the meeting
 */
export const validateMeetingAccess = async (req, res) => {
    console.log('🔍 Validating meeting access...');
    
    try {
        const { roomId, token, studentId } = req.body;
        const jwt_authUser = req.user;
        
        console.log('📋 Validation request:', { roomId, hasToken: !!token, studentId, jwt_authUser: jwt_authUser?.id });
        
        if (!roomId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Room ID is required' 
            });
        }
        
        // Find the meeting by room ID
        const meetingQuery = await pool.query(`
            SELECT 
                m.*, 
                su.full_name AS student_name, 
                su.username AS admission_number,
                u.full_name AS volunteer_name
            FROM meetings m
            JOIN users su ON m.student_id = su.id AND su.role = 'student'
            JOIN users u ON m.volunteer_id = u.id
            WHERE m.room_id = $1
        `, [roomId]);
        
        if (meetingQuery.rows.length === 0) {
            console.log('❌ Meeting not found for room:', roomId);
            return res.status(404).json({ 
                success: false, 
                message: 'Meeting not found' 
            });
        }
        
        const meeting = meetingQuery.rows[0];
        console.log('📅 Meeting found:', { 
            id: meeting.id, 
            studentId: meeting.student_id, 
            volunteerId: meeting.volunteer_id,
            status: meeting.status 
        });
        
        // Check if meeting is truly ended (only if volunteer has left)
        // Allow students to join if volunteer is still in the room, even if status shows 'completed'
        if (meeting.status === 'cancelled') {
            console.log('❌ Meeting was cancelled, status:', meeting.status);
            return res.status(410).json({ 
                success: false, 
                message: 'Meeting has been cancelled' 
            });
        }
        
        // For other statuses, we'll allow join and let the meeting room handle the logic
        // This allows students to join even if the meeting shows as 'completed' but volunteer is still present
        
        // Ensure the jwt_auth user is a student
        if (!jwt_authUser || jwt_authUser.role !== 'student') {
            console.log('❌ User is not a student:', jwt_authUser?.role);
            return res.status(403).json({ 
                success: false, 
                message: 'Only students can join meetings via shared links' 
            });
        }
        
        // Validate that the logged-in student matches the meeting's target student
        if (jwt_authUser.id !== meeting.student_id) {
            console.log('❌ Student ID mismatch:', { 
                jwt_authStudentId: jwt_authUser.id, 
                meetingStudentId: meeting.student_id 
            });
            
            // Log unauthorized access attempt
            await pool.query(`
                INSERT INTO meeting_access_logs 
                (meeting_id, attempted_by_user_id, attempted_by_role, access_granted, failure_reason, ip_address, user_agent)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                meeting.id,
                jwt_authUser.id,
                jwt_authUser.role,
                false,
                'Student ID mismatch',
                req.ip,
                req.get('User-Agent')
            ]);
            
            return res.status(403).json({ 
                success: false, 
                message: 'This meeting is not assigned to you. Please contact your coordinator.' 
            });
        }
        
        // If a token is provided, validate it (for enhanced security)
        if (token) {
            try {
                // Validate token format and expiration
                const tokenParts = token.split('.')
                if (tokenParts.length !== 3) {
                    throw new Error('Invalid token format')
                }
                
                const [headerB64, payloadB64, signatureB64] = tokenParts;
                const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
                
                // Verify HMAC signature
                const expectedSig = crypto
                    .createHmac('sha256', process.env.MEETING_TOKEN_SECRET || 'default-secret')
                    .update(`${headerB64}.${payloadB64}`)
                    .digest('base64');
                const sigOk = (() => {
                    try {
                        const a = Buffer.from(signatureB64);
                        const b = Buffer.from(expectedSig);
                        return a.length === b.length && crypto.timingSafeEqual(a, b);
                    } catch { return false; }
                })();
                if (!sigOk) {
                    console.log('❌ Token signature mismatch');
                    return res.status(401).json({ 
                        success: false, 
                        message: 'Invalid meeting token signature' 
                    });
                }
                
                // Check token expiration
                if (payload.exp && Date.now() > payload.exp * 1000) {
                    console.log('❌ Token has expired');
                    return res.status(401).json({ 
                        success: false, 
                        message: 'Meeting link has expired' 
                    });
                }
                
                // Validate token is for this specific meeting and student
                if (payload.meetingId !== meeting.id || payload.studentId !== meeting.student_id) {
                    console.log('❌ Token validation failed:', { 
                        tokenMeetingId: payload.meetingId, 
                        actualMeetingId: meeting.id,
                        tokenStudentId: payload.studentId,
                        actualStudentId: meeting.student_id
                    });
                    return res.status(403).json({ 
                        success: false, 
                        message: 'Invalid meeting token' 
                    });
                }
                
                console.log('✅ Token validated successfully');
            } catch (error) {
                console.log('❌ Token validation error:', error.message);
                return res.status(401).json({ 
                    success: false, 
                    message: 'Invalid or corrupted meeting token' 
                });
            }
        }
        
        // Log successful access
        await pool.query(`
            INSERT INTO meeting_access_logs 
            (meeting_id, attempted_by_user_id, attempted_by_role, access_granted, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            meeting.id,
            jwt_authUser.id,
            jwt_authUser.role,
            true,
            req.ip,
            req.get('User-Agent')
        ]);
        
        console.log('✅ Meeting access validated for student:', jwt_authUser.id);
        
        res.json({
            success: true,
            message: 'Access granted',
            meeting: {
                id: meeting.id,
                roomId: meeting.room_id,
                studentName: meeting.student_name,
                volunteerName: meeting.volunteer_name,
                scheduledTime: meeting.scheduled_time,
                status: meeting.status
            }
        });
        
    } catch (error) {
        console.error('❌ Error validating meeting access:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to validate meeting access' 
        });
    }
};

/**
 * Generate secure meeting link with student-specific token
 */
export const generateSecureMeetingLink = async (req, res) => {
    console.log('🔗 Generating secure meeting link...');
    
    try {
        const { meetingId } = req.body;
        const volunteerId = req.user?.id;
        
        if (!meetingId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Meeting ID is required' 
            });
        }
        
        // Get meeting details
        const meetingQuery = await pool.query(`
            SELECT m.*, su.full_name as student_name, su.username AS admission_number
            FROM meetings m
            JOIN users su ON m.student_id = su.id AND su.role = 'student'
            WHERE m.id = $1 AND m.volunteer_id = $2
        `, [meetingId, volunteerId]);
        
        if (meetingQuery.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Meeting not found or access denied' 
            });
        }
        
        const meeting = meetingQuery.rows[0];
        
        // Generate secure token
        const tokenPayload = {
            meetingId: meeting.id,
            studentId: meeting.student_id,
            roomId: meeting.room_id,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours expiry
        };
        
        // Create a simple JWT-like token
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
        const payload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
        const signature = crypto
            .createHmac('sha256', process.env.MEETING_TOKEN_SECRET || 'default-secret')
            .update(`${header}.${payload}`)
            .digest('base64');
        
        const token = `${header}.${payload}.${signature}`;
        
        // Persist token and expiry to meeting (for middleware validation and audit)
        try {
            await pool.query(
                `UPDATE meetings 
                 SET student_access_token = $1, access_token_expires_at = to_timestamp($2), updated_at = NOW()
                 WHERE id = $3`,
                [token, tokenPayload.exp, meeting.id]
            );
        } catch (err) {
            console.warn('⚠️ Failed to persist meeting token (columns may not exist yet):', err?.message);
        }
        
        // Generate the secure meeting link
        const baseUrl = process.env.BASE_URL || 'http://localhost';
        const meetingLink = `${baseUrl}/call.html?room=${meeting.room_id}&token=${token}`;
        
        console.log('✅ Secure meeting link generated for meeting:', meetingId);
        
        res.json({
            success: true,
            meetingLink: meetingLink,
            meeting: {
                id: meeting.id,
                roomId: meeting.room_id,
                studentName: meeting.student_name,
                admissionNumber: meeting.admission_number,
                scheduledTime: meeting.scheduled_time
            },
            expiresAt: new Date(tokenPayload.exp * 1000).toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error generating secure meeting link:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to generate meeting link' 
        });
    }
};
