/**
 * Meeting Access Control Middleware
 * Validates secure meeting access tokens and enforces student-specific access
 */
import pool from '../config/database.js';
import { verifyToken as verifyJWT, extractTokenFromHeader } from '../utils/jwt.js';

/**
 * Log meeting access attempt for security audit
 * @param {Object} params - Access attempt parameters
 */
async function logAccessAttempt({
    meetingId,
    userId = null,
    studentId = null,
    accessGranted,
    ipAddress,
    userAgent,
    failureReason = null,
    accessTokenUsed,
    sessionId = null
}) {
    try {
        await pool.query(`
            INSERT INTO meeting_access_logs (
                meeting_id, user_id, student_id, access_granted, 
                ip_address, user_agent, failure_reason, access_token_used, session_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            meetingId, userId, studentId, accessGranted,
            ipAddress, userAgent, failureReason, accessTokenUsed, sessionId
        ]);
    } catch (error) {
        console.error('Failed to log access attempt:', error);
        // Don't throw - logging failure shouldn't block access
    }
}

/**
 * Validate meeting access token and authorize student access
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function validateMeetingAccess(req, res, next) {
    try {
        const { token } = req.params;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        // Verify meeting exists for this token and hasn't expired
        const meetingResult = await pool.query(`
            SELECT 
                m.*,
                su.full_name AS student_name,
                su.username AS admission_number,
                u.full_name AS volunteer_name
            FROM meetings m
            JOIN users su ON m.student_id = su.id AND su.role = 'student'
            JOIN users u ON m.volunteer_id = u.id
            WHERE m.student_access_token = $1
        `, [token]);

        if (meetingResult.rows.length === 0) {
            await logAccessAttempt({
                meetingId: null,
                accessGranted: false,
                ipAddress,
                userAgent,
                failureReason: 'Meeting not found for token',
                accessTokenUsed: token?.substring(0, 20) + '...'
            });

            return res.status(404).json({
                error: 'Meeting Not Found',
                message: 'This meeting link is invalid or has been revoked',
                code: 'MEETING_NOT_FOUND'
            });
        }

        const meeting = meetingResult.rows[0];

        // Check token expiry timing
        if (meeting.access_token_expires_at && new Date(meeting.access_token_expires_at) <= new Date()) {
            await logAccessAttempt({
                meetingId: meeting.id,
                accessGranted: false,
                ipAddress,
                userAgent,
                failureReason: 'Access token expired',
                accessTokenUsed: token.substring(0, 20) + '...'
            });

            return res.status(403).json({
                error: 'Access Denied',
                message: 'This meeting link has expired',
                code: 'TOKEN_EXPIRED'
            });
        }

        // Attempt to authenticate user via JWT from Authorization header
        let authenticatedUser = req.user;
        if (!authenticatedUser) {
            const authHeader = req.headers.authorization;
            const bearer = extractTokenFromHeader(authHeader);
            if (bearer) {
                try {
                    authenticatedUser = verifyJWT(bearer);
                    req.user = authenticatedUser;
                } catch (e) {
                    // Invalid token, treat as unauthenticated
                }
            }
        }

        if (!authenticatedUser) {
            await logAccessAttempt({
                meetingId: meeting.id,
                accessGranted: false,
                ipAddress,
                userAgent,
                failureReason: 'User not authenticated',
                accessTokenUsed: token.substring(0, 20) + '...'
            });

            return res.status(401).json({
                error: 'Authentication Required',
                message: 'Please log in to join this meeting',
                code: 'AUTH_REQUIRED',
                loginUrl: `/student/login?redirect=${encodeURIComponent(`/meeting/join/${token}`)}`
            });
        }

        // Enforce role is student
        if (authenticatedUser.role !== 'student') {
            await logAccessAttempt({
                meetingId: meeting.id,
                userId: authenticatedUser.id,
                accessGranted: false,
                ipAddress,
                userAgent,
                failureReason: 'Non-student user attempted access',
                accessTokenUsed: token.substring(0, 20) + '...'
            });

            return res.status(403).json({
                error: 'Access Denied',
                message: 'Only students can join meetings through this link',
                code: 'INVALID_USER_TYPE'
            });
        }

        // Verify this student is the meeting participant
        if (authenticatedUser.id !== meeting.student_id) {
            await logAccessAttempt({
                meetingId: meeting.id,
                userId: authenticatedUser.id,
                accessGranted: false,
                ipAddress,
                userAgent,
                failureReason: `Wrong student: expected ${meeting.student_id}, got ${authenticatedUser.id}`,
                accessTokenUsed: token.substring(0, 20) + '...'
            });

            return res.status(403).json({
                error: 'Access Denied',
                message: 'This meeting link is not for you. Please check with your volunteer.',
                code: 'WRONG_STUDENT',
                studentName: meeting.student_name
            });
        }

        // All validations passed - log successful access and proceed
        await logAccessAttempt({
            meetingId: meeting.id,
            userId: authenticatedUser.id,
            accessGranted: true,
            ipAddress,
            userAgent,
            accessTokenUsed: token.substring(0, 20) + '...'
        });

        // Attach meeting and auth context
        req.meetingAccess = {
            meeting,
            token,
            studentId: meeting.student_id,
            volunteerId: meeting.volunteer_id,
            scheduledTime: meeting.scheduled_time,
            expiresAt: meeting.access_token_expires_at,
            authenticatedUser
        };

        next();
        
    } catch (error) {
        console.error('Meeting access validation error:', error);
        
        await logAccessAttempt({
            meetingId: req.params.token ? null : undefined,
            accessGranted: false,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            failureReason: `Server error: ${error.message}`,
            accessTokenUsed: req.params.token?.substring(0, 20) + '...'
        });
        
        res.status(500).json({
            error: 'Server Error',
            message: 'Unable to validate meeting access',
            code: 'SERVER_ERROR'
        });
    }
}

/**
 * Middleware to check if user has pending meeting access after login
 * Should be used after successful authentication
 */
export function checkPendingMeetingAccess(req, res, next) {
    // Stateless JWT flow: nothing to do here
    return next();
}

export default { validateMeetingAccess, checkPendingMeetingAccess };
