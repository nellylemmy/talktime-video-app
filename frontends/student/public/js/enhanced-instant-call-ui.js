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

        console.log('🔌 Creating Socket.IO connection for instant calls...');
        // Explicitly connect to the backend with proper path
        this.socket = io(window.location.origin, {
            path: '/socket.io/',
            transports: ['websocket', 'polling']
        });

        // Log connection status
        this.socket.on('connect', () => {
            console.log('✅ Socket.IO connected for instant calls! Socket ID:', this.socket.id);
            // Join user rooms after connection
            this.joinUserRooms();
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Socket.IO disconnected for instant calls');
        });

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
    }
    
    async joinUserRooms() {
        try {
            // Get JWT token for authentication
            const token = window.TalkTimeAuth ? window.TalkTimeAuth.getToken() : null;
            if (!token) {
                console.log('⚠️ User not authenticated, skipping room join');
                return;
            }

            // CRITICAL: Use regular fetch instead of makeAuthenticatedRequest()
            // makeAuthenticatedRequest() triggers full logout on 401, which is too aggressive
            // for this non-critical operation. If token is expired, we should just skip
            // room join, NOT log the user out entirely.
            let response = await fetch('/api/v1/students/me/info', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            let userData = null;
            let userId = null;
            let userRole = null;
            
            if (response.ok) {
                // Student authentication
                userData = await response.json();
                console.log('🎓 Student authenticated:', userData);
                console.log('🔍 Student data structure:', JSON.stringify(userData, null, 2));

                // Extract student ID from the correct path
                if (userData.success && userData.data) {
                    userId = userData.data.id;
                } else {
                    userId = userData.student?.studentId || userData.student?.id || userData.id || userData.student_id;
                }
                userRole = 'student';

                console.log('🆔 Student ID extracted:', userId);

                if (!userId) {
                    console.error('❌ Could not extract student ID from:', userData);
                }
            } else if (response.status === 401) {
                // Token expired or invalid - gracefully skip room join
                // DO NOT trigger logout here - user may still have valid session for other operations
                console.log('⚠️ Token expired for student endpoint, trying volunteer endpoint...');

                // Try general auth endpoint (for volunteers/admins)
                response = await fetch('/api/v1/auth/check', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    userData = await response.json();
                    userId = userData.user.id;
                    userRole = userData.user.role;
                    console.log('👥 Volunteer/Admin authenticated:', userData);
                } else if (response.status === 401) {
                    // Both endpoints returned 401 - token is definitely expired
                    // But still don't logout - let the main page handle that decision
                    console.log('⚠️ Both auth endpoints returned 401 - token may be expired');
                    console.log('   Room join skipped, but NOT triggering logout from here');
                    return;
                }
            } else {
                // Try general auth endpoint (for volunteers/admins)
                response = await fetch('/api/v1/auth/check', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
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
                console.log('⚠️ Could not determine user identity, skipping room join');
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
            // Initialize incoming call sound using real audio file
            this.incomingCallAudio = new Audio('/shared/sounds/incoming.mp3');
            this.incomingCallAudio.loop = true;
            this.incomingCallAudio.volume = 0.7;

            // Preload the audio
            this.incomingCallAudio.load();

            console.log('🔊 Audio initialized with incoming.mp3');
        } catch (error) {
            console.error('❌ Error initializing audio:', error);
        }
    }

    playCallSound() {
        try {
            if (this.incomingCallAudio) {
                // Reset to beginning and play
                this.incomingCallAudio.currentTime = 0;
                this.incomingCallAudio.play()
                    .then(() => console.log('🔊 Playing incoming call sound'))
                    .catch(e => {
                        console.log('⚠️ Audio autoplay blocked, will play on user interaction:', e.message);
                    });
            } else {
                console.log('⚠️ No audio system available');
            }
        } catch (error) {
            console.error('❌ Error playing call sound:', error);
        }
    }

    stopCallSound() {
        try {
            if (this.incomingCallAudio) {
                this.incomingCallAudio.pause();
                this.incomingCallAudio.currentTime = 0;
                console.log('🔇 Incoming call sound stopped');
            }
        } catch (error) {
            console.error('❌ Error stopping call sound:', error);
        }
    }
    
    async loadCallHistory() {
        try {
            const token = window.TalkTimeAuth ? window.TalkTimeAuth.getToken() : null;
            if (!token) {
                console.log('⚠️ User not authenticated, skipping call history load');
                return;
            }

            // Legacy endpoint removed - skip loading call history for now
            console.log('📜 Call history endpoint deprecated, skipping');
            return;

            /* Commented out deprecated endpoint
            const response = await fetch('/api/v1/enhanced-instant-calls/history', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.callHistory = data.history || [];
                console.log('📋 Loaded call history:', this.callHistory.length, 'entries');
            } */
        } catch (error) {
            console.error('❌ Error loading call history:', error);
        }
    }
    
    async loadPersistentNotifications() {
        try {
            const token = window.TalkTimeAuth ? window.TalkTimeAuth.getToken() : null;
            if (!token) {
                console.log('⚠️ User not authenticated, skipping persistent notifications load');
                return;
            }

            // Skip loading persistent notifications for now - endpoint not implemented
            console.log('📝 Persistent notifications endpoint not available, skipping');
            this.persistentNotifications = [];
            return;

            /* Commented out until notifications/unread endpoint is implemented
            const response = await fetch('/api/v1/notifications/unread', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.persistentNotifications = data.notifications || [];
                console.log('🔔 Loaded persistent notifications:', this.persistentNotifications.length, 'entries');

                // Process any active instant call notifications
                this.processActiveNotifications();
            }
            */
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
        
        // Don't request notification permission here - not a user-triggered event
        // Permission will be requested when user clicks to enable notifications
        
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
            // Extract volunteer name from callData
            const volunteerName = data.callData?.volunteerName ||
                                  data.volunteer?.name ||
                                  'Volunteer';
            this.showBrowserNotification(
                `Incoming call from ${volunteerName}`,
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

        // Get initials for fallback avatar
        const nameParts = volunteerName.trim().split(/\s+/);
        const initials = nameParts.length >= 2
            ? (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
            : nameParts[0].charAt(0).toUpperCase();

        console.log('👥 Volunteer info extracted:', { volunteerName, volunteerEmail, volunteerPhoto });

        // Remove any existing call UI
        this.hideIncomingCallUI();

        const callUI = document.createElement('div');
        callUI.id = 'enhanced-incoming-call-ui';

        // Clean, professional incoming call UI matching student dashboard style
        callUI.innerHTML = `
            <style>
                #enhanced-incoming-call-ui {
                    position: fixed;
                    inset: 0;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(17, 24, 39, 0.7);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    padding: 16px;
                }

                .call-card {
                    background: white;
                    border-radius: 24px;
                    width: 100%;
                    max-width: 440px;
                    box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.35);
                    overflow: hidden;
                    animation: slideUp 0.3s ease-out;
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .call-header {
                    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                    padding: 24px 20px 20px;
                    text-align: center;
                    border-bottom: 1px solid #e2e8f0;
                }

                .caller-avatar-wrapper {
                    position: relative;
                    width: 88px;
                    height: 88px;
                    margin: 0 auto 16px;
                }

                .pulse-ring {
                    position: absolute;
                    inset: -6px;
                    border-radius: 50%;
                    border: 2px solid #116C00;
                    animation: pulse-ring 1.5s ease-out infinite;
                }

                .pulse-ring-2 {
                    animation-delay: 0.5s;
                }

                @keyframes pulse-ring {
                    0% {
                        transform: scale(0.9);
                        opacity: 0.7;
                    }
                    100% {
                        transform: scale(1.4);
                        opacity: 0;
                    }
                }

                .caller-avatar {
                    width: 88px;
                    height: 88px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
                    object-fit: cover;
                    background: #e5e7eb;
                }

                .caller-initials {
                    width: 88px;
                    height: 88px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
                    background: linear-gradient(135deg, #3867FF, #1d4ed8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 32px;
                    font-weight: 700;
                }

                .call-status {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: #ecfdf5;
                    color: #059669;
                    padding: 5px 12px;
                    border-radius: 16px;
                    font-size: 12px;
                    font-weight: 600;
                    margin-bottom: 10px;
                }

                .call-status-dot {
                    width: 6px;
                    height: 6px;
                    background: #10b981;
                    border-radius: 50%;
                    animation: blink 1s ease-in-out infinite;
                }

                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }

                .caller-name {
                    font-size: 20px;
                    font-weight: 700;
                    color: #111827;
                    margin: 0 0 2px;
                }

                .caller-role {
                    font-size: 13px;
                    color: #6b7280;
                    margin: 0;
                }

                .call-body {
                    padding: 20px;
                }

                .timer-section {
                    text-align: center;
                    margin-bottom: 20px;
                    padding: 12px;
                    background: #fef3c7;
                    border-radius: 12px;
                }

                .timer-label {
                    font-size: 12px;
                    color: #92400e;
                    margin-bottom: 2px;
                    font-weight: 500;
                }

                .timer-value {
                    font-size: 28px;
                    font-weight: 700;
                    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
                    color: #92400e;
                }

                .action-buttons {
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                    margin-bottom: 20px;
                }

                .action-btn {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    background: none;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s;
                    padding: 14px 20px;
                    border-radius: 14px;
                    min-width: 110px;
                }

                .action-btn:active {
                    transform: scale(0.97);
                }

                .action-btn svg {
                    flex-shrink: 0;
                }

                /* Modern rectangular buttons */
                .btn-accept-modern {
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
                    flex: 1;
                    max-width: 140px;
                }

                .btn-accept-modern:hover {
                    background: linear-gradient(135deg, #059669 0%, #047857 100%);
                    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45);
                    transform: translateY(-2px);
                }

                .btn-decline-modern {
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    box-shadow: 0 4px 14px rgba(239, 68, 68, 0.3);
                    flex: 1;
                    max-width: 140px;
                }

                .btn-decline-modern:hover {
                    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
                    box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
                    transform: translateY(-2px);
                }

                .btn-message-modern {
                    background: #f1f5f9;
                    border: 1px solid #e2e8f0;
                    flex: 0;
                    min-width: auto;
                    padding: 14px 16px;
                }

                .btn-message-modern:hover {
                    background: #e2e8f0;
                    border-color: #cbd5e1;
                }

                .btn-message-modern svg {
                    color: #475569;
                }

                .btn-label {
                    font-size: 14px;
                    font-weight: 600;
                    color: white;
                }

                .btn-message-modern .btn-label {
                    color: #475569;
                    display: none;
                }

                .quick-replies {
                    border-top: 1px solid #e5e7eb;
                    padding-top: 16px;
                }

                .quick-replies-title {
                    font-size: 11px;
                    font-weight: 600;
                    color: #9ca3af;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 10px;
                    text-align: center;
                }

                .quick-reply-btn {
                    width: 100%;
                    padding: 10px 14px;
                    margin-bottom: 6px;
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    font-size: 13px;
                    color: #374151;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: left;
                }

                .quick-reply-btn:hover {
                    background: #eff6ff;
                    border-color: #3b82f6;
                    color: #1d4ed8;
                }

                .quick-reply-btn:last-child {
                    margin-bottom: 0;
                }

                /* Mobile optimizations */
                @media (max-width: 480px) {
                    .call-card {
                        max-width: 100%;
                        border-radius: 20px;
                    }
                    .call-header {
                        padding: 20px 16px 16px;
                    }
                    .call-body {
                        padding: 16px;
                    }
                    .action-btn {
                        padding: 12px 16px;
                        min-width: 95px;
                    }
                    .btn-label {
                        font-size: 13px;
                    }
                }
            </style>

            <div class="call-card">
                <!-- Header with caller info -->
                <div class="call-header">
                    <div class="caller-avatar-wrapper">
                        <div class="pulse-ring"></div>
                        <div class="pulse-ring pulse-ring-2"></div>
                        <img src="${volunteerPhoto}"
                             alt="${volunteerName}"
                             class="caller-avatar"
                             id="caller-avatar-img"
                             onerror="this.style.display='none'; document.getElementById('caller-initials').style.display='flex';">
                        <div class="caller-initials" id="caller-initials" style="display: none;">${initials}</div>
                    </div>

                    <div class="call-status">
                        <span class="call-status-dot"></span>
                        Incoming Call
                    </div>

                    <h2 class="caller-name">${volunteerName}</h2>
                    <p class="caller-role">TalkTime Volunteer</p>
                </div>

                <!-- Body with timer and actions -->
                <div class="call-body">
                    <div class="timer-section">
                        <div class="timer-label">Call expires in</div>
                        <div class="timer-value" id="call-timer">01:00</div>
                    </div>

                    <!-- Action Buttons - Modern Design -->
                    <div class="action-buttons">
                        <button class="action-btn btn-decline-modern" id="reject-call-btn">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                            <span class="btn-label">Decline</span>
                        </button>

                        <button class="action-btn btn-accept-modern" id="accept-call-btn">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                            <span class="btn-label">Accept</span>
                        </button>

                        <button class="action-btn btn-message-modern" id="message-call-btn">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <span class="btn-label">Message</span>
                        </button>
                    </div>

                    <!-- Quick Replies -->
                    <div class="quick-replies">
                        <div class="quick-replies-title">Quick Reply</div>
                        <button class="quick-reply-btn" data-message="I'm busy right now, can we talk later?">
                            I'm busy right now, can we talk later?
                        </button>
                        <button class="quick-reply-btn" data-message="Give me 5 minutes please">
                            Give me 5 minutes please
                        </button>
                        <button class="quick-reply-btn" data-message="Let's schedule for later today">
                            Let's schedule for later today
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(callUI);

        // Set up event listeners
        this.setupCallUIEventListeners(callData, notificationId);

        // Start countdown timer
        // Use 60 seconds minimum for student to respond to instant calls
        const timeoutSeconds = callData.callData?.timeoutSeconds || 60;
        this.startCallTimer(Math.max(timeoutSeconds, 60));
    }
    
    setupCallUIEventListeners(callData, notificationId) {
        const acceptBtn = document.getElementById('accept-call-btn');
        const rejectBtn = document.getElementById('reject-call-btn');
        const messageBtn = document.getElementById('message-call-btn');
        const quickReplyBtns = document.querySelectorAll('.quick-reply-btn');

        acceptBtn?.addEventListener('click', () => {
            this.acceptCall(callData.meetingId);
        });

        rejectBtn?.addEventListener('click', () => {
            this.rejectCall(callData.meetingId);
        });

        messageBtn?.addEventListener('click', () => {
            this.showMessageInput(callData.meetingId);
        });

        quickReplyBtns.forEach(btn => {
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
        // The incoming.mp3 is set to loop, so just play it
        this.playCallSound();
    }

    stopCallSoundLoop() {
        // Stop the looping audio
        this.stopCallSound();
    }
    
    showBrowserNotification(title, body, clickHandler) {
        if (this.notificationPermission === 'granted') {
            try {
                // Note: 'actions' are only supported for ServiceWorker notifications
                // For regular Notification API, we can only use basic options
                const notification = new Notification(title, {
                    body: body,
                    icon: '/images/talktime-icon.png',
                    tag: 'instant-call',
                    requireInteraction: true
                });

                notification.onclick = clickHandler;

                // Auto-close after 30 seconds
                setTimeout(() => {
                    notification.close();
                }, 30000);
            } catch (error) {
                console.error('Error showing browser notification:', error);
            }
        }
    }
    
    async acceptCall(meetingId) {
        try {
            console.log('✅ Accepting call:', meetingId);

            // For instant calls, we have the call URL in currentCall
            if (this.currentCall && this.currentCall.actions && this.currentCall.actions.accept) {
                console.log('🔗 Redirecting to call URL:', this.currentCall.actions.accept);

                // SECURITY FIX: Store volunteer data in sessionStorage instead of URL
                // This prevents volunteer credentials from leaking in URL
                const callData = this.currentCall.callData || {};
                const volunteer = this.currentCall.volunteer || {};

                const volunteerInfo = {
                    name: callData.volunteerName || volunteer.name || 'Volunteer',
                    image: callData.volunteerImage || volunteer.photo || volunteer.profile_image || '',
                    id: callData.volunteerId || volunteer.id
                };
                sessionStorage.setItem('instantCallVolunteerInfo', JSON.stringify(volunteerInfo));
                console.log('📦 Stored volunteer info in sessionStorage:', volunteerInfo);

                // Hide call UI
                this.hideIncomingCallUI();

                // Stop call sound
                this.stopCallSound();

                // Redirect to the call URL
                window.location.href = this.currentCall.actions.accept;
                return;
            }

            // Legacy code for future use with scheduled meetings
            const token = window.TalkTimeAuth ? window.TalkTimeAuth.getToken() : null;
            if (!token) {
                console.log('⚠️ User not authenticated, cannot accept call');
                return;
            }

            // For now, just log that we don't have a call URL
            console.error('❌ No call URL available for meeting:', meetingId);
            this.showErrorMessage('Unable to join call - no URL provided');
        } catch (error) {
            console.error('❌ Error accepting call:', error);
            this.showErrorMessage('Failed to accept call');
        }
    }
    
    async rejectCall(meetingId, message = null) {
        try {
            console.log('❌ Rejecting call:', meetingId);

            // IMPORTANT: Send Socket.IO notification BEFORE clearing currentCall
            // Notify the volunteer that the call was declined
            if (this.socket && this.currentCall) {
                const callData = this.currentCall.callData || {};
                const volunteer = this.currentCall.volunteer || {};

                // Extract volunteerId from multiple possible locations
                const volunteerId = callData.volunteerId ||
                                    callData.volunteer?.id ||
                                    volunteer.id ||
                                    this.currentCall.volunteerId;

                // Extract studentId similarly
                const studentId = callData.studentId ||
                                  this.currentCall.studentId;

                console.log('📤 Sending instant-call-response (rejected) to volunteer:', volunteerId);
                console.log('   Full callData:', callData);
                console.log('   Volunteer object:', volunteer);

                if (volunteerId) {
                    this.socket.emit('instant-call-response', {
                        volunteerId: volunteerId,
                        studentId: studentId,
                        meetingId: meetingId,
                        response: 'rejected',
                        message: message || 'Student declined the call',
                        timestamp: new Date().toISOString()
                    });

                    console.log('✅ Call rejection notification sent to volunteer:', volunteerId);
                } else {
                    console.error('❌ Could not send rejection - no volunteerId found in callData');
                }
            } else {
                console.warn('⚠️ Could not send rejection notification - missing socket or call data');
                console.log('   Socket:', !!this.socket);
                console.log('   CurrentCall:', this.currentCall);
            }

            // Stop the call sound
            this.stopCallSound();
            this.stopCallSoundLoop();

            // Hide the incoming call UI
            this.hideIncomingCallUI();

            // Clear the current call AFTER sending notification
            this.currentCall = null;

            console.log('✅ Call rejected successfully');

            // Redirect to dashboard - no alerts
            window.location.href = '/student/dashboard.html';
        } catch (error) {
            console.error('❌ Error rejecting call:', error);
            // Still redirect on error
            window.location.href = '/student/dashboard.html';
        }
    }
    
    async sendQuickMessage(meetingId, message) {
        try {
            console.log('💬 Sending quick message:', message);

            // For instant calls, send message via Socket.IO
            if (this.socket && this.currentCall) {
                const callData = this.currentCall.callData || {};
                const volunteer = this.currentCall.volunteer || {};

                // Extract volunteerId from multiple possible locations
                const volunteerId = callData.volunteerId ||
                                    callData.volunteer?.id ||
                                    volunteer.id ||
                                    this.currentCall.volunteerId;

                // Get studentId from callData - this is the students.id sent by backend
                // The backend sends studentId from the students table consistently
                const studentId = callData.studentId || this.currentCall.studentId;
                console.log('📋 Got studentId from callData (students table):', studentId);

                console.log('📤 Sending instant-message to volunteer:', volunteerId);
                console.log('   From student:', studentId);
                console.log('   Message:', message);

                if (volunteerId && studentId) {
                    // Set up listener for confirmation BEFORE sending
                    const confirmationTimeout = setTimeout(() => {
                        console.log('⏱️ Message confirmation timeout - redirecting anyway');
                        this.hideIncomingCallUI();
                        this.currentCall = null;
                        window.location.href = '/student/dashboard.html';
                    }, 5000); // 5 second timeout

                    this.socket.once('message-sent-confirmation', (data) => {
                        clearTimeout(confirmationTimeout);
                        console.log('✅ Message confirmed by server:', data);

                        // Hide call UI and redirect to dashboard
                        this.hideIncomingCallUI();
                        this.currentCall = null;
                        window.location.href = '/student/dashboard.html';
                    });

                    this.socket.once('message-error', (error) => {
                        clearTimeout(confirmationTimeout);
                        console.error('❌ Message error from server:', error);

                        // Still redirect on error
                        this.hideIncomingCallUI();
                        this.currentCall = null;
                        window.location.href = '/student/dashboard.html';
                    });

                    // Now send the message
                    this.socket.emit('instant-message', {
                        volunteerId: volunteerId,
                        studentId: studentId,
                        meetingId: meetingId,
                        message: message,
                        senderRole: 'student',
                        timestamp: new Date().toISOString()
                    });

                    console.log('✅ Message sent via Socket.IO, waiting for confirmation...');
                } else {
                    console.error('❌ Unable to send message - missing IDs');
                    this.hideIncomingCallUI();
                    this.currentCall = null;
                    window.location.href = '/student/dashboard.html';
                }
            } else {
                console.error('❌ Unable to send message - no active call');
                window.location.href = '/student/dashboard.html';
            }
        } catch (error) {
            console.error('❌ Error sending message:', error);
            window.location.href = '/student/dashboard.html';
        }
    }
    
    async showMessageInput(meetingId) {
        // Create professional modal for message input
        this.showMessageModal(meetingId);
    }

    showMessageModal(meetingId) {
        // Remove existing modal if present
        const existingModal = document.getElementById('message-modal-overlay');
        if (existingModal) existingModal.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'message-modal-overlay';
        modalOverlay.innerHTML = `
            <style>
                #message-modal-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                    padding: 16px;
                    animation: fadeIn 0.2s ease-out;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .message-modal {
                    background: white;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 400px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
                    overflow: hidden;
                    animation: slideUp 0.3s ease-out;
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px 20px;
                    border-bottom: 1px solid #e5e7eb;
                }

                .modal-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #111827;
                    margin: 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .modal-title svg {
                    color: #3867FF;
                }

                .modal-close-btn {
                    background: none;
                    border: none;
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: #6b7280;
                    transition: all 0.2s;
                }

                .modal-close-btn:hover {
                    background: #f3f4f6;
                    color: #111827;
                }

                .modal-body {
                    padding: 20px;
                }

                .message-textarea {
                    width: 100%;
                    min-height: 120px;
                    padding: 14px;
                    border: 2px solid #e5e7eb;
                    border-radius: 12px;
                    font-size: 15px;
                    font-family: inherit;
                    resize: vertical;
                    transition: border-color 0.2s;
                    box-sizing: border-box;
                }

                .message-textarea:focus {
                    outline: none;
                    border-color: #3867FF;
                }

                .message-textarea::placeholder {
                    color: #9ca3af;
                }

                .char-counter {
                    text-align: right;
                    font-size: 12px;
                    color: #9ca3af;
                    margin-top: 8px;
                }

                .char-counter.warning {
                    color: #f59e0b;
                }

                .char-counter.error {
                    color: #7d0000;
                }

                .modal-footer {
                    display: flex;
                    gap: 12px;
                    padding: 16px 20px;
                    border-top: 1px solid #e5e7eb;
                    background: #f9fafb;
                }

                .modal-btn {
                    flex: 1;
                    padding: 12px 20px;
                    border-radius: 10px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }

                .modal-btn-cancel {
                    background: white;
                    border: 1px solid #e5e7eb;
                    color: #374151;
                }

                .modal-btn-cancel:hover {
                    background: #f3f4f6;
                }

                .modal-btn-send {
                    background: #3867FF;
                    color: white;
                }

                .modal-btn-send:hover {
                    background: #2855e0;
                }

                .modal-btn-send:disabled {
                    background: #9ca3af;
                    cursor: not-allowed;
                }
            </style>

            <div class="message-modal">
                <div class="modal-header">
                    <h3 class="modal-title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        Send Message
                    </h3>
                    <button class="modal-close-btn" id="modal-close-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <textarea
                        class="message-textarea"
                        id="message-textarea"
                        placeholder="Type your message to the volunteer..."
                        maxlength="500"
                        autofocus
                    ></textarea>
                    <div class="char-counter" id="char-counter">0 / 500</div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn modal-btn-cancel" id="modal-cancel-btn">Cancel</button>
                    <button class="modal-btn modal-btn-send" id="modal-send-btn" disabled>Send Message</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        // Get elements
        const textarea = document.getElementById('message-textarea');
        const charCounter = document.getElementById('char-counter');
        const sendBtn = document.getElementById('modal-send-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        const closeBtn = document.getElementById('modal-close-btn');

        // Focus textarea
        setTimeout(() => textarea.focus(), 100);

        // Update character counter
        textarea.addEventListener('input', () => {
            const length = textarea.value.length;
            charCounter.textContent = `${length} / 500`;

            charCounter.classList.remove('warning', 'error');
            if (length >= 450) {
                charCounter.classList.add('error');
            } else if (length >= 400) {
                charCounter.classList.add('warning');
            }

            sendBtn.disabled = length === 0;
        });

        // Handle send
        const sendMessage = () => {
            const message = textarea.value.trim();
            if (message) {
                this.sendQuickMessage(meetingId, message);
                modalOverlay.remove();
            }
        };

        sendBtn.addEventListener('click', sendMessage);

        // Handle cancel/close
        const closeModal = () => modalOverlay.remove();
        cancelBtn.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);

        // Close on overlay click
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });

        // Handle Enter key (Ctrl+Enter or Cmd+Enter to send)
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                sendMessage();
            }
            if (e.key === 'Escape') {
                closeModal();
            }
        });
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

        // CRITICAL: Notify the volunteer that student didn't respond
        if (this.currentCall && this.socket) {
            const roomId = this.currentCall.callData?.roomId || this.currentCall.callData?.callData?.roomId;
            const volunteerId = this.currentCall.volunteer?.id || this.currentCall.callData?.volunteerId;

            console.log('📤 Notifying volunteer of call timeout:', { roomId, volunteerId });

            // Emit to the call room so volunteer knows
            this.socket.emit('instant-call-no-response', {
                roomId: roomId,
                volunteerId: volunteerId,
                studentId: this.currentCall.callData?.studentUserId,
                reason: 'timeout',
                message: 'Student did not respond to the call'
            });
        }

        this.hideIncomingCallUI();
        this.currentCall = null;

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
            retryNotification.className = 'fixed bottom-4 right-4 z-50 bg-amber-100 border border-amber-400 text-gray-900 p-4 rounded-lg shadow-lg';
            retryNotification.innerHTML = `
                <div class="flex items-center">
                    <div class="mr-3">
                        <div class="font-semibold">Retry Call?</div>
                        <div class="text-sm text-gray-700">You can try calling again</div>
                    </div>
                    <button id="retry-call-btn" class="bg-amber-500 text-white px-3 py-1 rounded font-semibold hover:bg-amber-600">
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

// Make class available globally for browser use
window.EnhancedInstantCallUI = EnhancedInstantCallUI;

// Initialize enhanced instant call UI
// Check if DOM is already loaded (for dynamically loaded scripts)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🚀 Initializing Enhanced Instant Call UI on DOMContentLoaded');
        window.enhancedInstantCallUI = new EnhancedInstantCallUI();
    });
} else {
    // DOM is already loaded, initialize immediately
    console.log('🚀 Initializing Enhanced Instant Call UI immediately (DOM already loaded)');
    window.enhancedInstantCallUI = new EnhancedInstantCallUI();
}
