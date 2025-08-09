/**
 * Admin Interface JWT Integration
 * Replaces all session-based authentication with JWT tokens for admin interface
 */

// Initialize admin authentication on page load
document.addEventListener('DOMContentLoaded', async function() {
    // Check if user is authenticated as admin
    const isAuthenticated = await window.TalkTimeAuth.initializeAuth('admin');
    
    if (!isAuthenticated) {
        console.log('Admin authentication failed');
        return;
    }
    
    console.log('Admin authenticated successfully');
    updateAdminUI();
});

/**
 * Update admin UI with authenticated user info
 */
function updateAdminUI() {
    const user = window.TalkTimeAuth.getUser();
    if (user && user.role === 'admin') {
        // Update admin name in UI if elements exist
        const adminNameElements = document.querySelectorAll('.admin-name, .user-name');
        adminNameElements.forEach(element => {
            element.textContent = user.fullName || user.name || 'Admin';
        });
        
        // Update admin email in UI if elements exist
        const adminEmailElements = document.querySelectorAll('.admin-email, .user-email');
        adminEmailElements.forEach(element => {
            element.textContent = user.email || '';
        });
    }
}

/**
 * Admin logout function
 */
async function adminLogout() {
    try {
        await window.TalkTimeAuth.logout('/api/v1/admin/logout');
        window.location.href = '/admin/login';
    } catch (error) {
        console.error('Logout failed:', error);
        // Force logout even if server call fails
        window.TalkTimeAuth.clearAuth();
        window.location.href = '/admin/login';
    }
}

/**
 * Make authenticated admin API request
 */
async function makeAdminRequest(url, options = {}) {
    try {
        return await window.TalkTimeAuth.authenticatedRequest(url, options);
    } catch (error) {
        console.error('Admin API request failed:', error);
        throw error;
    }
}

/**
 * Admin login function
 */
async function adminLogin(credentials) {
    try {
        const loginData = await window.TalkTimeAuth.login(credentials, '/api/v1/admin/login');
        
        if (loginData.success && loginData.user.role === 'admin') {
            console.log('Admin login successful');
            window.location.href = '/admin/dashboard';
            return loginData;
        } else {
            throw new Error('Invalid admin credentials');
        }
    } catch (error) {
        console.error('Admin login failed:', error);
        throw error;
    }
}

// Expose admin functions globally
window.adminLogout = adminLogout;
window.makeAdminRequest = makeAdminRequest;
window.adminLogin = adminLogin;
