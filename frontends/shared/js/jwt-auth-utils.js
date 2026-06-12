/**
 * Comprehensive JWT Authentication Utilities for TalkTime Frontend
 * This utility provides JWT authentication functions for all user roles (admin, volunteer, student)
 * Replaces all session-based authentication throughout the application
 */

class TalkTimeJWTAuth {
    constructor(rolePrefix) {
        this.rolePrefix = rolePrefix;
        this.accessTokenKey = `${rolePrefix}_talktime_access_token`;
        this.refreshTokenKey = `${rolePrefix}_talktime_refresh_token`;
        this.userKey = `${rolePrefix}_talktime_user`;
        this.apiBaseUrl = window.location.origin;
    }

    /**
     * Store JWT tokens and user data in localStorage
     * SECURITY: Clears tokens from other roles to prevent role confusion
     */
    storeAuth(accessToken, user, refreshToken = null) {
        // Clear tokens from other roles first to prevent role confusion
        const allRoles = ['volunteer', 'student', 'admin'];
        allRoles.forEach(role => {
            if (role !== this.rolePrefix) {
                localStorage.removeItem(`${role}_talktime_access_token`);
                localStorage.removeItem(`${role}_talktime_refresh_token`);
                localStorage.removeItem(`${role}_talktime_user`);
            }
        });

        // Store new tokens for current role
        localStorage.setItem(this.accessTokenKey, accessToken);
        localStorage.setItem(this.userKey, JSON.stringify(user));
        if (refreshToken) {
            localStorage.setItem(this.refreshTokenKey, refreshToken);
        }

        // Store current role in sessionStorage for call page fallback
        sessionStorage.setItem('talktime_current_role', this.rolePrefix);
    }

    /**
     * Get access token from localStorage
     */
    getAccessToken() {
        return localStorage.getItem(this.accessTokenKey);
    }

    /**
     * Get refresh token from localStorage
     */
    getRefreshToken() {
        return localStorage.getItem(this.refreshTokenKey);
    }

    /**
     * Get stored user data
     */
    getUser() {
        try {
            const userData = localStorage.getItem(this.userKey);
            return userData ? JSON.parse(userData) : null;
        } catch (e) {
            // Corrupted stored value must not break page init
            localStorage.removeItem(this.userKey);
            return null;
        }
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.getAccessToken();
    }

    /**
     * Get user role
     */
    getUserRole() {
        const user = this.getUser();
        return user ? user.role : null;
    }

    /**
     * Get access token (alias for backward compatibility)
     */
    getToken() {
        return this.getAccessToken();
    }

    /**
     * Clear all authentication data
     */
    clearAuth() {
        localStorage.removeItem(this.accessTokenKey);
        localStorage.removeItem(this.refreshTokenKey);
        localStorage.removeItem(this.userKey);
        // Clear notification/user-id state so the next user on a shared device
        // does not inherit this user's identity or push registration
        ['talktime_user_id', 'talktime_notification_status',
         'talktime_notification_granted_at', 'talktime_notification_denied_at'].forEach(k => {
            localStorage.removeItem(k);
        });
        sessionStorage.removeItem('talktime_user_id');
        sessionStorage.removeItem('talktime_current_role');
    }

    /**
     * Create Authorization headers for API requests
     */
    getAuthHeaders() {
        const token = this.getAccessToken();
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        return headers;
    }

    /**
     * Make authenticated API request with JWT token
     */
    async makeAuthenticatedRequest(url, options = {}) {
        return this.authenticatedRequest(url, options);
    }

