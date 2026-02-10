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
            allowButtonText: options.allowButtonText || 'Enable Notifications',
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
            console.warn('[TalkTime] This browser does not support notifications');
            this.permissionStatus = 'unsupported';
            return false;
        }
        return true;
    }

    checkCurrentPermission() {
        if ('Notification' in window) {
            this.permissionStatus = Notification.permission;
            console.log(`[TalkTime] Current notification permission: ${this.permissionStatus}`);
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
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
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
            max-width: 440px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
            position: relative;
            animation: slideUp 0.3s ease-out;
            font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Modal content - no emojis, no gradients, brand colors only
        this.modal.innerHTML = `
            <div style="text-align: center;">
                <!-- TalkTime Icon -->
                <div style="width: 64px; height: 64px; background: #3867FF; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                </div>

                <!-- Title -->
                <h2 style="font-size: 22px; font-weight: 600; color: #111827; margin: 0 0 12px 0; line-height: 1.3;">
                    ${this.options.title}
                </h2>

                <!-- Message -->
                <p style="font-size: 15px; color: #6b7280; margin: 0 0 24px 0; line-height: 1.6;">
                    ${this.options.message}
                </p>

                <!-- Benefits List -->
                <div style="text-align: left; background: #f9fafb; border-radius: 10px; padding: 16px; margin: 0 0 24px 0;">
                    <h3 style="font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 12px 0;">
                        What you'll receive:
                    </h3>
                    <ul style="margin: 0; padding: 0; list-style: none; color: #4b5563; font-size: 13px; line-height: 1.5;">
                        <li style="margin: 8px 0; display: flex; align-items: center; gap: 10px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3867FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            Meeting reminders before each session
                        </li>
                        <li style="margin: 8px 0; display: flex; align-items: center; gap: 10px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3867FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                            Instant call notifications
                        </li>
                        <li style="margin: 8px 0; display: flex; align-items: center; gap: 10px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3867FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            Schedule changes and confirmations
                        </li>
                        <li style="margin: 8px 0; display: flex; align-items: center; gap: 10px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3867FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                            Important system updates
                        </li>
                    </ul>
                </div>

                <!-- Action Buttons -->
                <div style="display: flex; gap: 10px; flex-direction: column;">
                    <button
                        id="allow-notifications-btn"
                        style="
                            background: #3867FF;
                            color: white;
                            border: none;
                            border-radius: 10px;
                            padding: 14px 20px;
                            font-size: 15px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.2s ease;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                        "
                        onmouseover="this.style.background='#2d55d4'"
                        onmouseout="this.style.background='#3867FF'"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                        ${this.options.allowButtonText}
                    </button>

                    ${!this.options.mandatory ? `
                    <button
                        id="deny-notifications-btn"
                        style="
                            background: transparent;
                            color: #6b7280;
                            border: 1px solid #e5e7eb;
                            border-radius: 10px;
                            padding: 12px 20px;
                            font-size: 14px;
                            font-weight: 500;
                            cursor: pointer;
                            transition: all 0.2s ease;
                        "
                        onmouseover="this.style.borderColor='#d1d5db'; this.style.color='#4b5563'"
                        onmouseout="this.style.borderColor='#e5e7eb'; this.style.color='#6b7280'"
                    >
                        ${this.options.denyButtonText}
                    </button>
                    ` : ''}
                </div>

                <!-- Privacy Note -->
                <p style="font-size: 11px; color: #9ca3af; margin: 20px 0 0 0; line-height: 1.4; display: flex; align-items: flex-start; gap: 6px; text-align: left;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 1px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <span>We respect your privacy. Notifications are only sent for important TalkTime updates. You can change this anytime in settings.</span>
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
                from { transform: translateY(30px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }

            @keyframes slideDown {
                from { transform: translateY(0); opacity: 1; }
                to { transform: translateY(30px); opacity: 0; }
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
        console.log('[TalkTime] Requesting notification permission...');

        try {
            // Update button state
            const allowBtn = this.modal.querySelector('#allow-notifications-btn');
            allowBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
                Requesting...
            `;
            allowBtn.disabled = true;
            allowBtn.style.opacity = '0.8';

            // Add spin animation
            const spinStyle = document.createElement('style');
            spinStyle.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
            document.head.appendChild(spinStyle);

            const permission = await Notification.requestPermission();
            console.log(`[TalkTime] Permission result: ${permission}`);

            if (permission === 'granted') {
                // Show success state
                allowBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    Notifications Enabled
                `;
                allowBtn.style.background = '#116C00';
                allowBtn.style.opacity = '1';

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
                }, 1500);

            } else {
                // Permission denied
                allowBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                    Permission Denied
                `;
                allowBtn.style.background = '#D10100';
                allowBtn.style.opacity = '1';

                localStorage.setItem('talktime_notification_permission', permission);

                setTimeout(() => {
                    this.closeModal();
                    this.options.onDeny(permission);
                }, 1500);
            }

        } catch (error) {
            console.error('[TalkTime] Error requesting notification permission:', error);
            const allowBtn = this.modal.querySelector('#allow-notifications-btn');
            allowBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                Error Occurred
            `;
            allowBtn.style.background = '#D10100';

            setTimeout(() => {
                this.closeModal();
                this.options.onDeny('error');
            }, 1500);
        }
    }

    denyPermission() {
        console.log('[TalkTime] User denied notification permission');

        if (!this.options.mandatory) {
            localStorage.setItem('talktime_notification_dismissed', 'true');
            localStorage.setItem('talktime_notification_permission', 'denied');
        }

        this.closeModal();
        this.options.onDeny('denied');
    }

    sendTestNotification() {
        if (Notification.permission === 'granted') {
            const notification = new Notification('TalkTime Notifications Enabled', {
                body: 'You will now receive meeting reminders, call notifications, and important updates.',
                icon: '/talktime.ico',
                badge: '/talktime.ico',
                tag: 'talktime-welcome',
                requireInteraction: false
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
            console.log('[TalkTime] Showing notification permission modal');
            return true;
        }
        console.log('[TalkTime] Modal not needed - permission already granted or not supported');
        return false;
    }

    // Default event handlers
    defaultOnAllow(permission) {
        console.log('[TalkTime] Notification permission granted:', permission);
        // Track analytics
        this.trackEvent('notification_permission_granted', { permission });
    }

    defaultOnDeny(permission) {
        console.log('[TalkTime] Notification permission denied:', permission);
        // Track analytics
        this.trackEvent('notification_permission_denied', { permission });

        // If mandatory, show warning
        if (this.options.mandatory) {
            this.showMandatoryWarning();
        }
    }

    defaultOnClose() {
        console.log('[TalkTime] Notification permission modal closed');
    }

    showMandatoryWarning() {
        // Show a subtle warning that notifications are recommended
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #fef2f2;
            color: #991b1b;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            font-size: 13px;
            max-width: 300px;
            border-left: 3px solid #D10100;
            display: flex;
            gap: 10px;
            align-items: flex-start;
            font-family: 'Poppins', sans-serif;
        `;
        warning.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D10100" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <div>
                <strong style="display: block; margin-bottom: 2px;">Notifications Blocked</strong>
                <span style="color: #7f1d1d;">You may miss important meeting reminders and calls. Enable them in your browser settings.</span>
            </div>
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

        console.log(`[TalkTime] Analytics: ${eventName}`, data);
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
        console.log('[TalkTime] Notification Permission Modal loaded and ready');
    });
} else {
    console.log('[TalkTime] Notification Permission Modal loaded and ready');
}

// Make NotificationPermissionModal available globally inside the declaration block
window.NotificationPermissionModal = NotificationPermissionModal;

} else {
    console.log('[TalkTime] NotificationPermissionModal already declared');
}
