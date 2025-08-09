/**
 * Enhanced Security Middleware - Phase 5
 * Multi-layer access control, rate limiting, and advanced security features
 */
import pool from '../config/database.js';
import rateLimit from 'express-rate-limit';

// In-memory stores for security tracking (in production, use Redis)
const suspiciousIPs = new Map(); // IP -> { attempts, lastAttempt, blocked }
const tokenAttempts = new Map(); // token -> { attempts, firstAttempt }
const userAttempts = new Map(); // userId -> { attempts, lastAttempt }

/**
 * Rate limiter for meeting access attempts
 */
export const meetingAccessRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 meeting access attempts per windowMs
    message: {
        error: 'Too Many Attempts',
        message: 'Too many meeting access attempts. Please try again in 15 minutes.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 15 * 60 // seconds
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for successful requests
    skip: (req, res) => res.statusCode < 400,
    keyGenerator: (req) => {
        // Use IP + token combination for more granular rate limiting
        const token = req.params.token?.substring(0, 10) || 'unknown';
        return `${req.ip}-${token}`;
    }
});

/**
 * Advanced IP reputation and geolocation checking
 */
export async function checkIPReputation(req, res, next) {
    try {
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');
        
        // Check if IP is in our suspicious list
        const suspiciousData = suspiciousIPs.get(ipAddress);
        if (suspiciousData?.blocked && Date.now() - suspiciousData.lastAttempt < 3600000) { // 1 hour block
            await logSecurityEvent({
                type: 'BLOCKED_IP_ATTEMPT',
                ipAddress,
                userAgent,
                details: `Blocked IP attempted access. Attempts: ${suspiciousData.attempts}`
            });
            
            return res.status(403).json({
                error: 'Access Blocked',
                message: 'Your IP address has been temporarily blocked due to suspicious activity.',
                code: 'IP_BLOCKED',
                contact: 'Please contact support if you believe this is an error.'
            });
        }
        
        // Basic user agent validation
        if (!userAgent || userAgent.length < 10 || userAgent.includes('bot') || userAgent.includes('crawler')) {
            await logSecurityEvent({
                type: 'SUSPICIOUS_USER_AGENT',
                ipAddress,
                userAgent,
                details: 'Suspicious or missing user agent detected'
            });
            
            // Don't block immediately, but log for monitoring
        }
        
        // Check for common attack patterns in headers
        const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip', 'x-originating-ip'];
        for (const header of suspiciousHeaders) {
            const value = req.get(header);
            if (value && (value.includes('..') || value.includes('script') || value.includes('<'))) {
                await logSecurityEvent({
                    type: 'HEADER_INJECTION_ATTEMPT',
                    ipAddress,
                    userAgent,
                    details: `Suspicious header ${header}: ${value}`
                });
                
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Invalid request headers detected.',
                    code: 'INVALID_HEADERS'
                });
            }
        }
        
        req.securityContext = {
            ipAddress,
            userAgent,
            timestamp: new Date(),
            suspiciousScore: suspiciousData?.attempts || 0
        };
        
        next();
        
    } catch (error) {
        console.error('IP reputation check error:', error);
        // Don't block on security check errors, but log them
        await logSecurityEvent({
            type: 'SECURITY_CHECK_ERROR',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            details: `Security check failed: ${error.message}`
        });
        next();
    }
}

/**
 * Token-specific security validation
 */
export async function validateTokenSecurity(req, res, next) {
    try {
        const { token } = req.params;
        const ipAddress = req.ip || req.connection.remoteAddress;
        
        if (!token) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Meeting token is required.',
                code: 'MISSING_TOKEN'
            });
        }
        
        // Check token format and length
        if (token.length < 50 || token.length > 500) {
            await logSecurityEvent({
                type: 'INVALID_TOKEN_FORMAT',
                ipAddress,
                details: `Invalid token length: ${token.length}`
            });
            
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid token format.',
                code: 'INVALID_TOKEN_FORMAT'
            });
        }
        
        // Check for token brute force attempts
        const tokenAttemptData = tokenAttempts.get(token);
        if (tokenAttemptData) {
            tokenAttemptData.attempts++;
            
            // If same token attempted too many times, it might be compromised
            if (tokenAttemptData.attempts > 20) {
                await logSecurityEvent({
                    type: 'TOKEN_BRUTE_FORCE',
                    ipAddress,
                    details: `Token attempted ${tokenAttemptData.attempts} times`
                });
                
                // Mark token as potentially compromised
                await pool.query(
                    'UPDATE meetings SET status = $1 WHERE student_access_token = $2',
                    ['security_review', token]
                );
                
                return res.status(403).json({
                    error: 'Security Alert',
                    message: 'This meeting link has been flagged for security review.',
                    code: 'TOKEN_SECURITY_REVIEW'
                });
            }
        } else {
            tokenAttempts.set(token, { attempts: 1, firstAttempt: Date.now() });
        }
        
        // Check for SQL injection patterns in token
        const sqlPatterns = ['union', 'select', 'drop', 'delete', 'insert', 'update', '--', ';'];
        const tokenLower = token.toLowerCase();
        for (const pattern of sqlPatterns) {
            if (tokenLower.includes(pattern)) {
                await logSecurityEvent({
                    type: 'SQL_INJECTION_ATTEMPT',
                    ipAddress,
                    details: `SQL injection pattern detected in token: ${pattern}`
                });
                
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Invalid token format.',
                    code: 'INVALID_TOKEN'
                });
            }
        }
        
        next();
        
    } catch (error) {
        console.error('Token security validation error:', error);
        await logSecurityEvent({
            type: 'TOKEN_VALIDATION_ERROR',
            ipAddress: req.ip,
            details: `Token validation failed: ${error.message}`
        });
        
        res.status(500).json({
            error: 'Server Error',
            message: 'Unable to validate token security.',
            code: 'SECURITY_ERROR'
        });
    }
}

