/**
 * TalkTime Notification Sound Manager
 * Handles sound notifications for in-app and system notifications
 * Supports multiple sound types, volume controls, and user preferences
 */

class TalkTimeNotificationSoundManager {
    constructor() {
        // Prevent multiple instances
        if (window.talkTimeNotificationSoundManager) {
            console.log('🔄 Using existing NotificationSoundManager instance');
            return window.talkTimeNotificationSoundManager;
        }

        this.initialized = false;
        this.sounds = new Map();
        this.audioContext = null;
        this.masterVolume = 0.7; // Default volume
        this.enabled = true;
        this.userPreferences = {};
        
        // Default sound configurations
        this.soundConfigs = {
            'default': {
                frequency: 800,
                duration: 200,
                volume: 0.5,
                type: 'sine',
                envelope: 'fade'
            },
            'meeting_reminder': {
                frequency: 600,
                duration: 300,
                volume: 0.6,
                type: 'sine',
                envelope: 'pulse',
                repeat: 2,
                gap: 100
            },
            'instant_call': {
                frequency: 1000,
                duration: 500,
                volume: 0.8,
                type: 'square',
                envelope: 'urgent',
                repeat: 3,
                gap: 200
            },
            'meeting_scheduled': {
                frequency: 500,
                duration: 250,
                volume: 0.5,
                type: 'triangle',
                envelope: 'gentle'
            },
            'meeting_rescheduled': {
                frequency: 700,
                duration: 200,
                volume: 0.6,
                type: 'sine',
                envelope: 'double',
                repeat: 2,
                gap: 150
            },
            'system_notification': {
                frequency: 650,
                duration: 180,
                volume: 0.4,
                type: 'sine',
                envelope: 'soft'
            },
            'urgent': {
                frequency: 1200,
                duration: 400,
                volume: 0.9,
                type: 'sawtooth',
                envelope: 'urgent',
                repeat: 4,
                gap: 100
            },
            'success': {
                frequency: 880,
                duration: 150,
                volume: 0.5,
                type: 'sine',
                envelope: 'rise'
            },
            'error': {
                frequency: 400,
                duration: 300,
                volume: 0.6,
                type: 'square',
                envelope: 'decay'
            }
        };

        // Store instance globally
        window.talkTimeNotificationSoundManager = this;
        
        this.init();
    }

    async init() {
        console.log('🔊 TalkTime Notification Sound Manager initializing...');
        
        try {
            // Initialize Web Audio API with user interaction handling
            await this.initializeAudioContext();
            
            // Load user preferences
            this.loadUserPreferences();
            
            // Create audio elements for fallback
            this.initializeFallbackAudio();
            
            // Listen for notification events
            this.setupEventListeners();
            
            this.initialized = true;
            console.log('✅ Notification Sound Manager initialized');
            
            // Emit ready event
            document.dispatchEvent(new CustomEvent('talkTimeNotificationSoundReady', {
                detail: { manager: this }
            }));
            
        } catch (error) {
            console.error('❌ Error initializing Notification Sound Manager:', error);
            this.initialized = false;
        }
    }

    async initializeAudioContext() {
        try {
            // Create AudioContext (will be suspended until user interaction)
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            if (this.audioContext.state === 'suspended') {
                console.log('🔇 AudioContext suspended - will resume on user interaction');
                
                // Resume on first user interaction
                const resumeAudio = async () => {
                    if (this.audioContext.state === 'suspended') {
                        await this.audioContext.resume();
                        console.log('🔊 AudioContext resumed');
                    }
                    document.removeEventListener('click', resumeAudio);
                    document.removeEventListener('touchstart', resumeAudio);
                    document.removeEventListener('keydown', resumeAudio);
                };
                
                document.addEventListener('click', resumeAudio);
                document.addEventListener('touchstart', resumeAudio);
                document.addEventListener('keydown', resumeAudio);
            }
            
        } catch (error) {
            console.warn('⚠️ Web Audio API not available, using fallback:', error);
            this.audioContext = null;
        }
    }

