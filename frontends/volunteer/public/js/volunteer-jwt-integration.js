/**
 * Volunteer Interface JWT Integration
 * Replaces all session-based authentication with JWT tokens for volunteer interface
 */

// Initialize volunteer authentication on page load
document.addEventListener('DOMContentLoaded', async function() {
    // Check if user is authenticated as volunteer
    const isAuthenticated = await window.TalkTimeAuth.initializeAuth('volunteer');
    
    if (!isAuthenticated) {
        console.log('Volunteer authentication failed');
        return;
    }
    
    console.log('Volunteer authenticated successfully');
    updateVolunteerUI();
});

/**
 * Update volunteer UI with authenticated user info
 */
function updateVolunteerUI() {
    const user = window.TalkTimeAuth.getUser();
    if (user && user.role === 'volunteer') {
        // Update volunteer name in UI if elements exist
        const volunteerNameElements = document.querySelectorAll('.volunteer-name, .user-name');
        volunteerNameElements.forEach(element => {
            element.textContent = user.fullName || user.name || 'Volunteer';
        });
        
        // Update volunteer email in UI if elements exist
        const volunteerEmailElements = document.querySelectorAll('.volunteer-email, .user-email');
        volunteerEmailElements.forEach(element => {
            element.textContent = user.email || '';
        });
        
        // Update volunteer type indicators if elements exist
        if (user.isStudentVolunteer) {
            const studentVolunteerElements = document.querySelectorAll('.student-volunteer-indicator');
            studentVolunteerElements.forEach(element => {
                element.style.display = 'block';
            });
        }
    }
}

/**
 * Volunteer logout function
 */
async function volunteerLogout() {
    try {
        await window.TalkTimeAuth.logout('/api/v1/auth/logout');
        window.location.href = '/volunteer/login';
    } catch (error) {
        console.error('Logout failed:', error);
        // Force logout even if server call fails
        window.TalkTimeAuth.clearAuth();
        window.location.href = '/volunteer/login';
    }
}

/**
 * Make authenticated volunteer API request
 */
async function makeVolunteerRequest(url, options = {}) {
    try {
        return await window.TalkTimeAuth.authenticatedRequest(url, options);
    } catch (error) {
        console.error('Volunteer API request failed:', error);
        throw error;
    }
}

/**
 * Volunteer login function
 */
async function volunteerLogin(credentials) {
    try {
        const loginData = await window.TalkTimeAuth.login(credentials, '/api/v1/auth/login');
        
        if (loginData.success && loginData.user.role === 'volunteer') {
            console.log('Volunteer login successful');
            window.location.href = '/volunteer/dashboard/students';
            return loginData;
        } else {
            throw new Error('Invalid volunteer credentials');
        }
    } catch (error) {
        console.error('Volunteer login failed:', error);
        throw error;
    }
}

/**
 * Volunteer signup function
 */
async function volunteerSignup(signupData) {
    try {
        const response = await window.TalkTimeAuth.login(signupData, '/api/v1/auth/signup');
        
        if (response.success && response.user.role === 'volunteer') {
            console.log('Volunteer signup successful');
            window.location.href = '/volunteer/dashboard/students';
            return response;
        } else {
            throw new Error('Volunteer signup failed');
        }
    } catch (error) {
        console.error('Volunteer signup failed:', error);
        throw error;
    }
}

// Expose volunteer functions globally
window.volunteerLogout = volunteerLogout;
window.makeVolunteerRequest = makeVolunteerRequest;
window.volunteerLogin = volunteerLogin;
window.volunteerSignup = volunteerSignup;