/**
 * User behavior analysis and anomaly detection
 */
export async function analyzeUserBehavior(req, res, next) {
    try {
        const user = req.user;
        const ipAddress = req.ip || req.connection.remoteAddress;
        
        if (user) {
            const userAttemptData = userAttempts.get(user.id);
            const now = Date.now();
            
            if (userAttemptData) {
                userAttemptData.attempts++;
                
                // Check for rapid successive attempts (potential automation)
                if (now - userAttemptData.lastAttempt < 1000) { // Less than 1 second
                    await logSecurityEvent({
                        type: 'RAPID_ATTEMPTS',
                        ipAddress,
                        userId: user.id,
                        details: `Rapid successive attempts detected: ${userAttemptData.attempts}`
                    });
                    
                    return res.status(429).json({
                        error: 'Too Fast',
                        message: 'Please slow down your requests.',
                        code: 'TOO_FAST',
                        retryAfter: 2
                    });
                }
                
                userAttemptData.lastAttempt = now;
                
                // Check for excessive attempts from same user
                if (userAttemptData.attempts > 50) {
                    await logSecurityEvent({
                        type: 'EXCESSIVE_USER_ATTEMPTS',
                        ipAddress,
                        userId: user.id,
                        details: `User made ${userAttemptData.attempts} attempts`
                    });
                    
                    // Temporarily suspend user's meeting access
                    return res.status(403).json({
                        error: 'Account Suspended',
                        message: 'Your account has been temporarily suspended due to unusual activity.',
                        code: 'ACCOUNT_SUSPENDED',
                        contact: 'Please contact your teacher or administrator.'
                    });
                }
            } else {
                userAttempts.set(user.id, { attempts: 1, lastAttempt: now });
            }
        }
        
        next();
        
    } catch (error) {
        console.error('User behavior analysis error:', error);
        next(); // Continue on analysis errors
    }
}

/**
 * Meeting-specific security checks
 */
