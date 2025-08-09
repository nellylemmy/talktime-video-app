/**
 * Student Interface JWT Integration
 * Replaces all session-based authentication with JWT tokens for student interface
 */

// Initialize student authentication on page load
document.addEventListener('DOMContentLoaded', async function() {
    // Check if user is authenticated as student
    const isAuthenticated = await window.TalkTimeAuth.initializeAuth('student');
    
    if (!isAuthenticated) {
        console.log('Student authentication failed');
        return;
    }
    
    console.log('Student authenticated successfully');
    updateStudentUI();
});

/**
 * Update student UI with authenticated user info
 */
function updateStudentUI() {
    const user = window.TalkTimeAuth.getUser();
    if (user && user.role === 'student') {
        // Update student name in UI if elements exist
        const studentNameElements = document.querySelectorAll('.student-name, .user-name');
        studentNameElements.forEach(element => {
            element.textContent = user.fullName || 'Student';
        });
        
        // Update admission number in UI if elements exist
        const admissionElements = document.querySelectorAll('.admission-number');
        admissionElements.forEach(element => {
            element.textContent = user.admissionNumber || '';
        });
    }
}

/**
 * Student logout function
 */
async function studentLogout() {
    try {
        await window.TalkTimeAuth.logout('/api/v1/student/logout');
        window.location.href = '/student/login';
    } catch (error) {
        console.error('Logout failed:', error);
        // Force logout even if server call fails
        window.TalkTimeAuth.clearAuth();
        window.location.href = '/student/login';
    }
}

/**
 * Make authenticated student API request
 */
async function makeStudentRequest(url, options = {}) {
    try {
        return await window.TalkTimeAuth.authenticatedRequest(url, options);
    } catch (error) {
        console.error('Student API request failed:', error);
        throw error;
    }
}

/**
 * Student login function
 */
async function studentLogin(credentials) {
    try {
        const loginData = await window.TalkTimeAuth.login(credentials, '/api/v1/auth/student/login');
        
        if (loginData.success && loginData.user.role === 'student') {
            console.log('Student login successful');
            window.location.href = '/student/dashboard';
            return loginData;
        } else {
            throw new Error('Invalid student credentials');
        }
    } catch (error) {
        console.error('Student login failed:', error);
        throw error;
    }
}

// Expose student functions globally
window.studentLogout = studentLogout;
window.makeStudentRequest = makeStudentRequest;
window.studentLogin = studentLogin;
