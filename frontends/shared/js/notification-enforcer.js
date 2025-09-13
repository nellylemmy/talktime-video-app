/**
 * Universal Notification Permission Enforcer
 * This script ensures ALL users are prompted for notification permission
 * Must be loaded on every page of the TalkTime application
 */

class TalkTimeNotificationEnforcer {
    constructor() {
        // Prevent multiple instances
        if (window.talktimeNotificationEnforcer) {
            console.log('🔄 Using existing NotificationEnforcer instance');
            return window.talktimeNotificationEnforcer;
        }
        
        this.initialized = false;
        this.permissionModal = null;
        this.checkCount = 0;
        this.maxChecks = 3;
        this.loadingModal = false;  // Prevent infinite loading loops
        
        // Store this instance globally
        window.talktimeNotificationEnforcer = this;
        
        this.init();
    }

    init() {
        console.log('🔔 TalkTime Notification Enforcer initializing...');
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.start());
        } else {
            this.start();
        }
    }

    start() {
        // Delay slightly to ensure page is fully loaded
        setTimeout(() => {
            this.checkAndEnforcePermission();
        }, 1000);
    }

    checkAndEnforcePermission() {
        this.checkCount++;
        console.log(`🔔 Permission check ${this.checkCount}/${this.maxChecks}`);

        // Check if notification modal class is available
        if (typeof NotificationPermissionModal === 'undefined') {
            console.log('⏳ Waiting for NotificationPermissionModal to load...');
            
            if (this.checkCount < this.maxChecks) {
                setTimeout(() => this.checkAndEnforcePermission(), 2000);
                return;
            } else {
                console.error('❌ NotificationPermissionModal failed to load');
                if (!this.loadingModal) {
                    this.loadNotificationModalScript();
                }
                return;
            }
        }

        // Check if we need to show the modal
        if (this.shouldShowPermissionModal()) {
            this.showPermissionModal();
        } else {
            console.log('✅ Notification permission already granted or handled');
            this.onPermissionReady();
        }
    }

    shouldShowPermissionModal() {
        // Always show if notifications not supported
        if (!('Notification' in window)) {
            console.log('🚫 Browser does not support notifications');
            return false;
        }

        // Show if permission is default (not granted or denied)
        if (Notification.permission === 'default') {
            console.log('❓ Notification permission is default - showing modal');
            return true;
        }

        // Show if permission was denied but it's mandatory
        if (Notification.permission === 'denied') {
            const dismissedPermanently = localStorage.getItem('talktime_notification_dismissed');
            if (!dismissedPermanently) {
                console.log('❌ Notification permission denied but not permanently dismissed');
                return true;
            }
        }

        return false;
    }

    showPermissionModal() {
        console.log('📱 Showing universal notification permission modal');

        const modal = new NotificationPermissionModal({
            title: '🔔 Enable TalkTime Notifications',
            message: 'TalkTime works best with notifications enabled. Stay connected with instant meeting reminders, call alerts, and important updates that help you never miss a conversation.',
            mandatory: true, // Make it mandatory for better engagement
            allowButtonText: '🎯 Enable Notifications Now',
            onAllow: (permission) => {
                console.log('✅ User granted notification permission:', permission);
                this.onPermissionGranted();
            },
            onDeny: (permission) => {
                console.log('❌ User denied notification permission:', permission);
                this.onPermissionDenied();
            }
        });

        const shown = modal.show();
        if (shown) {
            this.permissionModal = modal;
            
            // Track that we showed the modal
            this.trackEvent('notification_modal_shown', {
                page: window.location.pathname,
                timestamp: new Date().toISOString(),
                user_agent: navigator.userAgent
            });
        }
    }

    onPermissionGranted() {
        console.log('🎉 Notification permission granted - initializing notification features');
        
        // Store permission status
        localStorage.setItem('talktime_notification_status', 'granted');
        localStorage.setItem('talktime_notification_granted_at', new Date().toISOString());
        
        // Initialize notification features
        this.initializeNotificationFeatures();
        
        // Track successful permission
        this.trackEvent('notification_permission_success', {
            page: window.location.pathname,
            timestamp: new Date().toISOString()
        });

        this.onPermissionReady();
    }

    onPermissionDenied() {
        console.log('⚠️ Notification permission denied - limited functionality');
        
        // Store permission status
        localStorage.setItem('talktime_notification_status', 'denied');
        localStorage.setItem('talktime_notification_denied_at', new Date().toISOString());
        
        // Show subtle reminder
        this.showNotificationReminder();
        
        // Track permission denial
        this.trackEvent('notification_permission_denied', {
            page: window.location.pathname,
            timestamp: new Date().toISOString()
        });

        this.onPermissionReady();
    }

    onPermissionReady() {
        console.log('🚀 TalkTime notification system ready');
        
        // Mark as initialized
        this.initialized = true;
        
        // Emit custom event for other scripts
        document.dispatchEvent(new CustomEvent('talktimeNotificationReady', {
            detail: {
                permission: Notification.permission,
                initialized: true,
                timestamp: new Date().toISOString()
            }
        }));

        // Initialize other TalkTime features that depend on notifications
        this.initializeDependentFeatures();
    }

    initializeNotificationFeatures() {
        console.log('⚡ Initializing notification features...');

        // Subscribe to push notifications if available
        this.subscribeToPushNotifications();
        
        // Initialize Socket.IO notification listeners
        this.initializeSocketListeners();
        
        // Initialize service worker for advanced notifications
        this.initializeServiceWorker();
        
        // Show notification settings in UI
        this.showNotificationControls();
    }

    async subscribeToPushNotifications() {
        try {
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                console.log('📡 Registering for push notifications...');
                
                const registration = await navigator.serviceWorker.register('/notification-sw.js');
                console.log('✅ Service Worker registered:', registration);
                
                // Get VAPID key from backend
                const vapidKey = await this.getVapidKey();
                
                // Subscribe to push notifications
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: vapidKey
                });
                
                console.log('✅ Push subscription created:', subscription);
                
                // Send subscription to backend
                await this.sendSubscriptionToBackend(subscription);
                
            } else {
                console.log('⚠️ Push notifications not supported');
            }
        } catch (error) {
            console.error('❌ Error subscribing to push notifications:', error);
        }
    }

    initializeSocketListeners() {
        // Initialize Socket.IO for real-time notifications
        if (typeof io !== 'undefined') {
            console.log('🔌 Initializing Socket.IO notification listeners');
            
            const socket = io();
            
            socket.on('new-notification', (data) => {
                this.handleRealtimeNotification(data);
            });
            
            socket.on('notification-update', (data) => {
                this.handleNotificationUpdate(data);
            });

            socket.on('notification-sound-trigger', (data) => {
                this.handleNotificationSound(data);
            });
            
            socket.on('push-notification-request', (data) => {
                this.handlePushNotificationRequest(data);
            });
        }
    }

    async initializeServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/notification-sw.js');
                console.log('✅ Notification Service Worker registered');
                
                // Listen for messages from service worker
                navigator.serviceWorker.addEventListener('message', (event) => {
                    console.log('📨 Message from service worker:', event.data);
                    this.handleServiceWorkerMessage(event.data);
                });
                
            } catch (error) {
                console.error('❌ Service Worker registration failed:', error);
            }
        }
    }

    showNotificationControls() {
        // Add notification status indicator to UI
        const indicator = document.createElement('div');
        indicator.id = 'talktime-notification-status';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #48bb78;
            color: white;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 12px;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            font-family: system-ui, sans-serif;
        `;
        indicator.innerHTML = '🔔 Notifications Active';
        
        document.body.appendChild(indicator);
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            indicator.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => indicator.remove(), 300);
        }, 3000);
    }

    showNotificationReminder() {
        // Show a persistent but subtle reminder for denied permissions
        const reminder = document.createElement('div');
        reminder.id = 'notification-reminder';
        reminder.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #fef5e7;
            border: 1px solid #f6ad55;
            color: #744210;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 13px;
            max-width: 280px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            cursor: pointer;
        `;
        reminder.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>🔕</span>
                <div>
                    <strong>Notifications Disabled</strong><br>
                    <small>Tap to enable for better experience</small>
                </div>
            </div>
        `;
        
        reminder.onclick = () => {
            this.showPermissionModal();
            reminder.remove();
        };
        
        document.body.appendChild(reminder);
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (reminder.parentNode) {
                reminder.style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => reminder.remove(), 300);
            }
        }, 10000);
    }

    initializeDependentFeatures() {
        // Initialize features that depend on notifications being ready
        console.log('🔧 Initializing dependent features...');
        
        // Initialize notification sound manager
        if (window.TalkTimeNotificationSoundManager) {
            console.log('🔊 Initializing notification sound manager...');
            window.talkTimeNotificationSoundManager = window.TalkTimeNotificationSoundManager.getInstance();
        }
        
        // Initialize meeting reminder system
        if (window.TalkTimeMeetingReminders) {
            window.TalkTimeMeetingReminders.init();
        }
        
        // Initialize instant call system
        if (window.TalkTimeInstantCalls) {
            window.TalkTimeInstantCalls.init();
        }
        
        // Initialize push notification handlers
        if (window.TalkTimePushHandler) {
            window.TalkTimePushHandler.init();
        }

        // Initialize realtime notifications
        this.initializeRealtimeNotifications();
    }

    /**
     * Initialize realtime notification system
     */
    initializeRealtimeNotifications() {
        // Initialize realtime notifications if not already done
        if (!window.realtimeNotifications && window.RealtimeNotifications) {
            console.log('🔌 Initializing realtime notifications...');
            
            // Determine user role from URL or default to volunteer
            const userRole = this.getUserRole();
            window.realtimeNotifications = new window.RealtimeNotifications(userRole);
            
            // Initialize the realtime connection
            window.realtimeNotifications.initialize().then(() => {
                console.log('✅ Realtime notifications initialized');
            }).catch((error) => {
                console.error('❌ Failed to initialize realtime notifications:', error);
            });
        }
    }

    /**
     * Get user role from current context
     */
    getUserRole() {
        // Try to get from URL path
        const path = window.location.pathname;
        if (path.includes('/volunteer/')) return 'volunteer';
        if (path.includes('/student/')) return 'student';
        if (path.includes('/admin/')) return 'admin';
        
        // Try to get from TalkTimeAuth if available
        if (window.TalkTimeAuth && window.TalkTimeAuth.getUser) {
            const user = window.TalkTimeAuth.getUser();
            if (user && user.role) return user.role;
        }
        
        // Default to volunteer
        return 'volunteer';
    }

    handleRealtimeNotification(data) {
        console.log('📨 Received real-time notification:', data);
        
        // Trigger sound notification
        this.triggerNotificationSound(data);
        
        if (Notification.permission === 'granted') {
            const notification = new Notification(data.notification.title, {
                body: data.notification.message,
                icon: data.notification.icon_url || '/favicon.ico',
                badge: data.notification.badge_url || '/favicon.ico',
                tag: data.notification.tag || 'talktime-notification',
                requireInteraction: data.notification.require_interaction || false,
                data: data.notification.metadata || {}
            });
            
            notification.onclick = () => {
                if (data.notification.action_url) {
                    window.open(data.notification.action_url, '_blank');
                }
                notification.close();
            };
        }
    }

    handleNotificationUpdate(data) {
        console.log('🔄 Notification update received:', data);
        
        // Trigger sound for updates if it's a new notification
        if (data.sound_enabled) {
            this.triggerNotificationSound(data);
        }
    }

    handleNotificationSound(data) {
        console.log('🔊 Notification sound trigger received:', data);
        this.triggerNotificationSound(data);
    }

    triggerNotificationSound(data) {
        // Emit custom event for sound manager
        document.dispatchEvent(new CustomEvent('talktimeNotificationSent', {
            detail: {
                type: data.sound_type || data.type || 'default',
                priority: data.sound_priority || data.priority || 'normal',
                metadata: data.metadata || {},
                notification_id: data.notification_id,
                channels: data.channels_used || ['in-app'],
                source: 'realtime'
            }
        }));
    }

    handlePushNotificationRequest(data) {
        console.log('📲 Push notification request:', data);
        
        // Trigger sound for push notifications
        document.dispatchEvent(new CustomEvent('talktimePushNotificationSent', {
            detail: {
                type: data.notificationData.data.sound_type || data.notificationData.data.type || 'default',
                priority: data.notificationData.data.priority || data.priority || 'normal',
                metadata: data.metadata || {},
                source: 'push'
            }
        }));
        
        if (Notification.permission === 'granted') {
            const notification = new Notification(data.notificationData.title, {
                ...data.notificationData,
                data: {
                    ...data.notificationData.data,
                    ...data.metadata
                }
            });
            
            // Handle notification actions
            notification.onclick = () => {
                if (data.notificationData.data.url) {
                    window.focus();
                    window.location.href = data.notificationData.data.url;
                }
                notification.close();
            };
        }
    }

    handleServiceWorkerMessage(data) {
        if (data.type === 'notification-action') {
            console.log('🎯 Notification action:', data.action);
            
            switch (data.action) {
                case 'join':
                    this.handleJoinMeeting(data.meetingId);
                    break;
                case 'remind_later':
                    this.handleRemindLater(data.meetingId);
                    break;
                case 'accept':
                    this.handleAcceptCall(data.callId);
                    break;
                case 'decline':
                    this.handleDeclineCall(data.callId);
                    break;
            }
        } else if (data.type === 'play-notification-sound') {
            // Handle sound requests from service worker
            console.log('🔊 Service worker sound request:', data.data);
            document.dispatchEvent(new CustomEvent('talktimePlayNotificationSound', {
                detail: {
                    type: data.data.sound_type || 'default',
                    options: {
                        priority: data.data.priority,
                        forcePlay: data.data.source === 'push'
                    }
                }
            }));
        } else if (data.type === 'notification-sound-request') {
            // Handle sound requests forwarded from service worker
            document.dispatchEvent(new CustomEvent('talktimePlayNotificationSound', {
                detail: data.data
            }));
        }
    }

    handleJoinMeeting(meetingId) {
        window.location.href = `/meeting/${meetingId}`;
    }

    handleRemindLater(meetingId) {
        // Set a 5-minute reminder
        setTimeout(() => {
            if (Notification.permission === 'granted') {
                new Notification('⏰ Meeting Reminder', {
                    body: 'Your meeting is starting soon!',
                    tag: `meeting-${meetingId}-reminder`
                });
            }
        }, 5 * 60 * 1000);
    }

    handleAcceptCall(callId) {
        window.location.href = `/call/${callId}`;
    }

    handleDeclineCall(callId) {
        // Send decline to backend
        fetch(`/api/v1/calls/${callId}/decline`, { method: 'POST' })
            .then(() => console.log('Call declined'))
            .catch(err => console.error('Error declining call:', err));
    }

    async sendSubscriptionToBackend(subscription) {
        try {
            // Get user ID - should be numeric for database compatibility
            const userId = this.getCurrentUserId();
            if (!userId) {
                throw new Error('No user ID available for subscription');
            }
            
            const response = await fetch('/api/push-notifications/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    subscription,
                    userId,
                    userAgent: navigator.userAgent,
                    deviceInfo: {
                        platform: navigator.platform,
                        language: navigator.language,
                        screen: {
                            width: screen.width,
                            height: screen.height
                        }
                    },
                    timestamp: new Date().toISOString()
                })
            });
            
            if (response.ok) {
                console.log('✅ Subscription sent to backend');
                const result = await response.json();
                if (result.testNotificationSent) {
                    console.log('📱 Test notification should appear shortly');
                }
            } else {
                console.error('❌ Failed to send subscription to backend:', response.statusText);
            }
        } catch (error) {
            console.error('❌ Error sending subscription:', error);
        }
    }

    async getVapidKey() {
        try {
            const response = await fetch('/api/push-notifications/vapid-public-key');
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Failed to get VAPID key');
            }
            
            // Convert the base64 key to Uint8Array for WebPush API
            return this.urlBase64ToUint8Array(data.publicKey);
        } catch (error) {
            console.error('❌ Error getting VAPID key:', error);
            // Fallback to a default key if needed
            const fallbackKey = 'BNxlp8gE5Jx7KqjOVOJNZN1jcKp2KzGQpY5k4M7X3N8vZwY2pF1nQrSt6uV9z2P3A5B7c9D1E3F5G7H9I1J3k5L7m9N1O3p5Q7r9S1t3U5v7W9x1Y3z5';
            return this.urlBase64ToUint8Array(fallbackKey);
        }
    }

    // Utility function to convert base64 to Uint8Array for VAPID keys
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    trackEvent(eventName, data = {}) {
        // Send analytics
        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, data);
        }
        
        // Send to backend (only if not on test pages)
        if (!window.location.pathname.includes('test-notifications')) {
            fetch('/api/v1/analytics/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ event: eventName, data })
            }).catch(err => {
                // Silently ignore analytics errors
                // console.debug('Analytics not available:', err.message);
            });
        }
    }

    loadNotificationModalScript() {
        if (this.loadingModal) {
            console.log('🔄 Modal script already loading...');
            return;
        }
        
        // Check if the modal class is already available
        if (typeof NotificationPermissionModal !== 'undefined') {
            console.log('✅ NotificationPermissionModal already available');
            this.checkCount = 0;
            setTimeout(() => this.checkAndEnforcePermission(), 500);
            return;
        }
        
        this.loadingModal = true;
        console.log('📥 Loading notification modal script...');
        
        // Fallback: load the notification modal script if it's not available
        const script = document.createElement('script');
        script.src = '/shared/js/notification-permission-modal.js';
        script.onload = () => {
            console.log('✅ Notification modal script loaded');
            this.loadingModal = false;
            // Reset check count and try again
            this.checkCount = 0;
            setTimeout(() => this.checkAndEnforcePermission(), 1000);
        };
        script.onerror = () => {
            console.error('❌ Failed to load notification modal script');
            this.loadingModal = false;
        };
        document.head.appendChild(script);
    }

    // Get current user ID from various sources
    getCurrentUserId() {
        // Try to get from localStorage first
        let userId = localStorage.getItem('talktime_user_id');
        if (userId) {
            // Ensure it's a number
            const numericUserId = parseInt(userId);
            return isNaN(numericUserId) ? null : numericUserId;
        }
        
        // Try to get from sessionStorage
        userId = sessionStorage.getItem('talktime_user_id');
        if (userId) {
            const numericUserId = parseInt(userId);
            if (!isNaN(numericUserId)) {
                localStorage.setItem('talktime_user_id', numericUserId.toString());
                return numericUserId;
            }
        }
        
        // Try to get from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        userId = urlParams.get('userId') || urlParams.get('user_id');
        if (userId) {
            const numericUserId = parseInt(userId);
            if (!isNaN(numericUserId)) {
                localStorage.setItem('talktime_user_id', numericUserId.toString());
                return numericUserId;
            }
        }
        
        // Try to get from path (e.g., /user/123/dashboard)
        const pathMatch = window.location.pathname.match(/\/user\/(\d+)/);
        if (pathMatch) {
            const numericUserId = parseInt(pathMatch[1]);
            if (!isNaN(numericUserId)) {
                localStorage.setItem('talktime_user_id', numericUserId.toString());
                return numericUserId;
            }
        }
        
        // For development/testing, use a default test user ID (student from database)
        const testUserId = 23; // ADM0001-anderson-gatere student
        sessionStorage.setItem('talktime_user_id', testUserId.toString());
        console.log('📝 Using test userId:', testUserId);
        return testUserId;
    }

    // Static method to check if enforcer is ready
    static isReady() {
        return window.talkTimeNotificationEnforcer && window.talkTimeNotificationEnforcer.initialized;
    }

    // Static method to get current permission status
    static getPermissionStatus() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    }
}

// Initialize the enforcer immediately
window.talkTimeNotificationEnforcer = new TalkTimeNotificationEnforcer();

// Make the class globally available
window.TalkTimeNotificationEnforcer = TalkTimeNotificationEnforcer;

console.log('🔔 TalkTime Notification Enforcer loaded');

// Make NotificationEnforcer available globally
window.NotificationEnforcer = TalkTimeNotificationEnforcer;
