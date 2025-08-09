/**
 * Enhanced Instant Call UI
 * Supports minimum duration, call history, persistent notifications, and background alerts
 */
class EnhancedInstantCallUI {
    constructor() {
        this.socket = null;
        this.currentCall = null;
        this.callHistory = [];
        this.persistentNotifications = [];
        this.audioContext = null;
        this.callSound = null;
        this.isTabFocused = true;
        this.notificationPermission = 'default';
        this.callTimer = null;
        this.minDurationTimer = null;
        this.retryTimeout = null;
        
        this.init();
    }
    
    async init() {
        console.log('🚀 Initializing Enhanced Instant Call UI...');
        
        // Initialize socket connection
        this.initializeSocket();
        
        // Check notification permission status (don't request automatically)
        this.checkNotificationPermission();
        
        // Set up tab focus detection
        this.setupTabFocusDetection();
        
        // Initialize audio context for sounds
        this.initializeAudio();
        
        // Load call history and persistent notifications
        await this.loadCallHistory();
        await this.loadPersistentNotifications();
        
        // Set up periodic cleanup
        this.setupPeriodicCleanup();
        
        console.log('✅ Enhanced Instant Call UI initialized');
    }
    
    initializeSocket() {
        if (typeof io === 'undefined') {
            console.error('❌ Socket.IO not loaded');
            return;
        }
        
        this.socket = io();
        
        // Enhanced instant call events
        this.socket.on('incoming-enhanced-instant-call', (data) => {
            console.log('📞 Incoming enhanced instant call:', data);
            this.handleIncomingEnhancedCall(data);
        });
        
        this.socket.on('call-accepted', (data) => {
            console.log('✅ Call accepted:', data);
            this.handleCallAccepted(data);
        });
        
        this.socket.on('call-rejected', (data) => {
            console.log('❌ Call rejected:', data);
            this.handleCallRejected(data);
        });
        
        this.socket.on('call-timeout', (data) => {
            console.log('⏰ Call timeout:', data);
            this.handleCallTimeout(data);
        });
        
        this.socket.on('min-duration-reached', (data) => {
            console.log('⏱️ Minimum duration reached:', data);
            this.handleMinDurationReached(data);
        });
        
        this.socket.on('instant-message-received', (data) => {
            console.log('💬 Instant message received:', data);
            this.handleInstantMessageReceived(data);
        });
        
        this.socket.on('connect', () => {
            console.log('🔌 Socket connected');
            this.joinUserRooms();
        });
        
        this.socket.on('disconnect', () => {
            console.log('🔌 Socket disconnected');
        });
    }
    
