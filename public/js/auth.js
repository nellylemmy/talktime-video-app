// Authentication Manager
const AuthManager = {
    // Current user session
    currentUser: null,

    // Login a user
    login(email, password, userType) {
        // In a real app, this would make an API call to authenticate
        // For now, we'll mock the authentication using our data
        return new Promise((resolve, reject) => {
            const users = DataManager.getUsersByType(userType === 'volunteer' ? 'volunteers' : 'students');
            const user = users.find(u => u.email === email);
            
            if (user && user.password === password) { // In real app, never store plain text passwords
                this.currentUser = {
                    ...user,
                    userType,
                    isLoggedIn: true
                };
                resolve(user);
            } else {
                reject(new Error('Invalid credentials'));
            }
        });
    },

    // Register a new user
    register(userData, userType) {
        return new Promise((resolve, reject) => {
            // Generate unique ID
            const prefix = userType === 'volunteer' ? 'vol' : 'stu';
            const id = `${prefix}-${Math.random().toString(36).substring(2, 5)}`;
            
            // Add ID to user data
            const user = {
                id,
                ...userData,
                userType,
                createdAt: new Date().toISOString()
            };

            // Add to appropriate user array
            if (userType === 'volunteer') {
                DataManager.data.users.volunteers.push(user);
            } else {
                DataManager.data.users.students.push(user);
            }

            // Set as current user
            this.currentUser = {
                ...user,
                isLoggedIn: true
            };
            
            resolve(user);
        });
    },

    // Logout current user
    logout() {
        this.currentUser = null;
        // In a real app, clear session cookies/tokens
        return Promise.resolve();
    },

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    },

    // Check if user is logged in
    isLoggedIn() {
        return !!this.currentUser;
    },

    // Get user type
    getUserType() {
        return this.currentUser?.userType;
    }
};

// Export for use in other modules
window.AuthManager = AuthManager;
