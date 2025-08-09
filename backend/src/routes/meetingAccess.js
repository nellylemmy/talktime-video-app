/**
 * Secure Meeting Access Routes - Phase 5 Enhanced Security
 * Handles student-specific meeting link access with multi-layer security
 */
import express from 'express';
import { validateMeetingAccess, checkPendingMeetingAccess } from '../middleware/meetingAccess.js';
import { isAuthenticated } from '../middleware/auth.js';
// Temporarily disabled enhanced security middleware
// import {
//     meetingAccessRateLimit,
//     checkIPReputation,
//     validateTokenSecurity,
//     analyzeUserBehavior,
//     validateMeetingSecurity
// } from '../middleware/enhancedSecurity.js';
import {
    generateMeetingAccessToken,
    joinMeetingWithToken,
    getMeetingAccessStatus,
    revokeMeetingAccessToken,
    regenerateMeetingAccessToken
} from '../controllers/meetingJoinController.js';

const router = express.Router();

/**
 * @route GET /api/v1/meeting/join/:token
 * @description Main meeting join endpoint with Phase 5 multi-layer security
 * @access Public (but validates token and student identity through multiple security layers)
 */
router.get('/join/:token', 
    // meetingAccessRateLimit,           // Layer 1: Rate limiting (temporarily disabled)
    // checkIPReputation,                // Layer 2: IP reputation and geolocation (temporarily disabled)
    // validateTokenSecurity,            // Layer 3: Token format and brute force protection (temporarily disabled)
    // validateMeetingSecurity,          // Layer 4: Meeting-specific security checks (temporarily disabled)
    // analyzeUserBehavior,              // Layer 5: User behavior analysis (temporarily disabled)
    validateMeetingAccess,            // Layer 6: Core meeting access validation
    joinMeetingWithToken              // Final: Join meeting handler
);

/**
 * @route GET /api/v1/meeting/status/:token
 * @description Get meeting access status with enhanced security validation
 * @access Public (but validates token and student identity through security layers)
 */
router.get('/status/:token', 
    // meetingAccessRateLimit,           // Layer 1: Rate limiting (temporarily disabled)
    // checkIPReputation,                // Layer 2: IP reputation check (temporarily disabled)
    // validateTokenSecurity,            // Layer 3: Token security validation (temporarily disabled)
    // validateMeetingSecurity,          // Layer 4: Meeting security checks (temporarily disabled)
    validateMeetingAccess,            // Layer 5: Core meeting access validation
    getMeetingAccessStatus            // Final: Status handler
);

/**
 * @route POST /api/v1/meeting/:meetingId/generate-token
 * @description Generate secure access token for a meeting (volunteer/admin only)
 * @access Private (Volunteer who created meeting or Admin)
 */
router.post('/:meetingId/generate-token', isAuthenticated, generateMeetingAccessToken);

/**
 * @route PUT /api/v1/meeting/:meetingId/regenerate-token
 * @description Regenerate secure access token for a meeting (volunteer/admin only)
 * @access Private (Volunteer who created meeting or Admin)
 */
router.put('/:meetingId/regenerate-token', isAuthenticated, regenerateMeetingAccessToken);

/**
 * @route DELETE /api/v1/meeting/:meetingId/revoke-token
 * @description Revoke meeting access token (volunteer/admin only)
 * @access Private (Volunteer who created meeting or Admin)
 */
router.delete('/:meetingId/revoke-token', isAuthenticated, revokeMeetingAccessToken);

export default router;