    async joinUserRooms() {
        try {
            // Try student endpoint first (for student dashboard)
            let response = await fetch('/api/v1/admin/me', {
                credentials: 'include'
            });
            
            let userData = null;
            let userId = null;
            let userRole = null;
            
            if (response.ok) {
                // Student authentication
                userData = await response.json();
                console.log('🎓 Student authenticated:', userData);
                console.log('🔍 Student data structure:', JSON.stringify(userData, null, 2));
                
                // Try different possible paths for student ID
                userId = userData.student?.studentId || userData.student?.id || userData.id || userData.student_id;
                userRole = 'student';
                
                console.log('🆔 Student ID extracted:', userId);
                
                if (!userId) {
                    console.error('❌ Could not extract student ID from:', userData);
                }
            } else {
                // Try general auth endpoint (for volunteers/admins)
                response = await fetch('/api/v1/auth/check', {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    userData = await response.json();
                    userId = userData.user.id;
                    userRole = userData.user.role;
                    console.log('👥 Volunteer/Admin authenticated:', userData);
                }
            }
            
            if (userId && userRole) {
                // Join user-specific rooms for cross-tab notifications
                this.socket.emit('join-room', `user_${userId}`);
                this.socket.emit('join-room', `${userRole}_${userId}`);
                
                console.log(`🏠 Joined rooms: user_${userId}, ${userRole}_${userId}`);
            } else {
                console.log('⚠️ User not authenticated, skipping room join');
            }
        } catch (error) {
            console.error('❌ Error joining user rooms:', error);
        }
    }
    
    checkNotificationPermission() {
        if ('Notification' in window) {
            this.notificationPermission = Notification.permission;
            console.log('🔔 Notification permission status:', this.notificationPermission);
        }
    }
    
    async requestNotificationPermission() {
        if ('Notification' in window && this.notificationPermission === 'default') {
            this.notificationPermission = await Notification.requestPermission();
            console.log('🔔 Notification permission requested:', this.notificationPermission);
            return this.notificationPermission;
        }
        return this.notificationPermission;
    }
    
    setupTabFocusDetection() {
        document.addEventListener('visibilitychange', () => {
            this.isTabFocused = !document.hidden;
            console.log('👁️ Tab focus changed:', this.isTabFocused);
        });
        
        window.addEventListener('focus', () => {
            this.isTabFocused = true;
        });
        
        window.addEventListener('blur', () => {
            this.isTabFocused = false;
        });
    }
    
    async initializeAudio() {
        try {
            // Create audio context for call sounds
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create call sound (simple tone)
            this.callSound = this.createCallTone();
            
            console.log('🔊 Audio initialized');
        } catch (error) {
            console.error('❌ Error initializing audio:', error);
        }
    }
    
    createCallTone() {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        
        return { oscillator, gainNode };
    }
    
    playCallSound() {
        try {
            // Try Web Audio API first
            if (this.audioContext) {
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
                
                const { oscillator, gainNode } = this.createCallTone();
                const now = this.audioContext.currentTime;
                
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(0.1, now + 0.1);
                gainNode.gain.setValueAtTime(0.1, now + 1);
                gainNode.gain.linearRampToValueAtTime(0, now + 1.1);
                
                oscillator.start(now);
                oscillator.stop(now + 1.5);
                
                console.log('🔊 Playing call sound via Web Audio API');
            } else if (this.fallbackAudio) {
                // Use HTML5 audio fallback
                this.fallbackAudio.currentTime = 0;
                this.fallbackAudio.play().catch(e => console.log('Audio play failed:', e));
                console.log('🔊 Playing call sound via HTML5 Audio');
            } else {
                console.log('⚠️ No audio system available');
            }
        } catch (error) {
            console.error('❌ Error playing call sound:', error);
        }
    }
    
    stopCallSound() {
        // Call sound stops automatically after 1.5 seconds
        console.log('🔇 Call sound stopped');
    }
    
    async loadCallHistory() {
        try {
            const response = await fetch('/api/v1/enhanced-instant-calls/history', {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                this.callHistory = data.history || [];
                console.log('📋 Loaded call history:', this.callHistory.length, 'entries');
            }
        } catch (error) {
            console.error('❌ Error loading call history:', error);
        }
    }
    
    async loadPersistentNotifications() {
        try {
            const response = await fetch('/api/v1/enhanced-instant-calls/notifications?unreadOnly=true', {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                this.persistentNotifications = data.notifications || [];
                console.log('🔔 Loaded persistent notifications:', this.persistentNotifications.length, 'entries');
                
                // Process any active instant call notifications
                this.processActiveNotifications();
            }
        } catch (error) {
            console.error('❌ Error loading persistent notifications:', error);
        }
    }
    
    processActiveNotifications() {
        const activeCallNotifications = this.persistentNotifications.filter(
            n => n.notification_type === 'instant_call' && n.requires_action && !n.is_dismissed
        );
        
        activeCallNotifications.forEach(notification => {
            try {
                let data;
                
                // Handle different data types
                if (typeof notification.data === 'string') {
                    data = JSON.parse(notification.data);
                } else if (typeof notification.data === 'object') {
                    data = notification.data;
                } else {
                    console.error('❌ Invalid notification data type:', typeof notification.data, notification.data);
                    return;
                }
                
                console.log('🔔 Processing active notification:', data);
                this.showIncomingCallUI(data, notification.id);
            } catch (error) {
                console.error('❌ Error processing notification:', error, notification);
            }
        });
    }
    
    setupPeriodicCleanup() {
        // Clean up expired notifications every 30 seconds
        setInterval(() => {
            this.cleanupExpiredNotifications();
        }, 30000);
    }
    
    cleanupExpiredNotifications() {
        const now = new Date();
        this.persistentNotifications = this.persistentNotifications.filter(notification => {
            if (notification.expires_at) {
                return new Date(notification.expires_at) > now;
            }
            return true;
        });
    }
    
    async handleIncomingEnhancedCall(data) {
        console.log('📞 Handling incoming enhanced call:', data);
        
        // Request notification permission if needed (user-triggered event)
        if (this.notificationPermission === 'default') {
            await this.requestNotificationPermission();
        }
        
        this.currentCall = {
            meetingId: data.meetingId,
            volunteer: data.volunteer,
            callData: data.callData,
            actions: data.actions,
            startTime: new Date()
        };
        
        // Show incoming call UI
        this.showIncomingCallUI(data);
        
        // Play call sound repeatedly
        this.startCallSoundLoop();
        
        // Show browser notification if tab not focused
        if (!this.isTabFocused) {
            this.showBrowserNotification(
                `Incoming call from ${data.volunteer.name}`,
                'Tap to answer the call',
                () => {
                    window.focus();
                    this.showIncomingCallUI(data);
                }
            );
        }
        
        // Vibrate if supported
        if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200, 100, 200]);
        }
    }
    