    /**
     * Make authenticated API request with JWT token (internal method).
     * On 401: tries one token refresh (single-flight) and retries the request
     * before giving up and logging the user out.
     */
    async authenticatedRequest(url, options = {}) {
        const token = this.getAccessToken();

        if (!token) {
            throw new Error('No authentication token available');
        }

        const buildHeaders = (t) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${t}`,
            ...options.headers
        });

        try {
            let response = await fetch(url, {
                ...options,
                headers: buildHeaders(token)
            });

            if (response.status === 401) {
                const newToken = await this.tryRefreshToken();
                if (newToken) {
                    response = await fetch(url, {
                        ...options,
                        headers: buildHeaders(newToken)
                    });
                    if (response.status !== 401) {
                        return response;
                    }
                }
                console.log('JWT token expired or invalid');
                this.handleAuthenticationFailure();
                throw new Error('Authentication failed');
            }

            return response;
        } catch (error) {
            console.error('Authenticated request failed:', error);
            throw error;
        }
    }

    /**
     * Exchange the stored refresh token for new tokens.
     * Single-flight: concurrent 401s share one refresh request.
     * Returns the new access token, or null if refresh is impossible/failed.
     */
    async tryRefreshToken() {
        const refreshToken = localStorage.getItem(this.refreshTokenKey);
        if (!refreshToken) return null;

        if (!this._refreshPromise) {
            this._refreshPromise = (async () => {
                try {
                    const res = await fetch('/api/v1/jwt-auth/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken })
                    });
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (!data.success || !data.accessToken) return null;
                    localStorage.setItem(this.accessTokenKey, data.accessToken);
                    if (data.refreshToken) {
                        localStorage.setItem(this.refreshTokenKey, data.refreshToken);
                    }
                    return data.accessToken;
                } catch (e) {
                    return null;
                } finally {
                    this._refreshPromise = null;
                }
            })();
        }
        return this._refreshPromise;
    }

    /**
     * Handle authentication failure (token expired, invalid, etc.)
     */
    handleAuthenticationFailure() {
        console.log('Authentication failed, clearing tokens and redirecting to login');
        this.clearAuth();
        
        // Determine redirect URL based on current interface
        const currentPath = window.location.pathname;
        let loginUrl = '/volunteer/login'; // Default to volunteer login
        
        if (currentPath.includes('/admin/')) {
            loginUrl = '/admin/login';
        } else if (currentPath.includes('/student/')) {
            loginUrl = '/student/login';
        }
        
        window.location.href = loginUrl;
    }

    /**
     * Login with credentials and store JWT token
     */
    async login(credentials, loginEndpoint) {
        try {
            const response = await fetch(loginEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(credentials)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const err = new Error(errorData.error || errorData.message || 'Login failed');
                err.code = errorData.code; // e.g. PENDING_APPROVAL — pages branch on this
                throw err;
            }

            const data = await response.json();
            
            if (data.success && data.accessToken) {
                this.storeAuth(data.accessToken, data.user, data.refreshToken);
                return data;
            } else {
                throw new Error('Invalid login response format');
            }
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    }

    /**
     * Logout and clear authentication data
     */
    async logout(logoutEndpoint = null) {
        try {
            // Optionally call server logout endpoint
            if (logoutEndpoint && this.isAuthenticated()) {
                await this.authenticatedRequest(logoutEndpoint, {
                    method: 'POST'
                });
            }
        } catch (error) {
            console.error('Server logout failed:', error);
            // Continue with client-side logout even if server logout fails
        }
        
        // Always clear client-side authentication data
        this.clearAuth();
    }

    /**
     * Verify current JWT token with server
     */
    async verifyToken() {
        if (!this.isAuthenticated()) {
            return false;
        }

        // Single-flight with a short cache: multiple page components
        // (nav-loader, approval status, header) share one verify call
        if (this._verifyCache && (Date.now() - this._verifyCache.at) < 10000) {
            return this._verifyCache.promise;
        }
        const promise = this._verifyTokenUncached();
        this._verifyCache = { at: Date.now(), promise };
        promise.then((ok) => { if (!ok) this._verifyCache = null; });
        return promise;
    }

    async _verifyTokenUncached() {
        try {
            const response = await this.authenticatedRequest('/api/v1/jwt-auth/verify');
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.authenticated) {
                    // Update stored user data if needed
                    if (data.user) {
                        localStorage.setItem(this.userKey, JSON.stringify(data.user));
                    }
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error('Token verification failed:', error);
            return false;
        }
    }

    /**
     * Initialize authentication check for protected pages
     */
    async initializeAuth(requiredRole = null) {
        if (!this.isAuthenticated()) {
            console.log('No authentication token found');
            this.handleAuthenticationFailure();
            return false;
        }

        // Verify token with server
        const isValid = await this.verifyToken();
        if (!isValid) {
            console.log('Token verification failed');
            this.handleAuthenticationFailure();
            return false;
        }

        // Check role if specified
        if (requiredRole) {
            const userRole = this.getUserRole();
            if (userRole !== requiredRole && requiredRole !== 'any') {
                console.log(`Access denied. Required role: ${requiredRole}, User role: ${userRole}`);
                this.handleAuthenticationFailure();
                return false;
            }
        }

        return true;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TalkTimeJWTAuth;
}