    initializeFallbackAudio() {
        // Create audio elements for browsers without Web Audio API support
        this.fallbackAudio = document.createElement('audio');
        this.fallbackAudio.volume = this.masterVolume;
        this.fallbackAudio.preload = 'auto';
        
        // Create basic notification sound data URL
        this.createFallbackSounds();
    }

    createFallbackSounds() {
        // Create a simple beep sound as fallback
        const sampleRate = 22050;
        const duration = 0.2;
        const samples = duration * sampleRate;
        const frequency = 800;
        
        const buffer = new ArrayBuffer(44 + samples * 2);
        const view = new DataView(buffer);
        
        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + samples * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, samples * 2, true);
        
        // Generate sine wave
        for (let i = 0; i < samples; i++) {
            const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3 * 32767;
            view.setInt16(44 + i * 2, sample, true);
        }
        
        // Create blob and data URL
        const blob = new Blob([buffer], { type: 'audio/wav' });
        this.fallbackSoundUrl = URL.createObjectURL(blob);
    }

    setupEventListeners() {
        // Listen for notification events
        document.addEventListener('talktimeNotificationSent', (event) => {
            this.handleNotificationSound(event.detail);
        });

        // Listen for push notification events
        document.addEventListener('talktimePushNotificationSent', (event) => {
            this.handlePushNotificationSound(event.detail);
        });

        // Listen for in-app notification events
        document.addEventListener('talktimeInAppNotificationShown', (event) => {
            this.handleInAppNotificationSound(event.detail);
        });

        // Listen for custom sound requests
        document.addEventListener('talktimePlayNotificationSound', (event) => {
            this.playSound(event.detail.type || 'default', event.detail.options);
        });

        // Listen for visibility changes to respect user focus
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });
    }

    loadUserPreferences() {
        try {
            const stored = localStorage.getItem('talktime_notification_sound_preferences');
            if (stored) {
                this.userPreferences = JSON.parse(stored);
            }
            
            // Apply stored preferences
            this.enabled = this.userPreferences.enabled !== false;
            this.masterVolume = this.userPreferences.masterVolume || 0.7;
            
            console.log('🔊 Loaded sound preferences:', this.userPreferences);
        } catch (error) {
            console.error('❌ Error loading sound preferences:', error);
            this.userPreferences = {};
        }
    }

    saveUserPreferences() {
        try {
            const preferences = {
                enabled: this.enabled,
                masterVolume: this.masterVolume,
                soundTypes: this.userPreferences.soundTypes || {},
                lastUpdated: new Date().toISOString()
            };
            
            localStorage.setItem('talktime_notification_sound_preferences', JSON.stringify(preferences));
            this.userPreferences = preferences;
            console.log('💾 Saved sound preferences');
        } catch (error) {
            console.error('❌ Error saving sound preferences:', error);
        }
    }

    /**
     * Play notification sound based on type
     * @param {string} type - Sound type (meeting_reminder, instant_call, etc.)
     * @param {Object} options - Additional options
     * @returns {Promise} - Resolves when sound completes
     */
    async playSound(type = 'default', options = {}) {
        if (!this.enabled || !this.initialized) {
            console.log('🔇 Sound disabled or not initialized');
            return;
        }

        // Check user preferences for this sound type
        if (this.userPreferences.soundTypes && this.userPreferences.soundTypes[type] === false) {
            console.log(`🔇 Sound type '${type}' disabled by user preference`);
            return;
        }

        // Respect system do not disturb (if page is not visible)
        if (document.hidden && !options.forcePlay) {
            console.log('🔇 Page not visible, skipping sound (use forcePlay to override)');
            return;
        }

        try {
            const config = {
                ...this.soundConfigs[type] || this.soundConfigs.default,
                ...options
            };

            console.log(`🔊 Playing ${type} notification sound`);

            if (this.audioContext && this.audioContext.state === 'running') {
                await this.playWebAudioSound(config);
            } else {
                await this.playFallbackSound(config);
            }

            // Track sound play event
            this.trackSoundEvent(type, 'played');

        } catch (error) {
            console.error('❌ Error playing notification sound:', error);
            // Fallback to system beep if available
            this.playSystemBeep();
        }
    }

    async playWebAudioSound(config) {
        const {
            frequency,
            duration,
            volume,
            type,
            envelope,
            repeat = 1,
            gap = 100
        } = config;

        for (let i = 0; i < repeat; i++) {
            if (i > 0) {
                await this.delay(gap);
            }

            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            // Connect nodes
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            // Configure oscillator
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);

            // Configure envelope
            const startTime = this.audioContext.currentTime;
            const endTime = startTime + (duration / 1000);
            const effectiveVolume = volume * this.masterVolume;

            switch (envelope) {
                case 'fade':
                    gainNode.gain.setValueAtTime(0, startTime);
                    gainNode.gain.linearRampToValueAtTime(effectiveVolume, startTime + 0.01);
                    gainNode.gain.linearRampToValueAtTime(0, endTime);
                    break;

                case 'pulse':
                    gainNode.gain.setValueAtTime(effectiveVolume, startTime);
                    gainNode.gain.setValueAtTime(0, startTime + (duration / 1000) * 0.3);
                    gainNode.gain.setValueAtTime(effectiveVolume, startTime + (duration / 1000) * 0.6);
                    gainNode.gain.setValueAtTime(0, endTime);
                    break;

                case 'urgent':
                    gainNode.gain.setValueAtTime(0, startTime);
                    gainNode.gain.linearRampToValueAtTime(effectiveVolume, startTime + 0.005);
                    gainNode.gain.linearRampToValueAtTime(effectiveVolume * 0.7, startTime + (duration / 1000) * 0.5);
                    gainNode.gain.linearRampToValueAtTime(0, endTime);
                    break;

                case 'double':
                    gainNode.gain.setValueAtTime(effectiveVolume, startTime);
                    gainNode.gain.setValueAtTime(0, startTime + (duration / 1000) * 0.2);
                    gainNode.gain.setValueAtTime(effectiveVolume, startTime + (duration / 1000) * 0.4);
                    gainNode.gain.setValueAtTime(0, endTime);
                    break;

                case 'gentle':
                    gainNode.gain.setValueAtTime(0, startTime);
                    gainNode.gain.linearRampToValueAtTime(effectiveVolume * 0.8, startTime + (duration / 1000) * 0.3);
                    gainNode.gain.linearRampToValueAtTime(0, endTime);
                    break;

                case 'rise':
                    gainNode.gain.setValueAtTime(effectiveVolume * 0.3, startTime);
                    gainNode.gain.linearRampToValueAtTime(effectiveVolume, endTime);
                    break;

                case 'decay':
                    gainNode.gain.setValueAtTime(effectiveVolume, startTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, endTime);
                    break;

                case 'soft':
                default:
                    gainNode.gain.setValueAtTime(effectiveVolume, startTime);
                    gainNode.gain.setValueAtTime(0, endTime);
                    break;
            }

            // Play the sound
            oscillator.start(startTime);
            oscillator.stop(endTime);

            // Wait for this iteration to complete
            await this.delay(duration);
        }
    }

    async playFallbackSound(config) {
        if (this.fallbackSoundUrl) {
            const audio = new Audio(this.fallbackSoundUrl);
            audio.volume = config.volume * this.masterVolume;
            
            try {
                await audio.play();
            } catch (error) {
                console.warn('⚠️ Fallback audio play failed:', error);
                this.playSystemBeep();
            }
        } else {
            this.playSystemBeep();
        }
    }

    playSystemBeep() {
        // Last resort: try to trigger system beep
        try {
            // This might work in some browsers/environments
            console.log('\u0007'); // Bell character
            
            // Alternative: create a minimal audio element
            const beep = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+LyvmgdBjCa3O/DfU0HIIvT8NSGOwgNZJDT8daCQAkWE');
            beep.volume = 0.1;
            beep.play().catch(() => {});
        } catch (error) {
            // Silent fail for system beep
        }
    }

    // Handle different notification types
    handleNotificationSound(detail) {
        const { type, priority, metadata } = detail;
        
        let soundType = 'default';
        
        switch (type) {
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
            case 'system':
                soundType = 'system_notification';
                break;
            default:
                if (priority === 'urgent') {
                    soundType = 'urgent';
                } else if (priority === 'high') {
                    soundType = 'meeting_reminder';
                }
                break;
        }

        this.playSound(soundType, {
            forcePlay: priority === 'urgent'
        });
    }

    handlePushNotificationSound(detail) {
        // Push notifications should always play sound
        this.handleNotificationSound({
            ...detail,
            forcePlay: true
        });
    }

    handleInAppNotificationSound(detail) {
        // In-app notifications use gentle sounds
        const soundType = detail.type === 'error' ? 'error' : 
                         detail.type === 'success' ? 'success' : 'system_notification';
        
        this.playSound(soundType);
    }

    handleVisibilityChange() {
        if (document.hidden) {
            console.log('🔇 Page hidden - sounds will be limited');
        } else {
            console.log('🔊 Page visible - sounds enabled');
        }
    }

    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    trackSoundEvent(type, action) {
        // Track sound usage for analytics
        if (typeof gtag !== 'undefined') {
            gtag('event', 'notification_sound', {
                sound_type: type,
                action: action,
                timestamp: new Date().toISOString()
            });
        }
    }

    // Public API methods
    enable() {
        this.enabled = true;
        this.saveUserPreferences();
        console.log('🔊 Notification sounds enabled');
    }

    disable() {
        this.enabled = false;
        this.saveUserPreferences();
        console.log('🔇 Notification sounds disabled');
    }

    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this.saveUserPreferences();
        console.log(`🔊 Volume set to ${Math.round(this.masterVolume * 100)}%`);
    }

    enableSoundType(type) {
        if (!this.userPreferences.soundTypes) {
            this.userPreferences.soundTypes = {};
        }
        this.userPreferences.soundTypes[type] = true;
        this.saveUserPreferences();
        console.log(`🔊 Sound type '${type}' enabled`);
    }

    disableSoundType(type) {
        if (!this.userPreferences.soundTypes) {
            this.userPreferences.soundTypes = {};
        }
        this.userPreferences.soundTypes[type] = false;
        this.saveUserPreferences();
        console.log(`🔇 Sound type '${type}' disabled`);
    }

    // Test sound method
    async testSound(type = 'default') {
        console.log(`🔊 Testing ${type} sound...`);
        await this.playSound(type, { forcePlay: true });
    }

    // Get available sound types
    getAvailableSoundTypes() {
        return Object.keys(this.soundConfigs);
    }

    // Get current preferences
    getPreferences() {
        return {
            enabled: this.enabled,
            masterVolume: this.masterVolume,
            soundTypes: this.userPreferences.soundTypes || {}
        };
    }

    // Method to add custom sound
    addCustomSound(type, config) {
        this.soundConfigs[type] = {
            ...this.soundConfigs.default,
            ...config
        };
        console.log(`🔊 Added custom sound type: ${type}`);
    }

    // Static method to get instance
    static getInstance() {
        return window.talkTimeNotificationSoundManager || new TalkTimeNotificationSoundManager();
    }
}

// Initialize the sound manager
if (!window.talkTimeNotificationSoundManager) {
    window.talkTimeNotificationSoundManager = new TalkTimeNotificationSoundManager();
}

// Make class globally available
window.TalkTimeNotificationSoundManager = TalkTimeNotificationSoundManager;

console.log('🔊 TalkTime Notification Sound Manager loaded');

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TalkTimeNotificationSoundManager;
}
