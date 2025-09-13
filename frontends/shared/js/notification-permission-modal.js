/**
 * Universal Notification Permission Modal
 * Shows a modal to request notification permission from all users
 * Must be allowed before accessing any part of the application
 */

// Prevent redeclaration if already loaded
if (typeof NotificationPermissionModal === 'undefined') {

class NotificationPermissionModal {
    constructor(options = {}) {
        this.options = {
            title: options.title || 'Enable Notifications for TalkTime',
            message: options.message || 'Stay connected with instant meeting reminders, call notifications, and important updates. Enable notifications to get the best TalkTime experience.',
            allowButtonText: options.allowButtonText || '🔔 Enable Notifications',
            denyButtonText: options.denyButtonText || 'Maybe Later',
            mandatory: options.mandatory !== false, // Default to mandatory
            onAllow: options.onAllow || this.defaultOnAllow.bind(this),
            onDeny: options.onDeny || this.defaultOnDeny.bind(this),
            onClose: options.onClose || this.defaultOnClose.bind(this),
            ...options
        };
        
        this.modal = null;
        this.backdrop = null;
        this.permissionStatus = 'unknown';
        this.init();
    }

    init() {
        this.checkNotificationSupport();
        this.checkCurrentPermission();
        this.createModal();
        this.bindEvents();
    }

    checkNotificationSupport() {
        if (!('Notification' in window)) {
            console.warn('🚫 This browser does not support notifications');
            this.permissionStatus = 'unsupported';
            return false;
        }
        return true;
    }

    checkCurrentPermission() {
        if ('Notification' in window) {
            this.permissionStatus = Notification.permission;
            console.log(`🔔 Current notification permission: ${this.permissionStatus}`);
        }
    }

    shouldShowModal() {
        // Show modal if:
        // 1. Notifications are supported
        // 2. Permission is not granted
        // 3. User hasn't permanently dismissed (unless mandatory)
        
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'granted') return false;
        
        // Check if user has permanently dismissed
        const dismissed = localStorage.getItem('talktime_notification_dismissed');
        if (dismissed && !this.options.mandatory) return false;
        
        return true;
    }

    createModal() {
        // Create backdrop
        this.backdrop = document.createElement('div');
        this.backdrop.id = 'notification-permission-backdrop';
        this.backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease-out;
        `;

        // Create modal
        this.modal = document.createElement('div');
        this.modal.id = 'notification-permission-modal';
        this.modal.style.cssText = `
            background: white;
            border-radius: 16px;
            padding: 32px;
            max-width: 480px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            position: relative;
            animation: slideUp 0.3s ease-out;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Modal content
        this.modal.innerHTML = `
            <div style="text-align: center;">
                <!-- TalkTime Logo/Icon -->
                <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; font-size: 36px; color: white;">
                    🔔
                </div>
                
                <!-- Title -->
                <h2 style="font-size: 24px; font-weight: 700; color: #1a202c; margin: 0 0 16px 0; line-height: 1.3;">
                    ${this.options.title}
                </h2>
                
                <!-- Message -->
                <p style="font-size: 16px; color: #4a5568; margin: 0 0 32px 0; line-height: 1.6;">
                    ${this.options.message}
                </p>
                
                <!-- Benefits List -->
                <div style="text-align: left; background: #f7fafc; border-radius: 12px; padding: 20px; margin: 0 0 32px 0;">
                    <h3 style="font-size: 16px; font-weight: 600; color: #2d3748; margin: 0 0 12px 0;">
                        📱 What you'll get:
                    </h3>
                    <ul style="margin: 0; padding: 0; list-style: none; color: #4a5568; font-size: 14px; line-height: 1.6;">
                        <li style="margin: 8px 0; display: flex; align-items: center;">
                            <span style="margin-right: 8px;">⏰</span>
                            Meeting reminders (1 hour, 30 min, 5 min before)
                        </li>
                        <li style="margin: 8px 0; display: flex; align-items: center;">
                            <span style="margin-right: 8px;">📞</span>
                            Instant call notifications when students call you
                        </li>
                        <li style="margin: 8px 0; display: flex; align-items: center;">
                            <span style="margin-right: 8px;">📅</span>
                            Schedule changes and meeting confirmations
                        </li>
                        <li style="margin: 8px 0; display: flex; align-items: center;">
                            <span style="margin-right: 8px;">🔔</span>
                            Important system updates and announcements
                        </li>
                    </ul>
                </div>
                
                <!-- Action Buttons -->
                <div style="display: flex; gap: 12px; flex-direction: column;">
                    <button 
                        id="allow-notifications-btn" 
                        style="
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            border: none;
                            border-radius: 12px;
                            padding: 16px 24px;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.2s ease;
                            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                        "
                        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(102, 126, 234, 0.4)'"
                        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.3)'"
                    >
                        ${this.options.allowButtonText}
                    </button>
                    
                    ${!this.options.mandatory ? `
                    <button 
                        id="deny-notifications-btn" 
                        style="
                            background: transparent;
                            color: #718096;
                            border: 2px solid #e2e8f0;
                            border-radius: 12px;
                            padding: 14px 24px;
                            font-size: 14px;
                            font-weight: 500;
                            cursor: pointer;
                            transition: all 0.2s ease;
                        "
                        onmouseover="this.style.borderColor='#cbd5e0'; this.style.color='#4a5568'"
                        onmouseout="this.style.borderColor='#e2e8f0'; this.style.color='#718096'"
                    >
                        ${this.options.denyButtonText}
                    </button>
                    ` : ''}
                </div>
                
                <!-- Privacy Note -->
                <p style="font-size: 12px; color: #a0aec0; margin: 24px 0 0 0; line-height: 1.4;">
                    🔒 We respect your privacy. Notifications are only sent for important TalkTime updates. You can change this setting anytime in your browser or account settings.
                </p>
            </div>
        `;

        // Add CSS animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes slideUp {
                from { transform: translateY(50px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            
            @keyframes slideDown {
                from { transform: translateY(0); opacity: 1; }
                to { transform: translateY(50px); opacity: 0; }
            }
            
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(style);

        this.backdrop.appendChild(this.modal);
    }

    bindEvents() {
        // Allow button
        const allowBtn = this.modal.querySelector('#allow-notifications-btn');
        if (allowBtn) {
            allowBtn.addEventListener('click', this.requestPermission.bind(this));
        }

        // Deny button (if not mandatory)
        const denyBtn = this.modal.querySelector('#deny-notifications-btn');
        if (denyBtn) {
            denyBtn.addEventListener('click', this.denyPermission.bind(this));
        }

        // Prevent modal close on backdrop click if mandatory
        this.backdrop.addEventListener('click', (e) => {
            if (e.target === this.backdrop && !this.options.mandatory) {
                this.denyPermission();
            }
        });

        // Escape key handling
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.options.mandatory) {
                this.denyPermission();
            }
        });
    }

    async requestPermission() {
        console.log('🔔 Requesting notification permission...');
        
        try {
            // Update button state
            const allowBtn = this.modal.querySelector('#allow-notifications-btn');
            allowBtn.innerHTML = '⏳ Requesting Permission...';
            allowBtn.disabled = true;

            const permission = await Notification.requestPermission();
            console.log(`🔔 Permission result: ${permission}`);
            
            if (permission === 'granted') {
                // Show success state
                allowBtn.innerHTML = '✅ Notifications Enabled!';
                allowBtn.style.background = 'linear-gradient(135deg, #48bb78, #38a169)';
                
                // Send test notification
                setTimeout(() => {
                    this.sendTestNotification();
                }, 500);
                
                // Store permission granted
                localStorage.setItem('talktime_notification_permission', 'granted');
                localStorage.removeItem('talktime_notification_dismissed');
                
                // Close modal after brief delay
                setTimeout(() => {
                    this.closeModal();
                    this.options.onAllow(permission);
                }, 2000);
                
            } else {
                // Permission denied
                allowBtn.innerHTML = '❌ Permission Denied';
                allowBtn.style.background = 'linear-gradient(135deg, #f56565, #e53e3e)';
                
                localStorage.setItem('talktime_notification_permission', permission);
                
                setTimeout(() => {
                    this.closeModal();
                    this.options.onDeny(permission);
                }, 2000);
            }
            
        } catch (error) {
            console.error('❌ Error requesting notification permission:', error);
            allowBtn.innerHTML = '❌ Error Occurred';
            allowBtn.style.background = 'linear-gradient(135deg, #f56565, #e53e3e)';
            
            setTimeout(() => {
                this.closeModal();
                this.options.onDeny('error');
            }, 2000);
        }
    }

    denyPermission() {
        console.log('🚫 User denied notification permission');
        
        if (!this.options.mandatory) {
            localStorage.setItem('talktime_notification_dismissed', 'true');
            localStorage.setItem('talktime_notification_permission', 'denied');
        }
        
        this.closeModal();
        this.options.onDeny('denied');
    }

    sendTestNotification() {
        if (Notification.permission === 'granted') {
            const notification = new Notification('🎉 TalkTime Notifications Enabled!', {
                body: 'You\'ll now receive meeting reminders, call notifications, and important updates.',
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: 'talktime-welcome',
                requireInteraction: false
                // Note: actions are only supported in ServiceWorker notifications
            });

            notification.onclick = function() {
                window.focus();
                notification.close();
            };

            // Auto-close after 5 seconds
            setTimeout(() => {
                notification.close();
            }, 5000);
        }
    }

    closeModal() {
        if (this.backdrop && this.backdrop.parentNode) {
            // Add closing animation
            this.backdrop.style.animation = 'fadeOut 0.3s ease-out';
            this.modal.style.animation = 'slideDown 0.3s ease-out';
            
            setTimeout(() => {
                if (this.backdrop && this.backdrop.parentNode) {
                    this.backdrop.parentNode.removeChild(this.backdrop);
                }
            }, 300);
        }
    }

    show() {
        if (this.shouldShowModal()) {
            document.body.appendChild(this.backdrop);
            console.log('📱 Showing notification permission modal');
            return true;
        }
        console.log('📱 Modal not needed - permission already granted or not supported');
        return false;
    }

    // Default event handlers
    defaultOnAllow(permission) {
        console.log('✅ Notification permission granted:', permission);
        // Track analytics
        this.trackEvent('notification_permission_granted', { permission });
    }

    defaultOnDeny(permission) {
        console.log('❌ Notification permission denied:', permission);
        // Track analytics
        this.trackEvent('notification_permission_denied', { permission });
        
        // If mandatory, show warning
        if (this.options.mandatory) {
            this.showMandatoryWarning();
        }
    }

    defaultOnClose() {
        console.log('📱 Notification permission modal closed');
    }

    showMandatoryWarning() {
        // Show a subtle warning that notifications are recommended
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #fed7d7;
            color: #c53030;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            font-size: 14px;
            max-width: 300px;
            border-left: 4px solid #e53e3e;
        `;
        warning.innerHTML = `
            <strong>⚠️ Notifications Blocked</strong><br>
            You may miss important meeting reminders and calls. You can enable them anytime in your browser settings.
        `;
        
        document.body.appendChild(warning);
        
        setTimeout(() => {
            if (warning.parentNode) {
                warning.style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => warning.remove(), 300);
            }
        }, 8000);
    }

    trackEvent(eventName, data = {}) {
        // Send analytics event
        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, data);
        }
        
        // Send to backend analytics if available
        if (window.TalkTimeAnalytics) {
            window.TalkTimeAnalytics.track(eventName, data);
        }
        
        console.log(`📊 Analytics: ${eventName}`, data);
    }

    // Static method to show modal globally
    static show(options = {}) {
        return new NotificationPermissionModal(options).show();
    }

    // Check if permission is needed
    static isPermissionNeeded() {
        if (!('Notification' in window)) return false;
        return Notification.permission === 'default';
    }

    // Get current permission status
    static getPermissionStatus() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    }
}

// Make it globally available
window.NotificationPermissionModal = NotificationPermissionModal;

// Auto-initialize on DOM ready for immediate use
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🔔 Notification Permission Modal loaded and ready');
    });
} else {
    console.log('🔔 Notification Permission Modal loaded and ready');
}

// Make NotificationPermissionModal available globally inside the declaration block
window.NotificationPermissionModal = NotificationPermissionModal;

} else {
    console.log('🔄 NotificationPermissionModal already declared');
}