    showIncomingCallUI(callData, notificationId = null) {
        console.log('📞 showIncomingCallUI called with data:', callData);
        
        // Stop any existing call sound
        this.stopCallSound();
        
        // Debug: Log the entire callData to understand structure
        console.log('🔍 Full callData received:', callData);
        
        // Extract volunteer information - backend sends it as top-level 'volunteer' property
        let volunteer = callData.volunteer || {};
        
        // If volunteer info is still not available, try other extraction methods
        if (!volunteer.name && !volunteer.full_name) {
            // Try from nested callData.volunteer
            if (callData.callData && callData.callData.volunteer) {
                volunteer = callData.callData.volunteer;
                console.log('📋 Extracted volunteer from callData.callData:', volunteer);
            }
            // Try from notification data if available
            else if (callData.data) {
                try {
                    const notificationData = typeof callData.data === 'string' ? JSON.parse(callData.data) : callData.data;
                    volunteer = {
                        name: notificationData.volunteerName,
                        photo: notificationData.volunteerPhoto,
                        email: notificationData.volunteerEmail,
                        id: notificationData.volunteerId
                    };
                    console.log('📋 Extracted volunteer from notification data:', volunteer);
                } catch (e) {
                    console.log('⚠️ Could not parse notification data:', e);
                }
            }
            // Try from direct callData properties as fallback
            else {
                volunteer = {
                    name: callData.volunteerName,
                    photo: callData.volunteerPhoto,
                    email: callData.volunteerEmail,
                    id: callData.volunteerId
                };
                console.log('📋 Extracted volunteer from direct callData properties:', volunteer);
            }
        }
        
        const volunteerName = volunteer.name || volunteer.full_name || volunteer.fullName || 'Unknown Volunteer';
        const volunteerEmail = volunteer.email || 'Volunteer';
        
        // Construct proper volunteer photo path using API endpoint
        let volunteerPhoto = '/images/default-profile.png';
        const photoFilename = volunteer.photo || volunteer.profile_image;
        if (photoFilename && photoFilename !== '/images/default-profile.png') {
            volunteerPhoto = `/api/v1/profile/image/${photoFilename}`;
        }
        
        console.log('👥 Volunteer info extracted:', { volunteerName, volunteerEmail, volunteerPhoto });
        
        // Remove any existing call UI
        this.hideIncomingCallUI();
        
        const callUI = document.createElement('div');
        callUI.id = 'enhanced-incoming-call-ui';
        callUI.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90';
        
        callUI.innerHTML = `
            <div class="bg-white rounded-3xl p-8 max-w-md w-full mx-4 text-center shadow-2xl">
                <!-- Animated pulse rings -->
                <div class="relative mb-6">
                    <div class="absolute inset-0 rounded-full bg-green-400 opacity-75 animate-ping"></div>
                    <div class="absolute inset-2 rounded-full bg-green-400 opacity-50 animate-ping" style="animation-delay: 0.5s;"></div>
                    <div class="relative w-24 h-24 mx-auto rounded-full overflow-hidden bg-gray-200">
                        <img src="${volunteerPhoto}" 
                             alt="${volunteerName}" 
                             class="w-full h-full object-cover"
                             onerror="this.onerror=null; this.src='/images/default-profile.png'">
                    </div>
                </div>
                
                <!-- Call info -->
                <h2 class="text-2xl font-bold text-gray-800 mb-2">Incoming Call</h2>
                <p class="text-lg text-gray-600 mb-1">${volunteerName}</p>
                <p class="text-sm text-gray-500 mb-6">${volunteerEmail}</p>
                
                <!-- Timer -->
                <div class="mb-6">
                    <div class="text-3xl font-mono text-gray-800" id="call-timer">00:30</div>
                    <div class="text-sm text-gray-500">Call will timeout</div>
                </div>
                
                <!-- Action buttons -->
                <div class="flex justify-center space-x-4 mb-4">
                    <!-- Reject button -->
                    <button id="reject-call-btn" 
                            class="w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                    
                    <!-- Accept button -->
                    <button id="accept-call-btn" 
                            class="w-20 h-20 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors transform scale-110">
                        <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
                        </svg>
                    </button>
                    
                    <!-- Message button -->
                    <button id="message-call-btn" 
                            class="w-16 h-16 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                        </svg>
                    </button>
                </div>
                
                <!-- Quick message buttons -->
                <div class="space-y-2">
                    <button class="quick-message-btn w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
                            data-message="I'm busy right now, can we talk later?">
                        I'm busy right now
                    </button>
                    <button class="quick-message-btn w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
                            data-message="Give me 5 minutes please">
                        Give me 5 minutes
                    </button>
                    <button class="quick-message-btn w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
                            data-message="Let's schedule for later today">
                        Schedule for later
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(callUI);
        
        // Set up event listeners
        this.setupCallUIEventListeners(callData, notificationId);
        
        // Start countdown timer
        this.startCallTimer(callData.callData?.timeoutSeconds || 30);
    }
    
    setupCallUIEventListeners(callData, notificationId) {
        const acceptBtn = document.getElementById('accept-call-btn');
        const rejectBtn = document.getElementById('reject-call-btn');
        const messageBtn = document.getElementById('message-call-btn');
        const quickMessageBtns = document.querySelectorAll('.quick-message-btn');
        
        acceptBtn?.addEventListener('click', () => {
            this.acceptCall(callData.meetingId);
        });
        
        rejectBtn?.addEventListener('click', () => {
            this.rejectCall(callData.meetingId);
        });
        
        messageBtn?.addEventListener('click', () => {
            this.showMessageInput(callData.meetingId);
        });
        
        quickMessageBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const message = btn.dataset.message;
                this.sendQuickMessage(callData.meetingId, message);
            });
        });
    }
    
    startCallTimer(timeoutSeconds) {
        let remainingSeconds = timeoutSeconds;
        const timerElement = document.getElementById('call-timer');
        
        this.callTimer = setInterval(() => {
            remainingSeconds--;
            
            if (timerElement) {
                const minutes = Math.floor(remainingSeconds / 60);
                const seconds = remainingSeconds % 60;
                timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            if (remainingSeconds <= 0) {
                this.handleCallTimeout();
            }
        }, 1000);
    }
    
    startCallSoundLoop() {
        // Play call sound every 2 seconds
        this.callSoundInterval = setInterval(() => {
            this.playCallSound();
        }, 2000);
        
        // Play initial sound
        this.playCallSound();
    }
    
    stopCallSoundLoop() {
        if (this.callSoundInterval) {
            clearInterval(this.callSoundInterval);
            this.callSoundInterval = null;
        }
        this.stopCallSound();
    }
    
    showBrowserNotification(title, body, clickHandler) {
        if (this.notificationPermission === 'granted') {
            const notification = new Notification(title, {
                body: body,
                icon: '/images/talktime-icon.png',
                badge: '/images/talktime-badge.png',
                tag: 'instant-call',
                requireInteraction: true,
                actions: [
                    { action: 'answer', title: 'Answer' },
                    { action: 'decline', title: 'Decline' }
                ]
            });
            
            notification.onclick = clickHandler;
            
            // Auto-close after 30 seconds
            setTimeout(() => {
                notification.close();
            }, 30000);
        }
    }
    
    async acceptCall(meetingId) {
        try {
            console.log('✅ Accepting call:', meetingId);
            
            const response = await fetch('/api/v1/enhanced-instant-calls/respond', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    meetingId: meetingId,
                    action: 'accept'
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Call accepted successfully:', data);
                
                // Hide call UI and redirect to call room with student role
                this.hideIncomingCallUI();
                window.location.href = `/call.html?room=${data.roomId}&role=student`;
            } else {
                console.error('❌ Error accepting call:', response.statusText);
                this.showErrorMessage('Failed to accept call');
            }
        } catch (error) {
            console.error('❌ Error accepting call:', error);
            this.showErrorMessage('Failed to accept call');
        }
    }
    
    async rejectCall(meetingId, message = null) {
        try {
            console.log('❌ Rejecting call:', meetingId);
            
            const response = await fetch('/api/v1/enhanced-instant-calls/respond', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    meetingId: meetingId,
                    action: 'reject',
                    message: message
                })
            });
            
            if (response.ok) {
                console.log('❌ Call rejected successfully');
                this.hideIncomingCallUI();
                this.showSuccessMessage('Call declined');
            } else {
                console.error('❌ Error rejecting call:', response.statusText);
                this.showErrorMessage('Failed to decline call');
            }
        } catch (error) {
            console.error('❌ Error rejecting call:', error);
            this.showErrorMessage('Failed to decline call');
        }
    }
    
    async sendQuickMessage(meetingId, message) {
        try {
            console.log('💬 Sending quick message:', message);
            
            const response = await fetch('/api/v1/enhanced-instant-calls/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    meetingId: meetingId,
                    message: message,
                    messageType: 'quick_response'
                })
            });
            
            if (response.ok) {
                console.log('💬 Message sent successfully');
                this.hideIncomingCallUI();
                this.showSuccessMessage('Message sent');
            } else {
                console.error('❌ Error sending message:', response.statusText);
                this.showErrorMessage('Failed to send message');
            }
        } catch (error) {
            console.error('❌ Error sending message:', error);
            this.showErrorMessage('Failed to send message');
        }
    }
    
    async showMessageInput(meetingId) {
        const messageInput = await window.showInput('Enter your message:', {
            title: 'Send Message',
            placeholder: 'Type your message here...',
            confirmText: 'Send',
            cancelText: 'Cancel'
        });
        if (messageInput && messageInput.trim()) {
            this.sendQuickMessage(meetingId, messageInput.trim());
        }
    }
    
    hideIncomingCallUI() {
        const callUI = document.getElementById('enhanced-incoming-call-ui');
        if (callUI) {
            callUI.remove();
        }
        
        // Stop call sound and timer
        this.stopCallSoundLoop();
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }
    }
    
    handleCallAccepted(data) {
        console.log('✅ Call was accepted:', data);
        this.hideIncomingCallUI();
        
        if (data.redirectUrl) {
            window.location.href = data.redirectUrl;
        }
    }
    
    handleCallRejected(data) {
        console.log('❌ Call was rejected:', data);
        this.hideIncomingCallUI();
        
        this.showErrorMessage(`Call declined: ${data.reason || 'No reason provided'}`);
        
        if (data.canRetry && data.retryCooldownSeconds) {
            this.showRetryOption(data.retryCooldownSeconds);
        }
    }
    
    handleCallTimeout(data = null) {
        console.log('⏰ Call timed out:', data);
        this.hideIncomingCallUI();
        
        if (data) {
            this.showErrorMessage(data.message || 'Call timed out');
        } else {
            this.showErrorMessage('Call timed out - no response');
        }
    }
    
    handleMinDurationReached(data) {
        console.log('⏱️ Minimum duration reached:', data);
        
        if (data.canEndCall) {
            this.showMinDurationNotification(data);
        }
    }
    
    handleInstantMessageReceived(data) {
        console.log('💬 Instant message received:', data);
        
        this.showMessageNotification(data);
        
        // Add to call history
        this.addToCallHistory({
            type: 'message_received',
            data: data,
            timestamp: new Date()
        });
    }
    
    showMinDurationNotification(data) {
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 z-50 bg-green-500 text-white p-4 rounded-lg shadow-lg max-w-sm';
        notification.innerHTML = `
            <div class="flex items-center">
                <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                    <div class="font-semibold">Minimum Duration Reached</div>
                    <div class="text-sm">${data.message}</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
    
    showMessageNotification(data) {
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 z-50 bg-blue-500 text-white p-4 rounded-lg shadow-lg max-w-sm';
        notification.innerHTML = `
            <div class="flex items-center">
                <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                </svg>
                <div>
                    <div class="font-semibold">Message from ${data.sender.name}</div>
                    <div class="text-sm">${data.message}</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
    
    showRetryOption(cooldownSeconds) {
        setTimeout(() => {
            const retryNotification = document.createElement('div');
            retryNotification.className = 'fixed bottom-4 right-4 z-50 bg-yellow-500 text-white p-4 rounded-lg shadow-lg';
            retryNotification.innerHTML = `
                <div class="flex items-center">
                    <div class="mr-3">
                        <div class="font-semibold">Retry Call?</div>
                        <div class="text-sm">You can try calling again</div>
                    </div>
                    <button id="retry-call-btn" class="bg-white text-yellow-500 px-3 py-1 rounded font-semibold hover:bg-gray-100">
                        Retry
                    </button>
                </div>
            `;
            
            document.body.appendChild(retryNotification);
            
            document.getElementById('retry-call-btn')?.addEventListener('click', () => {
                retryNotification.remove();
                // Trigger retry logic here
                this.retryLastCall();
            });
            
            setTimeout(() => {
                retryNotification.remove();
            }, 10000);
        }, cooldownSeconds * 1000);
    }
    
    retryLastCall() {
        if (this.currentCall) {
            // Implement retry logic
            console.log('🔄 Retrying last call...');
        }
    }
    
    addToCallHistory(entry) {
        this.callHistory.unshift(entry);
        
        // Keep only the latest entries
        if (this.callHistory.length > 50) {
            this.callHistory = this.callHistory.slice(0, 50);
        }
    }
    
    showSuccessMessage(message) {
        this.showToast(message, 'success');
    }
    
    showErrorMessage(message) {
        this.showToast(message, 'error');
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
        
        toast.className = `fixed bottom-4 left-4 z-50 ${bgColor} text-white p-4 rounded-lg shadow-lg max-w-sm`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
    
    // Public API methods
    getCallHistory() {
        return this.callHistory;
    }
    
    getPersistentNotifications() {
        return this.persistentNotifications;
    }
    
    getCurrentCall() {
        return this.currentCall;
    }
}

// Initialize enhanced instant call UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.enhancedInstantCallUI = new EnhancedInstantCallUI();
});

// Make class available globally for browser use
window.EnhancedInstantCallUI = EnhancedInstantCallUI;
