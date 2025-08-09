// Data Manager
const DataManager = {
    // Load initial data from JSON
    loadInitialData() {
        return fetch('/data.json')
            .then(response => response.json())
            .then(data => {
                this.data = data;
                return data;
            });
    },

    // Get user data by ID
    getUserById(userId) {
        const isStudent = userId.startsWith('stu');
        return this.data.users[isStudent ? 'students' : 'volunteers'].find(user => user.id === userId);
    },

    // Get all users of a specific type
    getUsersByType(type) {
        return this.data.users[type];
    },

    // Get meetings for a specific user
    getMeetingsForUser(userId) {
        return this.data.meetings.filter(meeting => 
            meeting.volunteerId === userId || meeting.studentId === userId
        );
    },

    // Get notifications for a specific user
    getNotificationsForUser(userId) {
        return this.data.notifications.filter(notif => notif.userId === userId);
    },

    // Add new meeting
    addMeeting(meeting) {
        this.data.meetings.push(meeting);
        // In a real app, this would trigger a backend update
        return meeting;
    },

    // Update meeting status
    updateMeetingStatus(meetingId, status) {
        const meeting = this.data.meetings.find(m => m.id === meetingId);
        if (meeting) {
            meeting.status = status;
            // In a real app, this would trigger a backend update
            return meeting;
        }
        return null;
    },

    // Add notification
    addNotification(notification) {
        this.data.notifications.push(notification);
        // In a real app, this would trigger a backend update
        return notification;
    }
};

// Initialize data when the page loads
window.addEventListener('load', () => {
    DataManager.loadInitialData()
        .then(data => {
            console.log('Data loaded successfully:', data);
        })
        .catch(error => {
            console.error('Error loading data:', error);
        });
});
