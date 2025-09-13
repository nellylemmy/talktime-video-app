/**
 * Instant Call UI - Phone-like experience for students
 * Handles incoming call notifications, animations, sounds, and responses
 */

class InstantCallUI {
    constructor() {
        this.currentCall = null;
        this.callTimeout = null;
        this.ringInterval = null;
        this.pulseInterval = null;
        this.socket = null;
        this.audioContext = null;
        this.callSound = null;
        
        this.init();
    }
    
    init() {
        this.createCallOverlay();
        this.setupSocketConnection();
        this.setupAudioContext();
        this.checkForPendingCalls();
    }
    
    /**
     * Create the call overlay HTML structure
     */
    createCallOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'instant-call-overlay';
        overlay.className = 'instant-call-overlay hidden';
        overlay.innerHTML = `
            <div class="call-container">
                <div class="call-animation">
                    <div class="caller-avatar-container">
                        <div class="pulse-ring"></div>
                        <div class="pulse-ring pulse-ring-2"></div>
                        <div class="caller-avatar">
                            <img id="caller-photo" src="" alt="Volunteer calling" class="hidden">
                            <div id="caller-initials" class="caller-initials"></div>
                        </div>
                    </div>
                    
                    <div class="call-info">
                        <h2 class="call-title">Incoming Call</h2>
                        <p id="caller-name" class="caller-name"></p>
                        <p class="call-type">English Practice Session</p>
                        <div id="call-timer" class="call-timer">30</div>
                    </div>
                    
                    <div class="call-actions">
                        <button id="reject-call" class="call-btn reject-btn" title="Decline">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                            </svg>
                        </button>
                        
                        <button id="accept-call" class="call-btn accept-btn" title="Accept">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
                            </svg>
                        </button>
                        
                        <button id="send-message" class="call-btn message-btn" title="Send Message">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <!-- Quick Message Modal -->
                <div id="quick-message-modal" class="quick-message-modal hidden">
                    <div class="message-content">
                        <h3>Send Quick Message</h3>
                        <div class="quick-messages">
                            <button class="quick-msg-btn" data-message="I'm busy right now, can we talk in 5 minutes?">
                                🕐 Call me in 5 minutes
                            </button>
                            <button class="quick-msg-btn" data-message="I'm in class right now, can we schedule for later?">
                                📚 I'm in class now
                            </button>
                            <button class="quick-msg-btn" data-message="I'll be available in 30 minutes for our English practice.">
                                ⏰ Available in 30 minutes
                            </button>
                            <button class="quick-msg-btn" data-message="Thank you for calling! Can we reschedule for tomorrow?">
                                📅 Reschedule for tomorrow
                            </button>
                        </div>
                        <div class="custom-message">
                            <textarea id="custom-message-text" placeholder="Or type your own message..." maxlength="200"></textarea>
                            <div class="message-actions">
                                <button id="cancel-message" class="btn-secondary">Cancel</button>
                                <button id="send-custom-message" class="btn-primary">Send Message</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        this.setupEventListeners();
    }
    
    /**
     * Setup event listeners for call actions
     */
    setupEventListeners() {
        document.getElementById('accept-call').addEventListener('click', () => this.acceptCall());
        document.getElementById('reject-call').addEventListener('click', () => this.rejectCall());
        document.getElementById('send-message').addEventListener('click', () => this.showMessageModal());
        
        // Quick message buttons
        document.querySelectorAll('.quick-msg-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const message = e.target.dataset.message;
                this.sendMessage(message);
            });
        });
        
        // Custom message actions
        document.getElementById('send-custom-message').addEventListener('click', () => {
            const message = document.getElementById('custom-message-text').value.trim();
            if (message) {
                this.sendMessage(message);
            }
        });
        
        document.getElementById('cancel-message').addEventListener('click', () => {
            this.hideMessageModal();
        });
        
        // Close modal when clicking outside
        document.getElementById('quick-message-modal').addEventListener('click', (e) => {
            if (e.target.id === 'quick-message-modal') {
                this.hideMessageModal();
            }
        });
    }
    
    /**
     * Setup WebSocket connection for real-time notifications
     */
    setupSocketConnection() {
        // Connect to Socket.IO server
        this.socket = io();
        
        // Listen for incoming instant calls
        this.socket.on('incoming-instant-call', (callData) => {
            console.log('📞 Incoming instant call:', callData);
            this.showIncomingCall(callData);
        });
        
        // Listen for call timeout
        this.socket.on('instant-call-timeout', (data) => {
            console.log('⏰ Call timed out:', data);
            this.hideCall();
            this.showToast('Call expired', 'info');
        });
        
        // Handle connection events
        this.socket.on('connect', () => {
            console.log('🔌 Socket connected for instant calls');
        });
        
        this.socket.on('disconnect', () => {
            console.log('🔌 Socket disconnected');
        });
    }
    
    /**
     * Setup audio context for call sounds
     */
    setupAudioContext() {
        try {
            // Create audio context for call sounds
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.createCallSound();
        } catch (error) {
            console.warn('Audio context not supported:', error);
        }
    }
    
    /**
     * Create call sound using Web Audio API
     */
    createCallSound() {
        if (!this.audioContext) return;
        
        // Create a simple ringtone using oscillators
        this.callSound = {
            play: () => {
                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.1);
                
                gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
                
                oscillator.start(this.audioContext.currentTime);
                oscillator.stop(this.audioContext.currentTime + 0.5);
            }
        };
    }
    
    /**
     * Check for any pending instant calls on page load
     */
    async checkForPendingCalls() {
        try {
            const response = await fetch('/api/v1/instant-calls/pending/check', {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.hasPendingCall) {
                    console.log('📞 Found pending call on page load:', data.meeting);
                    
                    // Convert the pending call to the format expected by showIncomingCall
                    const callData = {
                        meetingId: data.meeting.id,
                        roomId: data.meeting.roomId,
                        volunteerId: data.meeting.volunteerId,
                        volunteerName: data.meeting.volunteerName,
                        volunteerPhoto: data.meeting.volunteerProfileImage,
                        callType: 'instant_english_practice',
                        callTimeout: data.meeting.callTimeout,
                        callInitiated: data.meeting.callInitiated,
                        timeoutSeconds: Math.max(0, Math.floor((new Date(data.meeting.callTimeout) - new Date()) / 1000)),
                        timestamp: data.meeting.timestamp
                    };
                    
                    this.showIncomingCall(callData);
                }
            }
        } catch (error) {
            console.error('Error checking for pending calls:', error);
        }
    }
    
    /**
     * Show incoming call UI with phone-like experience
     */
    showIncomingCall(callData) {
        this.currentCall = callData;
        
        // Update caller information
        const callerName = document.getElementById('caller-name');
        const callerPhoto = document.getElementById('caller-photo');
        const callerInitials = document.getElementById('caller-initials');
        const callTimer = document.getElementById('call-timer');
        
        callerName.textContent = callData.volunteerName;
        
        // Set caller photo or initials
        if (callData.volunteerPhoto) {
            // Use the API endpoint for serving profile images
            callerPhoto.src = `/api/v1/profile/image/${callData.volunteerPhoto}`;
            // Update volunteer avatar - prioritize profile image over nickname letter
            const volunteerAvatar = document.getElementById('volunteer-avatar-letter');
            const volunteerImage = document.getElementById('volunteer-avatar-image');
            
            if (callData.volunteer) {
                if (callData.volunteer.profile_image) {
                    // Show profile image if available
                    if (volunteerImage) {
                        volunteerImage.src = `/api/v1/volunteer/profile/image/${callData.volunteer.profile_image}`;
                        volunteerImage.classList.remove('hidden');
                    }
                    if (volunteerAvatar) {
                        volunteerAvatar.classList.add('hidden');
                    }
                } else {
                    // Show avatar letter
                    if (volunteerImage) {
                        volunteerImage.classList.add('hidden');
                    }
                    if (volunteerAvatar) {
                        const userName = callData.volunteer.nickname || callData.volunteer.username || callData.volunteer.name || 'V';
                        const avatarLetter = userName.charAt(0).toUpperCase();
                        volunteerAvatar.textContent = avatarLetter;
                        volunteerAvatar.classList.remove('hidden');
                    }
                }
            }
            callerInitials.classList.remove('hidden');
            callerPhoto.classList.add('hidden');
        }
        
        // Set initial timer
        callTimer.textContent = callData.timeoutSeconds || 30;
        
        // Show the call overlay
        const overlay = document.getElementById('instant-call-overlay');
        overlay.classList.remove('hidden');
        
        // Start animations and sound
        this.startCallAnimations();
        this.startCallSound();
        this.startCallTimer(callData.timeoutSeconds || 30);
        
        // Vibrate if supported
        if (navigator.vibrate) {
            navigator.vibrate([500, 200, 500, 200, 500]);
        }
        
        console.log('📞 Showing incoming call from:', callData.volunteerName);
    }
    
    /**
     * Start call animations (pulse rings, etc.)
     */
    startCallAnimations() {
        // Pulse rings are handled by CSS animations
        // Add any additional JavaScript animations here if needed
        
        const avatar = document.querySelector('.caller-avatar');
        avatar.classList.add('animate-bounce');
    }
    
    /**
     * Start call sound (ringtone)
     */
    startCallSound() {
        if (!this.callSound) return;
        
        // Play ringtone every 2 seconds
        this.ringInterval = setInterval(() => {
            try {
                this.callSound.play();
            } catch (error) {
                console.warn('Could not play call sound:', error);
            }
        }, 2000);
        
        // Play initial sound
        try {
            this.callSound.play();
        } catch (error) {
            console.warn('Could not play initial call sound:', error);
        }
    }
    
    /**
     * Start call timer countdown
     */
    startCallTimer(seconds) {
        const callTimer = document.getElementById('call-timer');
        let remainingSeconds = seconds;
        
        this.callTimeout = setInterval(() => {
            remainingSeconds--;
            callTimer.textContent = remainingSeconds;
            
            // Change color when time is running out
            if (remainingSeconds <= 10) {
                callTimer.classList.add('timer-warning');
            }
            
            if (remainingSeconds <= 0) {
                this.handleCallTimeout();
            }
        }, 1000);
    }
    
    /**
     * Handle call timeout
     */
    handleCallTimeout() {
        console.log('⏰ Call timed out');
        this.hideCall();
        this.showToast('Call expired', 'info');
    }
    
    /**
     * Accept the incoming call
     */
    async acceptCall() {
        if (!this.currentCall) return;
        
        console.log('✅ Accepting call:', this.currentCall.meetingId);
        
        try {
            const response = await fetch('/api/v1/instant-calls/respond', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    meetingId: this.currentCall.meetingId,
                    response: 'accepted'
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.hideCall();
                this.showToast('Joining call...', 'success');
                
                // Redirect to call room
                setTimeout(() => {
                    window.location.href = `/call.html?room=${this.currentCall.roomId}`;
                }, 1000);
            } else {
                this.showToast(data.message || 'Failed to accept call', 'error');
            }
        } catch (error) {
            console.error('Error accepting call:', error);
            this.showToast('Failed to accept call', 'error');
        }
    }
    
    /**
     * Reject the incoming call
     */
    async rejectCall() {
        if (!this.currentCall) return;
        
        console.log('❌ Rejecting call:', this.currentCall.meetingId);
        
        try {
            const response = await fetch('/api/v1/instant-calls/respond', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    meetingId: this.currentCall.meetingId,
                    response: 'rejected'
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.hideCall();
                this.showToast('Call declined', 'info');
            } else {
                this.showToast(data.message || 'Failed to decline call', 'error');
            }
        } catch (error) {
            console.error('Error rejecting call:', error);
            this.showToast('Failed to decline call', 'error');
        }
    }
    
    /**
     * Show message modal
     */
    showMessageModal() {
        const modal = document.getElementById('quick-message-modal');
        modal.classList.remove('hidden');
        
        // Clear custom message
        document.getElementById('custom-message-text').value = '';
    }
    
    /**
     * Hide message modal
     */
    hideMessageModal() {
        const modal = document.getElementById('quick-message-modal');
        modal.classList.add('hidden');
    }
    
    /**
     * Send message to volunteer
     */
    async sendMessage(message) {
        if (!this.currentCall || !message.trim()) return;
        
        console.log('💬 Sending message:', message);
        
        try {
            const response = await fetch('/api/v1/instant-calls/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    meetingId: this.currentCall.meetingId,
                    message: message.trim()
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.hideCall();
                this.showToast('Message sent successfully', 'success');
            } else {
                this.showToast(data.message || 'Failed to send message', 'error');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.showToast('Failed to send message', 'error');
        }
    }
    
    /**
     * Hide call overlay and cleanup
     */
    hideCall() {
        const overlay = document.getElementById('instant-call-overlay');
        overlay.classList.add('hidden');
        
        // Clear intervals and timeouts
        if (this.ringInterval) {
            clearInterval(this.ringInterval);
            this.ringInterval = null;
        }
        
        if (this.callTimeout) {
            clearInterval(this.callTimeout);
            this.callTimeout = null;
        }
        
        // Reset timer styling
        const callTimer = document.getElementById('call-timer');
        callTimer.classList.remove('timer-warning');
        
        // Reset avatar animation
        const avatar = document.querySelector('.caller-avatar');
        avatar.classList.remove('animate-bounce');
        
        // Hide message modal
        this.hideMessageModal();
        
        // Clear current call
        this.currentCall = null;
        
        console.log('📞 Call UI hidden and cleaned up');
    }
    
    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        // Add to page
        document.body.appendChild(toast);
        
        // Show toast
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Remove toast after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }
}

// Initialize instant call UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize on student pages
    if (window.location.pathname.includes('/student/')) {
        window.instantCallUI = new InstantCallUI();
        console.log('📞 Instant Call UI initialized for student');
    }
});
