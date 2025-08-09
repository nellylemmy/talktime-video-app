/**
 * JWT Authentication Utilities for Frontend
 * Handles token storage, API calls, and authentication state
 */

class JWTAuth {
    constructor() {
        this.apiBaseUrl = window.location.origin + '/api/v1/jwt-auth';
        this.accessTokenKey = 'talktime_access_token';
        this.refreshTokenKey = 'talktime_refresh_token';
        this.userKey = 'talktime_user';
    }

    /**
     * Store tokens in localStorage
     */
    storeTokens(accessToken, refreshToken, user) {
        localStorage.setItem(this.accessTokenKey, accessToken);
        localStorage.setItem(this.refreshTokenKey, refreshToken);
        localStorage.setItem(this.userKey, JSON.stringify(user));
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
        const userData = localStorage.getItem(this.userKey);
        return userData ? JSON.parse(userData) : null;
    }

    /**
     * Clear all stored authentication data
     */
    clearAuth() {
        localStorage.removeItem(this.accessTokenKey);
        localStorage.removeItem(this.refreshTokenKey);
        localStorage.removeItem(this.userKey);
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.getAccessToken();
    }

    /**
     * Make authenticated API request
     */
    async makeAuthenticatedRequest(url, options = {}) {
        const accessToken = this.getAccessToken();
        
        if (!accessToken) {
            throw new Error('No access token available');
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            ...options.headers
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            // If token expired, try to refresh
            if (response.status === 401) {
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    // Retry the request with new token
                    headers.Authorization = `Bearer ${this.getAccessToken()}`;
                    return await fetch(url, {
                        ...options,
                        headers
                    });
                } else {
                    // Refresh failed, redirect to login
                    this.redirectToLogin();
                    throw new Error('Authentication failed');
                }
            }

            return response;
        } catch (error) {
            console.error('Authenticated request failed:', error);
            throw error;
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshToken() {
        const refreshToken = this.getRefreshToken();
        
        if (!refreshToken) {
            return false;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                this.storeTokens(data.accessToken, data.refreshToken, this.getUser());
                return true;
            } else {
                this.clearAuth();
                return false;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            this.clearAuth();
            return false;
        }
    }

    /**
     * Login with email and password (volunteer/admin)
     */
    async login(email, password, role = 'volunteer') {
        try {
            const response = await fetch(`${this.apiBaseUrl}/${role}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.storeTokens(data.accessToken, data.refreshToken, data.user);
                return { success: true, user: data.user };
            } else {
                return { success: false, error: data.error || 'Login failed' };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Network error during login' };
        }
    }

    /**
     * Student login with name and admission number
     */
    async studentLogin(name, admissionNumber) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/student/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    name: name,
                    admission_number: admissionNumber 
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.storeTokens(data.accessToken, data.refreshToken, data.user);
                return { success: true, user: data.user, student: data.student };
            } else {
                return { success: false, error: data.error || 'Login failed' };
            }
        } catch (error) {
            console.error('Student login error:', error);
            return { success: false, error: 'Network error during login' };
        }
    }

    /**
     * Signup (volunteer only)
     */
    async signup(userData) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/volunteer/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.storeTokens(data.accessToken, data.refreshToken, data.user);
                return { success: true, user: data.user };
            } else {
                return { success: false, error: data.error || 'Signup failed' };
            }
        } catch (error) {
            console.error('Signup error:', error);
            return { success: false, error: 'Network error during signup' };
        }
    }

    /**
     * Admin signup with secret code
     */
    async adminSignup(fullName, email, password, secretCode) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/admin/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    full_name: fullName,
                    email,
                    password,
                    secret_code: secretCode
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.storeTokens(data.accessToken, data.refreshToken, data.user);
                return { success: true, user: data.user };
            } else {
                return { success: false, error: data.error || 'Admin signup failed' };
            }
        } catch (error) {
            console.error('Admin signup error:', error);
            return { success: false, error: 'Network error during admin signup' };
        }
    }

    /**
     * Logout
     */
    async logout() {
        try {
            // Call logout endpoint if authenticated
            if (this.isAuthenticated()) {
                await this.makeAuthenticatedRequest(`${this.apiBaseUrl}/logout`, {
                    method: 'POST'
                });
            }
        } catch (error) {
            console.error('Logout API call failed:', error);
        } finally {
            // Always clear local storage
            this.clearAuth();
        }
    }

    /**
     * Verify current token and get user info
     */
    async verifyToken() {
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBaseUrl}/verify`);
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.authenticated) {
                    // Update stored user data
                    localStorage.setItem(this.userKey, JSON.stringify(data.user));
                    return { success: true, user: data.user };
                }
            }
            
            return { success: false };
        } catch (error) {
            console.error('Token verification failed:', error);
            return { success: false };
        }
    }

    /**
     * Redirect to appropriate login page based on current location
     */
    redirectToLogin() {
        const currentPath = window.location.pathname;
        let loginPath = '/volunteer/login.html';

        if (currentPath.includes('/admin/')) {
            loginPath = '/admin/login.html';
        } else if (currentPath.includes('/student/')) {
            loginPath = '/student/login.html';
        }

        // Store current URL for redirect after login
        sessionStorage.setItem('redirectAfterLogin', window.location.href);
        window.location.href = loginPath;
    }

    /**
     * Handle redirect after successful login
     */
    handlePostLoginRedirect() {
        const redirectUrl = sessionStorage.getItem('redirectAfterLogin');
        if (redirectUrl) {
            sessionStorage.removeItem('redirectAfterLogin');
            window.location.href = redirectUrl;
        } else {
            // Default redirect based on user role
            const user = this.getUser();
            if (user) {
                switch (user.role) {
                    case 'admin':
                        window.location.href = '/admin/dashboard.html';
                        break;
                    case 'student':
                        window.location.href = '/student/dashboard.html';
                        break;
                    case 'volunteer':
                    default:
                        window.location.href = '/volunteer/dashboard/students.html';
                        break;
                }
            }
        }
    }

    /**
     * Initialize authentication state on page load
     */
    async init() {
        if (this.isAuthenticated()) {
            // Verify token is still valid
            const verification = await this.verifyToken();
            if (!verification.success) {
                this.clearAuth();
                return false;
            }
            return true;
        }
        return false;
    }
}

// Create global instance
window.jwtAuth = new JWTAuth();

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await window.jwtAuth.init();
});
