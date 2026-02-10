/**
 * Anti-FOUC (Flash of Unstyled Content) System
 * =============================================
 * Prevents the brief flash of wrong navigation during auth state detection.
 *
 * This script runs synchronously in the <head> before the page renders,
 * performing a quick localStorage check to determine likely auth state.
 *
 * HOW IT WORKS:
 * 1. Checks localStorage for role-specific tokens (synchronous, instant)
 * 2. Sets CSS class on <html> element for initial styling
 * 3. Exposes confirm functions for async auth verification to call
 * 4. Falls back to showing content after 500ms if JS fails
 *
 * USAGE:
 * 1. Add <script src="/shared/js/anti-fouc.js"></script> in <head> BEFORE other scripts
 * 2. Add class="nav-auth-pending" to navigation containers
 * 3. Call window.confirmAuthenticated() or window.confirmUnauthenticated() after async auth check
 */

(function() {
    'use strict';

    // Detect likely auth state from localStorage tokens
    // This is a quick sync check - async verification happens later
    function detectLikelyAuthState() {
        try {
            // Check for tokens from any role
            const hasVolunteerToken = !!localStorage.getItem('volunteer_talktime_access_token');
            const hasStudentToken = !!localStorage.getItem('student_talktime_access_token');
            const hasAdminToken = !!localStorage.getItem('admin_talktime_access_token');

            return hasVolunteerToken || hasStudentToken || hasAdminToken;
        } catch (e) {
            // localStorage might not be available (private mode, etc.)
            return false;
        }
    }

    // Get the detected role for logging
    function getDetectedRole() {
        try {
            if (localStorage.getItem('volunteer_talktime_access_token')) return 'volunteer';
            if (localStorage.getItem('student_talktime_access_token')) return 'student';
            if (localStorage.getItem('admin_talktime_access_token')) return 'admin';
            return 'none';
        } catch (e) {
            return 'unknown';
        }
    }

    // Set initial auth hint on html element
    const likelyAuthenticated = detectLikelyAuthState();
    const detectedRole = getDetectedRole();

    // Add auth-hint class immediately (before DOM is ready)
    // This allows CSS to show/hide appropriate nav while async verification runs
    if (likelyAuthenticated) {
        document.documentElement.classList.add('auth-hint');
        document.documentElement.dataset.likelyRole = detectedRole;
    } else {
        document.documentElement.classList.add('unauth-hint');
    }

    // Confirm authenticated - call this after successful async auth verification
    window.confirmAuthenticated = function(role) {
        document.documentElement.classList.remove('auth-hint', 'unauth-hint');
        document.body.classList.remove('unauth-confirmed');
        document.body.classList.add('auth-confirmed');

        if (role) {
            document.documentElement.dataset.confirmedRole = role;
        }

        // Log for debugging
        if (window.console && console.log) {
            console.log('[Anti-FOUC] Auth confirmed:', role || 'unknown role');
        }
    };

    // Confirm unauthenticated - call this when auth check fails or no token
    window.confirmUnauthenticated = function() {
        document.documentElement.classList.remove('auth-hint', 'unauth-hint');
        document.body.classList.remove('auth-confirmed');
        document.body.classList.add('unauth-confirmed');

        // Log for debugging
        if (window.console && console.log) {
            console.log('[Anti-FOUC] Unauth confirmed');
        }
    };

    // Check if async auth verification is likely needed
    window.needsAsyncAuthCheck = function() {
        return likelyAuthenticated;
    };

    // Get the likely auth state (for scripts that load later)
    window.getLikelyAuthState = function() {
        return {
            authenticated: likelyAuthenticated,
            role: detectedRole
        };
    };

    // Log initial detection
    if (window.console && console.log) {
        console.log('[Anti-FOUC] Initial detection:', likelyAuthenticated ? 'likely auth (' + detectedRole + ')' : 'likely unauth');
    }
})();
