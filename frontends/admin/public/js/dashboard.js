// Dashboard Manager
const DashboardManager = {
    // Initialize dashboard
    init() {
        // Set up event listeners
        this.setupEventListeners();
        
        // Render initial content
        this.renderDashboard();
    },

    // Set up event listeners
    setupEventListeners() {
        // Logout button
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.handleLogout();
        });

        // Schedule meeting form
        const scheduleForm = document.getElementById('schedule-form');
        if (scheduleForm) {
            scheduleForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleScheduleMeeting(e);
            });
        }
    },

    // Handle logout
    handleLogout() {
        AuthManager.logout()
            .then(() => {
                // Show landing page
                this.showPage('landing-page');
                // Clear current user data
                this.currentUser = null;
                // Show success message
                this.showNotification('Successfully logged out', 'success');
            })
            .catch(error => {
                this.showNotification('Error logging out: ' + error.message, 'error');
            });
    },

    // Handle schedule meeting
    handleScheduleMeeting(event) {
        const form = event.target;
        const meetingType = form.elements['meeting-type'].value;
        const meetingTime = form.elements['meeting-time'].value;
        const notes = form.elements['meeting-notes'].value;

        // Get current user
        const currentUser = AuthManager.getCurrentUser();
        if (!currentUser) {
            this.showNotification('Please login first', 'error');
            return;
        }

        // Create meeting object
        const meeting = {
            id: 'meet-' + Math.random().toString(36).substring(2, 5),
            status: 'scheduled',
            scheduledTime: meetingTime,
            duration: 60, // Default duration
            topic: meetingType,
            notes,
            roomCode: 'ROOM-' + Math.random().toString(36).substring(2, 5),
            createdAt: new Date().toISOString()
        };

        // Add meeting to data
        if (currentUser.userType === 'volunteer') {
            meeting.volunteerId = currentUser.id;
            // For now, we'll assign to first available student
            const students = DataManager.getUsersByType('students');
            if (students.length > 0) {
                meeting.studentId = students[0].id;
            }
        } else {
            meeting.studentId = currentUser.id;
            // For now, we'll assign to first available volunteer
            const volunteers = DataManager.getUsersByType('volunteers');
            if (volunteers.length > 0) {
                meeting.volunteerId = volunteers[0].id;
            }
        }

        // Add meeting to data
        DataManager.addMeeting(meeting)
            .then(() => {
                // Update UI
                this.renderMeetings();
                // Show success message
                this.showNotification('Meeting scheduled successfully', 'success');
                // Reset form
                form.reset();
            })
            .catch(error => {
                this.showNotification('Error scheduling meeting: ' + error.message, 'error');
            });
    },

    // Render dashboard
    renderDashboard() {
        const currentUser = AuthManager.getCurrentUser();
        if (!currentUser) return;

        // Show user name
        document.getElementById('user-name').textContent = currentUser.name;

        // Render meetings
        this.renderMeetings();
    },

    // Render meetings list
    renderMeetings() {
        const currentUser = AuthManager.getCurrentUser();
        if (!currentUser) return;

        const meetingsList = document.getElementById('meetings-list');
        if (!meetingsList) return;

        // Get user's meetings
        const meetings = DataManager.getMeetingsForUser(currentUser.id);
        
        // Sort meetings by scheduled time
        meetings.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));

        // Create meeting elements
        const meetingElements = meetings.map(meeting => {
            const otherUser = currentUser.userType === 'volunteer' 
                ? DataManager.getUserById(meeting.studentId)
                : DataManager.getUserById(meeting.volunteerId);

            return `
                <div class="meeting-item">
                    <div class="meeting-info">
                        <h4>${meeting.topic}</h4>
                        <p><strong>With:</strong> ${otherUser?.name}</p>
                        <p><strong>Time:</strong> ${new Date(meeting.scheduledTime).toLocaleString()}</p>
                        <p><strong>Status:</strong> ${meeting.status}</p>
                        ${meeting.notes ? `<p><strong>Notes:</strong> ${meeting.notes}</p>` : ''}
                    </div>
                    <div class="meeting-actions">
                        <button onclick="DashboardManager.handleJoinMeeting('${meeting.roomCode}')">
                            <i class="fas fa-video"></i> Join
                        </button>
                    </div>
                </div>
            `;
        });

        // Update DOM
        meetingsList.innerHTML = meetingElements.join('');
    },

    // Handle join meeting
    handleJoinMeeting(roomCode) {
        // Get current user
        const currentUser = AuthManager.getCurrentUser();
        if (!currentUser) {
            this.showNotification('Please login first', 'error');
            return;
        }

        // Show call screen
        this.showPage('call-screen');

        // Initialize WebRTC call with room code
        CallManager.joinRoom(roomCode);
    },

    // Show notification
    showNotification(message, type = 'info') {
        const notificationContent = document.getElementById('notification-content');
        if (!notificationContent) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        notificationContent.appendChild(notification);

        // Remove notification after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    },

    // Show/hide pages
    showPage(pageId) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.add('hidden');
        });

        // Show selected page
        const page = document.getElementById(pageId);
        if (page) {
            page.classList.remove('hidden');
        }
    }
};

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    DashboardManager.init();
});