export async function validateMeetingSecurity(req, res, next) {
    try {
        const { token } = req.params;
        const ipAddress = req.ip || req.connection.remoteAddress;
        
        // Check if meeting is in a valid state for access
        const meetingResult = await pool.query(`
            SELECT 
                m.*,
                COUNT(mal.id) as access_attempts,
                MAX(mal.created_at) as last_access_attempt
            FROM meetings m
            LEFT JOIN meeting_access_logs mal ON m.id = mal.meeting_id
            WHERE m.student_access_token = $1
            GROUP BY m.id
        `, [token]);
        
        if (meetingResult.rows.length === 0) {
            return next(); // Let main middleware handle missing meeting
        }
        
        const meeting = meetingResult.rows[0];
        
        // Check if meeting has been flagged for security review
        if (meeting.status === 'security_review') {
            await logSecurityEvent({
                type: 'FLAGGED_MEETING_ACCESS',
                ipAddress,
                meetingId: meeting.id,
                details: 'Attempt to access meeting flagged for security review'
            });
            
            return res.status(403).json({
                error: 'Security Review',
                message: 'This meeting is currently under security review.',
                code: 'MEETING_SECURITY_REVIEW',
                contact: 'Please contact your volunteer or administrator.'
            });
        }
        
        // Check for excessive access attempts to this specific meeting
        if (meeting.access_attempts > 100) {
            await logSecurityEvent({
                type: 'EXCESSIVE_MEETING_ATTEMPTS',
                ipAddress,
                meetingId: meeting.id,
                details: `Meeting has ${meeting.access_attempts} access attempts`
            });
            
            // Auto-flag meeting for review
            await pool.query(
                'UPDATE meetings SET status = $1 WHERE id = $2',
                ['security_review', meeting.id]
            );
            
            return res.status(403).json({
                error: 'Security Alert',
                message: 'This meeting has been flagged due to excessive access attempts.',
                code: 'MEETING_FLAGGED'
            });
        }
        
        // Check meeting timing - prevent access too far in advance or too late
        const now = new Date();
        const scheduledTime = new Date(meeting.scheduled_time);
        const timeDiff = scheduledTime.getTime() - now.getTime();
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        
        // Don't allow access more than 24 hours before scheduled time
        if (hoursDiff > 24) {
            return res.status(400).json({
                error: 'Too Early',
                message: 'Meeting access is not available more than 24 hours in advance.',
                code: 'ACCESS_TOO_EARLY',
                scheduledTime: meeting.scheduled_time
            });
        }
        
        // Don't allow access more than 2 hours after scheduled time (unless it's instant)
        if (!meeting.is_instant && hoursDiff < -2) {
            return res.status(400).json({
                error: 'Meeting Expired',
                message: 'This meeting has expired and is no longer accessible.',
                code: 'MEETING_EXPIRED',
                scheduledTime: meeting.scheduled_time
            });
        }
        
        req.meetingSecurity = {
            meeting,
            accessAttempts: meeting.access_attempts,
            lastAccessAttempt: meeting.last_access_attempt,
            timingValid: true
        };
        
        next();
        
    } catch (error) {
        console.error('Meeting security validation error:', error);
        await logSecurityEvent({
            type: 'MEETING_SECURITY_ERROR',
            ipAddress: req.ip,
            details: `Meeting security check failed: ${error.message}`
        });
        next(); // Continue on security check errors
    }
}

/**
 * Log security events for monitoring and analysis
 */
async function logSecurityEvent({ type, ipAddress, userId = null, meetingId = null, userAgent = null, details }) {
    try {
        await pool.query(`
            INSERT INTO security_events (
                event_type, ip_address, user_id, meeting_id, user_agent, details, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [type, ipAddress, userId, meetingId, userAgent, details]);
        
        // Update suspicious IP tracking
        if (type.includes('SUSPICIOUS') || type.includes('BLOCKED') || type.includes('INJECTION')) {
            const current = suspiciousIPs.get(ipAddress) || { attempts: 0, lastAttempt: 0, blocked: false };
            current.attempts++;
            current.lastAttempt = Date.now();
            
            // Block IP after 10 suspicious events
            if (current.attempts >= 10) {
                current.blocked = true;
            }
            
            suspiciousIPs.set(ipAddress, current);
        }
        
    } catch (error) {
        console.error('Failed to log security event:', error);
    }
}

/**
 * Create security events table if it doesn't exist
 */
export async function initializeSecurityTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS security_events (
                id SERIAL PRIMARY KEY,
                event_type VARCHAR(100) NOT NULL,
                ip_address INET,
                user_id INTEGER REFERENCES users(id),
                meeting_id INTEGER REFERENCES meetings(id),
                user_agent TEXT,
                details TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_security_events_type_time 
            ON security_events(event_type, created_at DESC);
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_security_events_ip_time 
            ON security_events(ip_address, created_at DESC);
        `);
        
        console.log('✅ Security tables initialized');
        
    } catch (error) {
        console.error('Failed to initialize security tables:', error);
    }
}

/**
 * Cleanup old security tracking data (run periodically)
 */
export function cleanupSecurityData() {
    const now = Date.now();
    const oneHour = 3600000;
    const oneDay = 86400000;
    
    // Clean up token attempts older than 1 day
    for (const [token, data] of tokenAttempts.entries()) {
        if (now - data.firstAttempt > oneDay) {
            tokenAttempts.delete(token);
        }
    }
    
    // Clean up user attempts older than 1 hour
    for (const [userId, data] of userAttempts.entries()) {
        if (now - data.lastAttempt > oneHour) {
            userAttempts.delete(userId);
        }
    }
    
    // Clean up suspicious IPs older than 1 day (unless blocked)
    for (const [ip, data] of suspiciousIPs.entries()) {
        if (!data.blocked && now - data.lastAttempt > oneDay) {
            suspiciousIPs.delete(ip);
        }
    }
}

// Run cleanup every hour
setInterval(cleanupSecurityData, 3600000);

export default {
    meetingAccessRateLimit,
    checkIPReputation,
    validateTokenSecurity,
    analyzeUserBehavior,
    validateMeetingSecurity,
    initializeSecurityTables,
    cleanupSecurityData
};
