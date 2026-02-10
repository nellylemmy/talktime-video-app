/**
 * Real-time Notifications Client
 * Handles Socket.IO connections for live notification updates
 */

class RealtimeNotifications {
    constructor(userRole) {
        this.userRole = userRole;
        this.socket = null;
        this.isInitialized = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 1000;
        this.callbacks = {
            newNotification: [],
            notificationRead: [],
            allNotificationsRead: [],
            connectionStatus: [],
            'new-chat-message': []
        };
    }

    /**
     * Initialize Socket.IO connection
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Check if user is authenticated
            if (!window.TalkTimeAuth || !await window.TalkTimeAuth.verifyToken()) {
                console.log('User not authenticated, skipping real-time notifications');
                return;
            }

            const userData = window.TalkTimeAuth.getUser();
            if (!userData || !userData.id) {
                console.log('No user data available, skipping real-time notifications');
                return;
            }

            // Load Socket.IO library if not already loaded
            if (typeof io === 'undefined') {
                await this.loadSocketIO();
            }

            // Initialize Socket.IO connection
            this.socket = io({
                transports: ['websocket', 'polling'],
                upgrade: true,
                rememberUpgrade: true
            });

            this.setupEventListeners(userData);
            this.isInitialized = true;

            console.log('Real-time notifications initialized for user:', userData.id);

            // Fetch initial badge counts
            this.updateNotificationBadge();
            this.updateMessageBadge();

        } catch (error) {
            console.error('Error initializing real-time notifications:', error);
        }
    }

    /**
     * Load Socket.IO library dynamically
     */
    loadSocketIO() {
        return new Promise((resolve, reject) => {
            if (typeof io !== 'undefined') {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = '/socket.io/socket.io.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Setup Socket.IO event listeners
     */
    setupEventListeners(userData) {
        if (!this.socket) return;

        // Connection events
        this.socket.on('connect', () => {
            console.log('Real-time notifications connected');
            this.reconnectAttempts = 0;
            
            // Join notification room
            this.socket.emit('join-notification-room', {
                userId: userData.id,
                role: this.userRole
            });

            // Also join user-level room so chat messages arrive in real-time
            // Use join-room (not join-user-room) to avoid joining ${role}_${userId}
            // which would cause double-fire with page-specific socket handlers
            this.socket.emit('join-room', `user_${userData.id}`);

            this.triggerCallback('connectionStatus', { connected: true });
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Real-time notifications disconnected:', reason);
            this.triggerCallback('connectionStatus', { connected: false, reason });
            
            // Auto-reconnect for certain disconnect reasons
            if (reason === 'io server disconnect') {
                this.reconnect();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Real-time notifications connection error:', error);
            this.triggerCallback('connectionStatus', { connected: false, error });
            this.reconnect();
        });

        // Notification events
        this.socket.on('new-notification', (data) => {
            console.log('New notification received:', data);
            this.triggerCallback('newNotification', data);
            
            // Trigger sound notification
            this.playNotificationSound(data);
            
            this.showNotificationToast(data.notification);
            this.updateNotificationBadge();
        });

        this.socket.on('notification-marked-read', (data) => {
            console.log('Notification marked as read:', data);
            this.triggerCallback('notificationRead', data);
            this.updateNotificationBadge();
        });

        this.socket.on('notifications-marked-all-read', (data) => {
            console.log('All notifications marked as read:', data);
            this.triggerCallback('allNotificationsRead', data);
            this.updateNotificationBadge();
        });

        // Handle meeting schedule/reschedule/cancel events for real-time UI updates
        this.socket.on('meeting-scheduled', (data) => {
            console.log('📅 Meeting scheduled notification received:', data);
            this.playNotificationSound({
                sound_type: 'meeting_scheduled',
                priority: 'high',
                notification: { type: 'meeting_scheduled' }
            });
            this.showMeetingToast('Meeting Scheduled', data.message || 'A new meeting has been scheduled!', 'success');
            this.updateNotificationBadge();
            this.triggerCallback('meeting-scheduled', data);
        });

        this.socket.on('meeting-rescheduled', (data) => {
            console.log('📅 Meeting rescheduled notification received:', data);
            this.playNotificationSound({
                sound_type: 'meeting_rescheduled',
                priority: 'normal',
                notification: { type: 'meeting_rescheduled' }
            });
            this.showRescheduleNotification(data);
            this.updateNotificationBadge();
            this.triggerCallback('meeting-rescheduled', data);
        });

        this.socket.on('meeting-canceled', (data) => {
            console.log('❌ Meeting canceled notification received:', data);
            this.playNotificationSound({
                sound_type: 'system_notification',
                priority: 'high',
                notification: { type: 'meeting_canceled' }
            });
            this.showMeetingToast('Meeting Canceled', data.message || 'A meeting has been canceled', 'error');
            this.updateNotificationBadge();
            this.triggerCallback('meeting-canceled', data);
        });

        this.socket.on('meeting-missed', (data) => {
            console.log('⏰ Meeting missed notification received:', data);
            this.playNotificationSound({
                sound_type: 'system_notification',
                priority: 'high',
                notification: { type: 'meeting_missed' }
            });
            this.showMeetingToast('Meeting Missed', data.message || 'A meeting was missed', 'warning');
            this.updateNotificationBadge();
            this.triggerCallback('meeting-missed', data);
        });

        this.socket.on('meeting-completed', (data) => {
            console.log('✅ Meeting completed notification received:', data);
            this.showMeetingToast('Meeting Completed', data.message || 'Meeting completed successfully!', 'success');
            this.updateNotificationBadge();
            this.triggerCallback('meeting-completed', data);
        });

        // Handle new chat messages
        this.socket.on('new-chat-message', (data) => {
            console.log('💬 New chat message received:', data);

            // Play message notification sound
            this.playNotificationSound({
                sound_type: 'new_message',
                priority: 'medium',
                notification: { type: 'new_message' }
            });

            // Show toast notification
            const senderName = data.senderName || 'Someone';
            const contentPreview = data.content?.length > 50
                ? data.content.substring(0, 50) + '...'
                : data.content;
            this.showMeetingToast('New Message', `${senderName}: ${contentPreview}`, 'info');

            // Update badge
            this.updateNotificationBadge();
            this.updateMessageBadge();

            // Trigger callback for custom handlers
            this.triggerCallback('new-chat-message', data);
        });

        this.socket.on('meeting-reminder', (data) => {
            console.log('⏰ Meeting reminder notification received:', data);
            this.playNotificationSound({
                sound_type: 'meeting_reminder',
                priority: 'high',
                notification: { type: 'meeting_reminder' }
            });
            this.showMeetingToast('Meeting Reminder', data.message || `Meeting in ${data.minutesBefore} minutes!`, 'warning');
            this.updateNotificationBadge();
            this.triggerCallback('meeting-reminder', data);
        });

        // Handle notification sound triggers from backend
        this.socket.on('notification-sound-trigger', (data) => {
            console.log('🔊 Sound trigger received:', data);
            this.playNotificationSound(data);
        });

        // Handle direct badge count updates
        this.socket.on('notification-badge-update', (data) => {
            console.log('🔔 Badge update received:', data);
            if (data.increment) {
                this.incrementBadgeCount(data.increment);
            } else {
                this.updateNotificationBadge();
            }
        });

        // Handle push notification requests from server
        this.socket.on('push-notification-request', async (data) => {
            console.log('🔔 Received push notification request:', data);
            
            // Trigger sound for push notifications
            this.playNotificationSound({
                sound_type: data.notificationData.data?.sound_type || data.metadata?.type || 'default',
                priority: data.notificationData.data?.priority || data.priority || 'normal',
                notification: { type: data.metadata?.type || 'default' },
                source: 'push'
            });
            
            // Request permission if needed
            if (Notification.permission === 'default') {
                await Notification.requestPermission();
            }
            
            if (Notification.permission === 'granted') {
                try {
                    // Create browser notification
                    const notification = new Notification(data.notificationData.title, {
                        body: data.notificationData.body,
                        icon: data.notificationData.icon || '/favicon.ico',
                        badge: data.notificationData.badge || '/favicon.ico',
                        tag: data.notificationData.tag || 'talktime-notification',
                        requireInteraction: data.notificationData.requireInteraction || false,
                        data: data.notificationData.data,
                        actions: data.notificationData.actions || [],
                        vibrate: data.notificationData.vibrate || [200, 100, 200]
                    });
                    
                    // Handle notification click
                    notification.onclick = function(event) {
                        event.preventDefault();
                        window.focus();
                        
                        // Navigate to URL if provided
                        if (data.notificationData.data && data.notificationData.data.url) {
                            window.location.href = data.notificationData.data.url;
                        } else if (data.metadata && data.metadata.action_url) {
                            window.location.href = data.metadata.action_url;
                        } else {
                            // Default navigation based on notification type
                            const userRole = data.notificationData.data.user_role || 'volunteer';
                            if (data.metadata.type === 'meeting_rescheduled' || data.metadata.type === 'meeting_scheduled') {
                                window.location.href = `/${userRole}/meetings.html`;
                            } else {
                                window.location.href = `/${userRole}/notifications.html`;
                            }
                        }
                        
                        notification.close();
                    };
                    
                    // Auto-close after delay unless requires interaction
                    if (!data.notificationData.requireInteraction) {
                        setTimeout(() => {
                            notification.close();
                        }, 8000);
                    }
                    
                    console.log('✅ Browser notification displayed successfully');
                } catch (error) {
                    console.error('❌ Error showing browser notification:', error);
                }
            }
            
            // Always increment badge count regardless of notification permission
            this.incrementBadgeCount();
            
            // Show in-app toast based on notification type
            if (data.metadata.type === 'meeting_rescheduled') {
                this.showRescheduleToast(data.notificationData.title, data.notificationData.body, data.metadata);
            } else {
                this.showInAppToast(data.notificationData.title, data.notificationData.body, data.metadata);
            }
        });
    }

    /**
     * Reconnect to Socket.IO server
     */
    async reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        setTimeout(() => {
            if (this.socket) {
                this.socket.connect();
            }
        }, this.reconnectInterval * this.reconnectAttempts);
    }

    /**
     * Emit notification read event
     */
    markNotificationAsRead(notificationId) {
        if (this.socket && this.socket.connected) {
            const userData = window.TalkTimeAuth.getUser();
            this.socket.emit('notification-read', {
                notificationId,
                userId: userData.id,
                role: this.userRole
            });
        }
    }

    /**
     * Emit all notifications read event
     */
    markAllNotificationsAsRead() {
        if (this.socket && this.socket.connected) {
            const userData = window.TalkTimeAuth.getUser();
            this.socket.emit('notifications-read-all', {
                userId: userData.id,
                role: this.userRole
            });
        }
    }

    /**
     * Play notification sound based on notification data
     */
    playNotificationSound(data) {
        try {
            // Determine sound type from notification data
            let soundType = 'default';
            const notificationType = data.sound_type || data.notification?.type || data.type;
            const priority = data.priority || data.priority_level || 'normal';
            
            // Map notification types to sound types
            switch (notificationType) {
                case 'new_message':
                    soundType = 'new_message';
                    break;
                case 'meeting_reminder':
                case 'meeting_reminder_5min':
                case 'meeting_reminder_10min':
                case 'meeting_reminder_30min':
                    soundType = 'meeting_reminder';
                    break;
                case 'instant_call':
                    soundType = 'instant_call';
                    break;
                case 'meeting_scheduled':
                    soundType = 'meeting_scheduled';
                    break;
                case 'meeting_rescheduled':
                    soundType = 'meeting_rescheduled';
                    break;
                case 'meeting_cancelled':
                    soundType = 'system_notification';
                    break;
                case 'system':
                    soundType = 'system_notification';
                    break;
                default:
                    if (priority === 'urgent' || priority === 'high') {
                        soundType = priority === 'urgent' ? 'urgent' : 'meeting_reminder';
                    } else {
                        soundType = 'default';
                    }
                    break;
            }

            // Emit sound event for the sound manager
            document.dispatchEvent(new CustomEvent('talktimeNotificationSent', {
                detail: {
                    type: soundType,
                    priority: priority,
                    metadata: data.metadata || {},
                    notification_id: data.notification_id,
                    channels: data.channels_used || ['in-app'],
                    source: data.source || 'realtime'
                }
            }));

            console.log(`🔊 Triggered ${soundType} sound for notification type: ${notificationType}`);

        } catch (error) {
            console.error('❌ Error playing notification sound:', error);
        }
    }

    /**
     * Show toast notification for new notifications
     */
    showNotificationToast(notification) {
        if (!notification) return;
        // Dedup: skip if same notification shown recently (shared with page-level toasts)
        const key = `${notification.title}:${notification.message}`;
        const now = Date.now();
        if (!window._recentToasts) window._recentToasts = {};
        if (window._recentToasts[key] && now - window._recentToasts[key] < 3000) return;
        window._recentToasts[key] = now;

        // Trigger sound for this notification
        this.playNotificationSound({
            notification: notification,
            sound_type: notification.type,
            priority: notification.priority,
            source: 'toast'
        });

        // Check if user has granted notification permission
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(notification.title, {
                body: notification.message,
                icon: '/images/logo-icon.png',
                badge: '/images/logo-icon.png',
                tag: `notification-${notification.id}`,
                requireInteraction: notification.priority === 'high'
            });
        }

        // Show in-page toast as fallback
        this.showInPageToast(notification);
    }

    /**
     * Show in-page toast notification
     */
    showInPageToast(notification) {
        const container = document.getElementById('toast-container') || this.createToastContainer();

        const toast = document.createElement('div');
        const priorityColor = this.getPriorityColor(notification.priority);
        const priorityTextColor = this.getPriorityTextColor(notification.priority);

        toast.className = `${priorityColor} ${priorityTextColor} px-6 py-4 rounded-lg shadow-lg mb-2 transform translate-x-full transition-transform duration-300 cursor-pointer`;
        toast.innerHTML = `
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <h4 class="font-semibold text-sm">${notification.title}</h4>
                    <p class="text-sm opacity-90 mt-1">${notification.message}</p>
                </div>
                <button class="ml-3 opacity-70 hover:opacity-100">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
        
        container.appendChild(toast);
        
        // Show toast
        setTimeout(() => toast.classList.remove('translate-x-full'), 100);
        
        // Auto-hide after 5 seconds for low priority, 8 seconds for high priority
        const hideDelay = notification.priority === 'high' ? 8000 : 5000;
        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => {
                if (container.contains(toast)) {
                    container.removeChild(toast);
                }
            }, 300);
        }, hideDelay);
        
        // Hide on click
        const closeBtn = toast.querySelector('button');
        closeBtn.addEventListener('click', () => {
            toast.classList.add('translate-x-full');
            setTimeout(() => {
                if (container.contains(toast)) {
                    container.removeChild(toast);
                }
            }, 300);
        });
    }

    /**
     * Create toast container if it doesn't exist
     */
    createToastContainer() {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'fixed top-4 right-4 z-50 max-w-sm';
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * Get priority color class
     */
    getPriorityColor(priority) {
        switch (priority) {
            case 'high': return 'bg-red-500';
            case 'medium': return 'bg-amber-500';
            case 'low': return 'bg-green-500';
            default: return 'bg-blue-500';
        }
    }

    // Returns text color class based on background for proper contrast
    getPriorityTextColor(priority) {
        switch (priority) {
            case 'medium': return 'text-gray-900'; // Dark text on amber/yellow
            default: return 'text-white'; // White text on red, green, blue
        }
    }

    /**
     * Update notification badge count
     */
    async updateNotificationBadge() {
        try {
            const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/notifications/unread-count');
            if (response.ok) {
                const data = await response.json();
                const badge = document.getElementById('notification-badge');
                if (badge) {
                    if (data.unread_count > 0) {
                        badge.textContent = data.unread_count > 99 ? '99+' : data.unread_count.toString();
                        badge.classList.remove('hidden');
                    } else {
                        badge.classList.add('hidden');
                    }
                }
            }
        } catch (error) {
            console.error('Error updating notification badge:', error);
        }
    }

    /**
     * Update message badge count
     */
    async updateMessageBadge() {
        try {
            // Determine the correct endpoint based on user role
            const endpoint = this.userRole === 'student'
                ? '/api/v1/students/me/messages/unread-count'
                : '/api/v1/volunteers/me/messages/unread-count';

            const response = await window.TalkTimeAuth.authenticatedRequest(endpoint);
            if (response.ok) {
                const data = await response.json();
                const count = data.unreadCount || 0;

                // Update all message badge elements
                const messageBadges = document.querySelectorAll('#message-badge, .message-badge, #message-unread-count, #messages-tab-badge, #messages-tab-badge-mobile');
                messageBadges.forEach(badge => {
                    if (count > 0) {
                        badge.textContent = count > 99 ? '99+' : count.toString();
                        badge.classList.remove('hidden');
                    } else {
                        badge.classList.add('hidden');
                    }
                });

                // Also update messages tab badge if exists
                const tabBadge = document.querySelector('[data-tab="messages"] .unread-badge');
                if (tabBadge) {
                    if (count > 0) {
                        tabBadge.textContent = count > 99 ? '99+' : count.toString();
                        tabBadge.classList.remove('hidden');
                    } else {
                        tabBadge.classList.add('hidden');
                    }
                }
            }
        } catch (error) {
            console.error('Error updating message badge:', error);
        }
    }

    /**
     * Increment badge count immediately for real-time feedback
     */
    incrementBadgeCount(increment = 1) {
        const badge = document.getElementById('notification-badge');
        if (badge) {
            const currentCount = badge.classList.contains('hidden') ? 0 : parseInt(badge.textContent) || 0;
            const newCount = currentCount + increment;
            
            if (newCount > 0) {
                badge.textContent = newCount > 99 ? '99+' : newCount.toString();
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    /**
     * Show meeting-related toast notification
     */
    showMeetingToast(title, message, type = 'info') {
        // Dedup: skip if same toast shown in last 3 seconds (shared with page-level toasts)
        const key = `${title}:${message}`;
        const now = Date.now();
        if (!window._recentToasts) window._recentToasts = {};
        if (window._recentToasts[key] && now - window._recentToasts[key] < 3000) return;
        window._recentToasts[key] = now;

        const container = document.getElementById('toast-container') || this.createToastContainer();

        // Determine colors based on type
        let toastClass = 'bg-blue-500 border-blue-700';
        let icon = '📅';

        switch (type) {
            case 'success':
                toastClass = 'bg-green-500 border-green-700';
                icon = '✅';
                break;
            case 'warning':
                toastClass = 'bg-orange-500 border-orange-700';
                icon = '⏰';
                break;
            case 'error':
                toastClass = 'bg-red-500 border-red-700';
                icon = '❌';
                break;
        }

        const toast = document.createElement('div');
        toast.className = `${toastClass} text-white px-6 py-4 rounded-lg shadow-lg mb-2 transform translate-x-full transition-transform duration-300 cursor-pointer border-l-4`;
        toast.innerHTML = `
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center">
                        <span class="text-2xl mr-2">${icon}</span>
                        <h4 class="font-semibold text-sm">${title}</h4>
                    </div>
                    <p class="text-sm opacity-90 mt-1">${message}</p>
                </div>
                <button class="ml-2 text-white hover:text-gray-200" onclick="this.parentElement.parentElement.remove()">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;

        container.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.remove('translate-x-full'), 100);

        // Auto remove after 6 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('translate-x-full');
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.remove();
                    }
                }, 300);
            }
        }, 6000);
    }

    /**
     * Show specific notification for meeting reschedule
     */
    showRescheduleNotification(data) {
        // Trigger reschedule sound
        this.playNotificationSound({
            notification: { type: 'meeting_rescheduled' },
            sound_type: 'meeting_rescheduled',
            priority: 'normal',
            source: 'reschedule'
        });

        // Show browser notification if permission granted
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification('📅 Meeting Rescheduled', {
                body: data.message,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: `meeting-reschedule-${data.meeting_id}`,
                requireInteraction: true,
                actions: [
                    {
                        action: 'view',
                        title: '👀 View Details'
                    },
                    {
                        action: 'dismiss',
                        title: '✕ Dismiss'
                    }
                ]
            });

            notification.onclick = () => {
                window.focus();
                window.location.href = this.userRole === 'volunteer' 
                    ? '/volunteer/dashboard/upcoming.html' 
                    : '/student/dashboard';
                notification.close();
            };
        }

        // Show in-page toast with reschedule styling
        this.showRescheduleToast(data);
    }

    /**
     * Show in-page toast for meeting reschedule
     */
    showRescheduleToast(data) {
        const container = document.getElementById('toast-container') || this.createToastContainer();
        
        const toast = document.createElement('div');
        toast.className = 'bg-orange-500 text-white px-6 py-4 rounded-lg shadow-lg mb-2 transform translate-x-full transition-transform duration-300 cursor-pointer border-l-4 border-orange-700';
        toast.innerHTML = `
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center">
                        <span class="text-2xl mr-2">📅</span>
                        <h4 class="font-semibold text-sm">Meeting Rescheduled</h4>
                    </div>
                    <p class="text-sm opacity-90 mt-1">${data.message}</p>
                    <div class="mt-2 text-xs opacity-75">
                        Click to view your updated schedule
                    </div>
                </div>
                <button class="ml-2 text-white hover:text-gray-200" onclick="this.parentElement.parentElement.remove()">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
        
        // Add click handler to navigate to meetings page
        toast.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SVG' && e.target.tagName !== 'PATH') {
                window.location.href = this.userRole === 'volunteer' 
                    ? '/volunteer/dashboard/upcoming.html' 
                    : '/student/dashboard';
            }
        });
        
        container.appendChild(toast);
        
        // Animate in
        setTimeout(() => toast.classList.remove('translate-x-full'), 100);
        
        // Auto remove after 8 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('translate-x-full');
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.remove();
                    }
                }, 300);
            }
        }, 8000);
    }

    /**
     * Request notification permission
     */
    async requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }
        return Notification.permission === 'granted';
    }

    /**
     * Add event callback
     */
    on(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
    }

    /**
     * Remove event callback
     */
    off(event, callback) {
        if (this.callbacks[event]) {
            const index = this.callbacks[event].indexOf(callback);
            if (index > -1) {
                this.callbacks[event].splice(index, 1);
            }
        }
    }

    /**
     * Trigger event callbacks
     */
    triggerCallback(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} callback:`, error);
                }
            });
        }
    }

    /**
     * Show general in-app toast notification
     */
    showInAppToast(title, message, metadata = {}) {
        // Trigger sound for in-app toast
        this.playNotificationSound({
            notification: { type: metadata.type || 'system' },
            sound_type: metadata.type || 'system_notification',
            priority: metadata.priority || 'normal',
            source: 'in-app-toast'
        });

        const container = document.getElementById('toast-container') || this.createToastContainer();
        
        // Determine toast color based on notification type (includes text color for contrast)
        let toastClass = 'bg-blue-500 border-blue-700 text-white'; // default
        let icon = '🔔'; // default
        
        if (metadata.type === 'meeting_scheduled') {
            toastClass = 'bg-green-500 border-green-700 text-white';
            icon = '📅';
        } else if (metadata.type === 'meeting_reminder') {
            toastClass = 'bg-amber-100 border-amber-400 text-gray-900';
            icon = '⏰';
        } else if (metadata.type === 'instant_call') {
            toastClass = 'bg-red-500 border-red-700 text-white';
            icon = '📞';
        } else if (metadata.type === 'meeting_cancelled') {
            toastClass = 'bg-gray-500 border-gray-700 text-white';
            icon = '❌';
        }
        
        const toast = document.createElement('div');
        // Text color is now included in toastClass for proper contrast
        toast.className = `${toastClass} px-6 py-4 rounded-lg shadow-lg mb-2 transform translate-x-full transition-transform duration-300 cursor-pointer border-l-4`;
        toast.innerHTML = `
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center">
                        <span class="text-2xl mr-2">${icon}</span>
                        <h4 class="font-semibold text-sm">${title}</h4>
                    </div>
                    <p class="text-sm opacity-90 mt-1">${message}</p>
                    <div class="mt-2 text-xs opacity-75">
                        Click to view details
                    </div>
                </div>
                <button class="ml-2 opacity-70 hover:opacity-100" onclick="this.parentElement.parentElement.remove()">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
        
        // Click handler for navigation
        toast.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'svg' && e.target.tagName !== 'path') {
                if (metadata.action_url) {
                    window.location.href = metadata.action_url;
                } else {
                    // Default navigation
                    const userRole = this.getUserRole();
                    if (metadata.type === 'meeting_scheduled' || metadata.type === 'meeting_reminder') {
                        window.location.href = `/${userRole}/meetings.html`;
                    } else {
                        window.location.href = `/${userRole}/notifications.html`;
                    }
                }
                toast.remove();
            }
        };
        
        container.appendChild(toast);
        
        // Trigger slide-in animation
        setTimeout(() => {
            toast.classList.remove('translate-x-full');
        }, 100);
        
        // Auto-remove after delay
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('translate-x-full');
                setTimeout(() => {
                    if (toast.parentElement) {
                        toast.remove();
                    }
                }, 300);
            }
        }, 8000);
    }

    /**
     * Get user role from current URL or stored data
     */
    getUserRole() {
        // Try to get from URL path
        const path = window.location.pathname;
        if (path.includes('/volunteer/')) return 'volunteer';
        if (path.includes('/student/')) return 'student';
        if (path.includes('/admin/')) return 'admin';
        
        // Try to get from TalkTimeAuth if available
        if (typeof TalkTimeAuth !== 'undefined' && TalkTimeAuth.getCurrentUser) {
            const user = TalkTimeAuth.getCurrentUser();
            if (user && user.role) return user.role;
        }
        
        // Default to volunteer
        return 'volunteer';
    }

    /**
     * Disconnect and cleanup
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isInitialized = false;
        this.reconnectAttempts = 0;
    }

    /**
     * Get connection status
     */
    isConnected() {
        return this.socket && this.socket.connected;
    }
}

// Export for use in other modules
window.RealtimeNotifications = RealtimeNotifications;
