/**
 * TalkTime Notification Sound Integration
 * Ensures notification sounds play automatically when notifications are sent
 * This script bridges the notification system and sound manager
 */

(function() {
    'use strict';

    console.log('🔊 TalkTime Notification Sound Integration loading...');

    // Configuration
    const config = {
        autoInitialize: true,
        enableSounds: true,
        debugMode: true,
        soundMappings: {
            'meeting_reminder': 'meeting_reminder',
            'meeting_reminder_5min': 'meeting_reminder',
            'meeting_reminder_10min': 'meeting_reminder', 
            'meeting_reminder_30min': 'meeting_reminder',
            'instant_call': 'instant_call',
            'meeting_scheduled': 'meeting_scheduled',
            'meeting_rescheduled': 'meeting_rescheduled',
            'meeting_cancelled': 'system_notification',
            'system': 'system_notification',
            'urgent': 'urgent',
            'success': 'success',
            'error': 'error',
            'default': 'default'
        }
    };

    class NotificationSoundIntegration {
        constructor() {
            this.soundManager = null;
            this.initialized = false;
            this.pendingSounds = [];
            
            this.init();
        }

        async init() {
            console.log('🎵 Initializing notification sound integration...');

            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.initialize());
            } else {
                await this.initialize();
            }
        }

        async initialize() {
            try {
                // Wait for sound manager to be available
                await this.waitForSoundManager();
                
                // Setup event listeners
                this.setupEventListeners();
                
                // Setup service worker communication
                this.setupServiceWorkerCommunication();
                
                // Process any pending sounds
                this.processPendingSounds();
                
                this.initialized = true;
                console.log('✅ Notification sound integration initialized successfully');

                // Emit ready event
                document.dispatchEvent(new CustomEvent('talktimeNotificationSoundIntegrationReady', {
                    detail: { integration: this }
                }));

            } catch (error) {
                console.error('❌ Failed to initialize notification sound integration:', error);
            }
        }

        async waitForSoundManager() {
            return new Promise((resolve, reject) => {
                const checkSoundManager = () => {
                    if (window.talkTimeNotificationSoundManager && window.talkTimeNotificationSoundManager.initialized) {
                        this.soundManager = window.talkTimeNotificationSoundManager;
                        resolve();
                    } else if (window.TalkTimeNotificationSoundManager) {
                        // Create instance if it doesn't exist
                        this.soundManager = window.TalkTimeNotificationSoundManager.getInstance();
                        if (this.soundManager.initialized) {
                            resolve();
                        } else {
                            // Wait for initialization
                            document.addEventListener('talkTimeNotificationSoundReady', () => {
                                this.soundManager = window.talkTimeNotificationSoundManager;
                                resolve();
                            }, { once: true });
                        }
                    } else {
                        // Retry after delay
                        setTimeout(checkSoundManager, 500);
                    }
                };
                
                checkSoundManager();
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    reject(new Error('Sound manager initialization timeout'));
                }, 10000);
            });
        }

        setupEventListeners() {
            // Listen for notification events
            document.addEventListener('talktimeNotificationSent', (event) => {
                this.handleNotificationSound(event.detail);
            });

            document.addEventListener('talktimePushNotificationSent', (event) => {
                this.handlePushNotificationSound(event.detail);
            });

            document.addEventListener('talktimeInAppNotificationShown', (event) => {
                this.handleInAppNotificationSound(event.detail);
            });

            // Listen for custom sound requests
            document.addEventListener('talktimePlayNotificationSound', (event) => {
                this.playSound(event.detail.type || 'default', event.detail.options);
            });

            // Listen for Socket.IO events if available
            if (window.io && typeof window.io === 'function') {
                this.setupSocketIOListeners();
            }

            console.log('🎧 Event listeners set up for notification sounds');
        }

        setupSocketIOListeners() {
            // Wait for socket connection
            const setupSocket = () => {
                if (window.realtimeNotifications && window.realtimeNotifications.socket) {
                    const socket = window.realtimeNotifications.socket;
                    
                    // Listen for notification sound triggers
                    socket.on('notification-sound-trigger', (data) => {
                        console.log('🔊 Socket sound trigger received:', data);
                        this.handleNotificationSound(data);
                    });

                    console.log('🔌 Socket.IO listeners set up for notification sounds');
                } else {
                    // Retry after delay
                    setTimeout(setupSocket, 1000);
                }
            };

            setupSocket();
        }

        setupServiceWorkerCommunication() {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.addEventListener('message', (event) => {
                    const { type, data } = event.data;
                    
                    if (type === 'play-notification-sound' || type === 'notification-sound-request') {
                        console.log('🔊 Service worker sound request:', data);
                        this.handleServiceWorkerSoundRequest(data);
                    }
                });
            }
        }

        handleNotificationSound(data) {
            if (!config.enableSounds || !this.soundManager) {
                if (config.debugMode) {
                    console.log('🔇 Sounds disabled or sound manager not available');
                }
                return;
            }

            const soundType = this.mapNotificationTypeToSound(data.type);
            const options = {
                priority: data.priority,
                forcePlay: data.priority === 'urgent' || data.source === 'push'
            };

            if (config.debugMode) {
                console.log(`🔊 Playing notification sound: ${soundType} (original type: ${data.type})`);
            }

            this.playSound(soundType, options);
        }

        handlePushNotificationSound(data) {
            if (!config.enableSounds || !this.soundManager) return;

            const soundType = this.mapNotificationTypeToSound(data.type);
            const options = {
                priority: data.priority,
                forcePlay: true // Push notifications should always play
            };

            if (config.debugMode) {
                console.log(`🔔 Playing push notification sound: ${soundType}`);
            }

            this.playSound(soundType, options);
        }

        handleInAppNotificationSound(data) {
            if (!config.enableSounds || !this.soundManager) return;

            const soundType = data.type === 'error' ? 'error' : 
                             data.type === 'success' ? 'success' : 'system_notification';
            
            if (config.debugMode) {
                console.log(`📱 Playing in-app notification sound: ${soundType}`);
            }

            this.playSound(soundType, { priority: 'normal' });
        }

        handleServiceWorkerSoundRequest(data) {
            if (!config.enableSounds || !this.soundManager) return;

            const soundType = this.mapNotificationTypeToSound(data.sound_type || data.type || 'default');
            const options = {
                priority: data.priority,
                forcePlay: data.source === 'push'
            };

            if (config.debugMode) {
                console.log(`⚙️ Playing service worker sound: ${soundType}`);
            }

            this.playSound(soundType, options);
        }

        mapNotificationTypeToSound(type) {
            return config.soundMappings[type] || config.soundMappings.default;
        }

        async playSound(soundType, options = {}) {
            if (!this.soundManager) {
                // Queue sound for later if sound manager not ready
                this.pendingSounds.push({ soundType, options });
                return;
            }

            try {
                await this.soundManager.playSound(soundType, options);
                
                if (config.debugMode) {
                    console.log(`✅ Successfully played ${soundType} sound`);
                }
            } catch (error) {
                console.error(`❌ Error playing ${soundType} sound:`, error);
            }
        }

        processPendingSounds() {
            if (this.pendingSounds.length === 0) return;

            console.log(`🔄 Processing ${this.pendingSounds.length} pending sounds...`);

            const sounds = [...this.pendingSounds];
            this.pendingSounds = [];

            sounds.forEach(({ soundType, options }) => {
                this.playSound(soundType, options);
            });
        }

        // Public API methods
        enable() {
            config.enableSounds = true;
            console.log('🔊 Notification sounds enabled');
        }

        disable() {
            config.enableSounds = false;
            console.log('🔇 Notification sounds disabled');
        }

        isEnabled() {
            return config.enableSounds;
        }

        isInitialized() {
            return this.initialized;
        }

        getSoundManager() {
            return this.soundManager;
        }

        // Test method
        async testSound(type = 'default') {
            console.log(`🧪 Testing ${type} sound...`);
            await this.playSound(type, { forcePlay: true });
        }

        // Configuration methods
        setSoundMapping(notificationType, soundType) {
            config.soundMappings[notificationType] = soundType;
            console.log(`🔧 Set sound mapping: ${notificationType} -> ${soundType}`);
        }

        setDebugMode(enabled) {
            config.debugMode = enabled;
            console.log(`🐛 Debug mode ${enabled ? 'enabled' : 'disabled'}`);
        }
    }

    // Initialize the integration
    let integrationInstance = null;

    // Auto-initialize if configured
    if (config.autoInitialize) {
        integrationInstance = new NotificationSoundIntegration();
    }

    // Make integration available globally
    window.TalkTimeNotificationSoundIntegration = NotificationSoundIntegration;
    window.talkTimeNotificationSoundIntegration = integrationInstance;

    console.log('🔊 TalkTime Notification Sound Integration loaded');

})();
