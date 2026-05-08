/**
 * Universal Notification Permission Modal
 * Shows a modal to request notification permission from all users
 * Must be allowed before accessing any part of the application
 *
 * Three modes:
 *   - REQUEST mode (permission === 'default'): Button triggers browser prompt
 *   - INSTRUCTIONS mode (permission === 'denied'): Browser-specific guide + "Check Again"
 *   - PRIVATE mode (incognito detected): Explains notifications don't work in private browsing
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
        this.permissionWatcher = null;
        this.init();
    }

    init() {
        this.checkNotificationSupport();
        this.checkCurrentPermission();
        this.browserInfo = this.detectBrowser();
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

    /**
     * Detect browser and OS for targeted instructions
     */
    detectBrowser() {
        const ua = navigator.userAgent;
        const isIOS = /iPhone|iPad|iPod/.test(ua);
        const isAndroid = /Android/.test(ua);
        const isMac = /Macintosh/.test(ua);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

        // Safari (not Chrome/CriOS/FxiOS on iOS)
        if (/Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua) && !/FxiOS/.test(ua)) {
            return { browser: 'safari', os: isIOS ? 'ios' : 'macos', mobile: isIOS, isPWA: isStandalone };
        }
        // Edge
        if (/Edg/.test(ua)) {
            return { browser: 'edge', os: isAndroid ? 'android' : (isMac ? 'macos' : 'windows'), mobile: isAndroid, isPWA: isStandalone };
        }
        // Chrome (including CriOS on iOS)
        if (/Chrome/.test(ua) || /CriOS/.test(ua)) {
            return { browser: 'chrome', os: isIOS ? 'ios' : (isAndroid ? 'android' : (isMac ? 'macos' : 'windows')), mobile: isIOS || isAndroid, isPWA: isStandalone };
        }
        // Firefox (including FxiOS on iOS)
        if (/Firefox/.test(ua) || /FxiOS/.test(ua)) {
            return { browser: 'firefox', os: isIOS ? 'ios' : (isAndroid ? 'android' : (isMac ? 'macos' : 'windows')), mobile: isIOS || isAndroid, isPWA: isStandalone };
        }
        return { browser: 'other', os: 'other', mobile: isIOS || isAndroid, isPWA: isStandalone };
    }

    /**
     * Detect private/incognito browsing using multiple heuristics.
     * No single method is 100% reliable — browsers actively prevent detection.
     * We combine signals for high confidence across Safari, Chrome, Firefox, Edge.
     */
    async detectPrivateBrowsing() {
        // Heuristic 1: Storage quota (Chrome/Edge incognito = ~120MB vs 60GB+ normal)
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const { quota } = await navigator.storage.estimate();
                if (quota && quota < 200 * 1024 * 1024) {
                    console.log('[TalkTime] Private browsing detected via storage quota:', quota);
                    return true;
                }
            } catch (e) { /* ignore */ }
        }

        // Heuristic 2: localStorage write test (older Safari private throws)
        try {
            const key = '__tt_private_check__';
            localStorage.setItem(key, '1');
            localStorage.removeItem(key);
        } catch (e) {
            console.log('[TalkTime] Private browsing detected via localStorage restriction');
            return true;
        }

        // Heuristic 3: IndexedDB test (Firefox private throws InvalidStateError,
        // Safari private may also restrict)
        try {
            await new Promise((resolve, reject) => {
                const request = indexedDB.open('__tt_private_check__');
                request.onerror = function() { reject(); };
                request.onsuccess = function() {
                    request.result.close();
                    indexedDB.deleteDatabase('__tt_private_check__');
                    resolve();
                };
                // Timeout after 200ms — if it hangs, likely restricted
                setTimeout(resolve, 200);
            });
        } catch (e) {
            console.log('[TalkTime] Private browsing detected via IndexedDB restriction');
            return true;
        }

        // Heuristic 4: Safari-specific — check if service workers are unavailable
        // (Safari private mode disables them entirely)
        if (this.browserInfo.browser === 'safari' && !('serviceWorker' in navigator)) {
            console.log('[TalkTime] Private browsing likely — no serviceWorker in Safari');
            return true;
        }

        return false;
    }

    /**
     * Get browser-specific instructions for unblocking notifications
     * Returns { title, steps[], note? }
     */
    getBrowserInstructions() {
        const { browser, os, isPWA } = this.browserInfo;

        if (browser === 'safari' && os === 'ios') {
            if (!isPWA) {
                return {
                    title: 'Safari on iPhone / iPad',
                    steps: [
                        'Open your iPhone <strong>Settings</strong> app',
                        'Scroll down and tap <strong>Safari</strong>',
                        'Tap <strong>Notifications</strong>',
                        'Find <strong>TalkTime</strong> and turn on <strong>Allow Notifications</strong>'
                    ],
                    note: 'If TalkTime is not listed, you may need to add it to your Home Screen first. Tap the <strong>Share</strong> icon (square with arrow) in Safari, then tap <strong>Add to Home Screen</strong>.'
                };
            }
            return {
                title: 'Safari on iPhone / iPad',
                steps: [
                    'Open your iPhone <strong>Settings</strong> app',
                    'Scroll down and tap <strong>Safari</strong>',
                    'Tap <strong>Notifications</strong>',
                    'Find <strong>TalkTime</strong> and turn on <strong>Allow Notifications</strong>'
                ]
            };
        }

        if (browser === 'safari' && os === 'macos') {
            return {
                title: 'Safari on Mac',
                steps: [
                    'Click <strong>Safari</strong> in the top menu bar',
                    'Click <strong>Settings...</strong> (or Preferences)',
                    'Click the <strong>Websites</strong> tab at the top',
                    'Click <strong>Notifications</strong> in the left sidebar',
                    'Find this website and change it to <strong>Allow</strong>'
                ]
            };
        }

        if (browser === 'chrome' && os === 'android') {
            return {
                title: 'Chrome on Android',
                steps: [
                    'Tap the <strong>three dots</strong> menu at the top right',
                    'Tap <strong>Settings</strong>',
                    'Tap <strong>Site settings</strong>',
                    'Tap <strong>Notifications</strong>',
                    'Find this website and change to <strong>Allow</strong>'
                ],
                altSteps: {
                    title: 'Or use the quick method:',
                    steps: [
                        'Tap the <strong>lock icon</strong> next to the address bar',
                        'Tap <strong>Permissions</strong>',
                        'Turn on <strong>Notifications</strong>'
                    ]
                }
            };
        }

        if (browser === 'chrome') {
            return {
                title: 'Chrome',
                steps: [
                    'Click the <strong>icon</strong> to the left of the address bar (lock or tune icon)',
                    'Click <strong>Site settings</strong>',
                    'Find <strong>Notifications</strong> and change to <strong>Allow</strong>'
                ]
            };
        }

        if (browser === 'firefox') {
            if (os === 'android') {
                return {
                    title: 'Firefox on Android',
                    steps: [
                        'Tap the <strong>three dots</strong> menu',
                        'Tap <strong>Settings</strong>',
                        'Tap <strong>Site permissions</strong>',
                        'Tap <strong>Notification</strong>',
                        'Find this website and tap <strong>Allow</strong>'
                    ]
                };
            }
            return {
                title: 'Firefox',
                steps: [
                    'Click the <strong>lock icon</strong> in the address bar',
                    'Click the <strong>arrow</strong> next to Connection Secure',
                    'Click <strong>More Information</strong>',
                    'Go to the <strong>Permissions</strong> tab',
                    'Find <strong>Send Notifications</strong> and select <strong>Allow</strong>'
                ]
            };
        }

        if (browser === 'edge') {
            return {
                title: 'Microsoft Edge',
                steps: [
                    'Click the <strong>lock icon</strong> in the address bar',
                    'Click <strong>Permissions for this site</strong>',
                    'Find <strong>Notifications</strong> and change to <strong>Allow</strong>'
                ]
            };
        }

        // Fallback
        return {
            title: 'Your Browser',
            steps: [
                'Look for a <strong>lock icon</strong> or <strong>settings icon</strong> near the address bar',
                'Open <strong>Site settings</strong> or <strong>Permissions</strong>',
                'Find <strong>Notifications</strong> and change to <strong>Allow</strong>'
            ]
        };
    }

    shouldShowModal() {
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

        // Create modal container
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

        // Render based on current permission state
        if (this.permissionStatus === 'private') {
            this.modal.innerHTML = this.getPrivateContent();
        } else if (this.permissionStatus === 'denied') {
            this.modal.innerHTML = this.getDeniedContent();
        } else {
            this.modal.innerHTML = this.getRequestContent();
        }

        // Add CSS animations
        const style = document.createElement('style');
        style.id = 'notification-modal-styles';
        if (!document.getElementById('notification-modal-styles')) {
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
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes pulseGreen {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(17, 108, 0, 0.4); }
                    50% { box-shadow: 0 0 0 8px rgba(17, 108, 0, 0); }
                }
            `;
            document.head.appendChild(style);
        }

        this.backdrop.appendChild(this.modal);
    }

    /**
     * Content for the 'default' state — request permission via browser prompt
     */
    getRequestContent() {
        return `
            <div style="text-align: center;">
                <!-- Bell Icon -->
                <div style="width: 64px; height: 64px; background: #3867FF; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                </div>

                <h2 style="font-size: 22px; font-weight: 600; color: #111827; margin: 0 0 12px 0; line-height: 1.3;">
                    ${this.options.title}
                </h2>

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
    }

    /**
     * Content for the 'denied' state — browser-specific instructions to unblock
     */
    getDeniedContent() {
        const instructions = this.getBrowserInstructions();

        // Build numbered steps HTML
        const stepsHtml = instructions.steps.map((step, i) => `
            <div style="display: flex; gap: 12px; align-items: flex-start; margin: 0 0 12px 0;">
                <div style="width: 26px; height: 26px; background: #3867FF; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0; margin-top: 1px;">${i + 1}</div>
                <span style="font-size: 14px; color: #374151; line-height: 1.6;">${step}</span>
            </div>
        `).join('');

        // Build alt steps if provided (e.g. Chrome Android quick method)
        let altStepsHtml = '';
        if (instructions.altSteps) {
            const altItems = instructions.altSteps.steps.map((step, i) => `
                <div style="display: flex; gap: 12px; align-items: flex-start; margin: 0 0 10px 0;">
                    <div style="width: 22px; height: 22px; background: #e5e7eb; color: #374151; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; margin-top: 1px;">${i + 1}</div>
                    <span style="font-size: 13px; color: #6b7280; line-height: 1.5;">${step}</span>
                </div>
            `).join('');
            altStepsHtml = `
                <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid #e5e7eb;">
                    <p style="font-size: 13px; font-weight: 600; color: #6b7280; margin: 0 0 10px 0;">${instructions.altSteps.title}</p>
                    ${altItems}
                </div>
            `;
        }

        // Build note if provided (e.g. iOS PWA requirement)
        let noteHtml = '';
        if (instructions.note) {
            noteHtml = `
                <div style="background: #FFF7ED; border: 1px solid #FDBA74; border-radius: 8px; padding: 12px; margin: 16px 0 0 0; text-align: left;">
                    <div style="display: flex; gap: 8px; align-items: flex-start;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c2410c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        <span style="font-size: 12px; color: #9a3412; line-height: 1.5;">${instructions.note}</span>
                    </div>
                </div>
            `;
        }

        return `
            <div style="text-align: center;">
                <!-- Warning Bell Icon (bell with slash) -->
                <div style="width: 64px; height: 64px; background: #FEF2F2; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D10100" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        <path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path>
                        <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path>
                        <path d="M18 8a6 6 0 0 0-9.33-5"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                </div>

                <h2 style="font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 8px 0; line-height: 1.3;">
                    Notifications Are Blocked
                </h2>

                <p style="font-size: 14px; color: #6b7280; margin: 0 0 20px 0; line-height: 1.6;">
                    Your browser has blocked notifications for TalkTime. Follow the steps below to enable them so you can receive meeting reminders and call alerts.
                </p>

                <!-- Browser-specific instructions -->
                <div style="text-align: left; background: #f9fafb; border-radius: 10px; padding: 16px; margin: 0 0 20px 0;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3867FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        <h3 style="font-size: 14px; font-weight: 600; color: #374151; margin: 0;">
                            How to enable — ${instructions.title}
                        </h3>
                    </div>
                    ${stepsHtml}
                    ${altStepsHtml}
                    ${noteHtml}
                </div>

                <!-- Feedback message area (hidden by default) -->
                <div id="check-permission-feedback" style="display: none; padding: 10px 14px; border-radius: 8px; margin: 0 0 16px 0; font-size: 13px; line-height: 1.5; text-align: left;"></div>

                <!-- Action Buttons -->
                <div style="display: flex; gap: 10px; flex-direction: column;">
                    <button
                        id="check-permission-btn"
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
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                        Done — Check Again
                    </button>

                    <button
                        id="dismiss-denied-btn"
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
                        Continue Without Notifications
                    </button>
                </div>

                <!-- Privacy Note -->
                <p style="font-size: 11px; color: #9ca3af; margin: 20px 0 0 0; line-height: 1.4; display: flex; align-items: flex-start; gap: 6px; text-align: left;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 1px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <span>Notifications are only used for meeting reminders and important TalkTime updates. We never send marketing messages.</span>
                </p>
            </div>
        `;
    }

    /**
     * Content for private/incognito browsing detection
     */
    getPrivateContent() {
        const { browser } = this.browserInfo;
        const browserName = {
            safari: 'Safari Private',
            chrome: 'Chrome Incognito',
            firefox: 'Firefox Private',
            edge: 'Edge InPrivate'
        }[browser] || 'Private Browsing';

        return `
            <div style="text-align: center;">
                <!-- Incognito/Private Icon -->
                <div style="width: 64px; height: 64px; background: #374151; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                </div>

                <h2 style="font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 8px 0; line-height: 1.3;">
                    Private Window Detected
                </h2>

                <p style="font-size: 14px; color: #6b7280; margin: 0 0 20px 0; line-height: 1.6;">
                    It looks like you are using <strong>${browserName}</strong> mode. Notifications do not work in private or incognito windows — this is a browser restriction, not a TalkTime limitation.
                </p>

                <!-- Why it matters -->
                <div style="text-align: left; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px; padding: 16px; margin: 0 0 20px 0;">
                    <div style="display: flex; gap: 10px; align-items: flex-start;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D10100" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        <div style="font-size: 13px; color: #991b1b; line-height: 1.5;">
                            <strong style="display: block; margin-bottom: 4px;">Without notifications you will miss:</strong>
                            <span style="color: #7f1d1d;">Meeting reminders, instant call alerts, schedule changes, and important updates from students.</span>
                        </div>
                    </div>
                </div>

                <!-- How to fix -->
                <div style="text-align: left; background: #f9fafb; border-radius: 10px; padding: 16px; margin: 0 0 20px 0;">
                    <h3 style="font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3867FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        How to fix this
                    </h3>
                    <div style="display: flex; gap: 12px; align-items: flex-start; margin: 0 0 10px 0;">
                        <div style="width: 26px; height: 26px; background: #3867FF; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0;">1</div>
                        <span style="font-size: 14px; color: #374151; line-height: 1.6;">Copy this page's address from the address bar</span>
                    </div>
                    <div style="display: flex; gap: 12px; align-items: flex-start; margin: 0 0 10px 0;">
                        <div style="width: 26px; height: 26px; background: #3867FF; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0;">2</div>
                        <span style="font-size: 14px; color: #374151; line-height: 1.6;">Open a <strong>regular (non-private)</strong> browser window</span>
                    </div>
                    <div style="display: flex; gap: 12px; align-items: flex-start;">
                        <div style="width: 26px; height: 26px; background: #3867FF; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0;">3</div>
                        <span style="font-size: 14px; color: #374151; line-height: 1.6;">Paste the address and sign in to TalkTime there</span>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div style="display: flex; gap: 10px; flex-direction: column;">
                    <button
                        id="copy-url-btn"
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
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        Copy Page Address
                    </button>

                    <button
                        id="dismiss-private-btn"
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
                        Continue Without Notifications
                    </button>
                </div>

                <p style="font-size: 11px; color: #9ca3af; margin: 20px 0 0 0; line-height: 1.4; text-align: left;">
                    This is a browser restriction for privacy. TalkTime works best in a regular browser window where notifications can be delivered.
                </p>
            </div>
        `;
    }

    bindEvents() {
        // Request mode: "Enable Notifications" button
        const allowBtn = this.modal.querySelector('#allow-notifications-btn');
        if (allowBtn) {
            allowBtn.addEventListener('click', this.requestPermission.bind(this));
        }

        // Request mode: "Maybe Later" button
        const denyBtn = this.modal.querySelector('#deny-notifications-btn');
        if (denyBtn) {
            denyBtn.addEventListener('click', this.denyPermission.bind(this));
        }

        // Denied mode: "Check Again" button
        const checkBtn = this.modal.querySelector('#check-permission-btn');
        if (checkBtn) {
            checkBtn.addEventListener('click', this.checkPermissionAgain.bind(this));
        }

        // Denied mode: "Continue Without" button
        const dismissBtn = this.modal.querySelector('#dismiss-denied-btn');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', this.denyPermission.bind(this));
        }

        // Private mode: "Copy URL" button
        const copyBtn = this.modal.querySelector('#copy-url-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', this.copyPageUrl.bind(this));
        }

        // Private mode: "Continue Without" button
        const dismissPrivateBtn = this.modal.querySelector('#dismiss-private-btn');
        if (dismissPrivateBtn) {
            dismissPrivateBtn.addEventListener('click', this.denyPermission.bind(this));
        }

        // Prevent modal close on backdrop click if mandatory
        this.backdrop.addEventListener('click', (e) => {
            if (e.target === this.backdrop && !this.options.mandatory) {
                this.denyPermission();
            }
        });

        // Escape key handling
        this._escHandler = (e) => {
            if (e.key === 'Escape' && !this.options.mandatory) {
                this.denyPermission();
            }
        };
        document.addEventListener('keydown', this._escHandler);
    }

    /**
     * Watch for permission changes via Permissions API (Chrome, Firefox, Edge)
     * Falls back gracefully — Safari doesn't support this
     */
    watchPermissionChanges() {
        if (!('permissions' in navigator)) return;

        navigator.permissions.query({ name: 'notifications' }).then(status => {
            this.permissionWatcher = status;
            status.onchange = () => {
                console.log(`[TalkTime] Permission changed to: ${status.state}`);
                if (status.state === 'granted') {
                    this.onPermissionNowGranted();
                }
            };
        }).catch(() => {
            // Safari and some browsers don't support querying notification permission
        });
    }

    /**
     * Called when permission changes to 'granted' (auto-detected or via check)
     */
    onPermissionNowGranted() {
        // Update button to success state
        const checkBtn = this.modal.querySelector('#check-permission-btn');
        const allowBtn = this.modal.querySelector('#allow-notifications-btn');
        const targetBtn = checkBtn || allowBtn;

        if (targetBtn) {
            targetBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Notifications Enabled
            `;
            targetBtn.style.background = '#116C00';
            targetBtn.style.animation = 'pulseGreen 1s ease 2';
            targetBtn.disabled = true;
            targetBtn.onmouseover = null;
            targetBtn.onmouseout = null;
        }

        // Hide the dismiss button
        const dismissBtn = this.modal.querySelector('#dismiss-denied-btn');
        if (dismissBtn) dismissBtn.style.display = 'none';

        // Show feedback
        this.showFeedback('Notifications are now enabled. You will receive meeting reminders and call alerts.', 'success');

        // Send test notification
        setTimeout(() => this.sendTestNotification(), 500);

        // Store permission
        localStorage.setItem('talktime_notification_permission', 'granted');
        localStorage.removeItem('talktime_notification_dismissed');

        // Close and proceed
        setTimeout(() => {
            this.cleanup();
            this.closeModal();
            this.options.onAllow('granted');
        }, 2000);
    }

    /**
     * Handle "Check Again" button click (denied mode)
     */
    async checkPermissionAgain() {
        const checkBtn = this.modal.querySelector('#check-permission-btn');

        // Show checking state
        checkBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            Checking...
        `;
        checkBtn.disabled = true;
        checkBtn.style.opacity = '0.8';

        // Re-read the live permission value
        const currentPermission = Notification.permission;

        if (currentPermission === 'granted') {
            this.onPermissionNowGranted();
            return;
        }

        // Some browsers reset to 'default' when user removes the block
        if (currentPermission === 'default') {
            try {
                const result = await Notification.requestPermission();
                if (result === 'granted') {
                    this.onPermissionNowGranted();
                    return;
                }
            } catch (e) {
                // Ignore — fall through to "still blocked"
            }
        }

        // Still denied — show helpful feedback
        this.showFeedback(
            'Notifications are still blocked. Please follow the steps above and make sure to save your changes. You may need to reload the page after changing settings.',
            'error'
        );

        // Reset button
        checkBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            Try Again
        `;
        checkBtn.disabled = false;
        checkBtn.style.opacity = '1';

        this.trackEvent('notification_check_still_denied', {
            browser: this.browserInfo.browser,
            os: this.browserInfo.os
        });
    }

    /**
     * Show inline feedback message in the denied modal
     */
    showFeedback(message, type) {
        const feedback = this.modal.querySelector('#check-permission-feedback');
        if (!feedback) return;

        const isSuccess = type === 'success';
        feedback.style.display = 'flex';
        feedback.style.gap = '8px';
        feedback.style.alignItems = 'flex-start';
        feedback.style.background = isSuccess ? '#F0FDF4' : '#FEF2F2';
        feedback.style.color = isSuccess ? '#166534' : '#991b1b';
        feedback.style.border = isSuccess ? '1px solid #BBF7D0' : '1px solid #FECACA';

        const icon = isSuccess
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#991b1b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';

        feedback.innerHTML = `${icon}<span>${message}</span>`;
    }

    async requestPermission() {
        console.log('[TalkTime] Requesting notification permission...');

        try {
            const allowBtn = this.modal.querySelector('#allow-notifications-btn');
            allowBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
                Requesting...
            `;
            allowBtn.disabled = true;
            allowBtn.style.opacity = '0.8';

            const permission = await Notification.requestPermission();
            console.log(`[TalkTime] Permission result: ${permission}`);

            if (permission === 'granted') {
                this.onPermissionNowGranted();
            } else {
                // Browser denied — switch to instruction view
                allowBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                    Permission Denied
                `;
                allowBtn.style.background = '#D10100';
                allowBtn.style.opacity = '1';

                localStorage.setItem('talktime_notification_permission', permission);

                // Switch to instruction mode after a brief delay
                setTimeout(() => {
                    this.permissionStatus = 'denied';
                    this.modal.innerHTML = this.getDeniedContent();
                    this.bindEvents();
                    this.watchPermissionChanges();
                }, 1200);
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
        console.log('[TalkTime] User chose to continue without notifications');

        if (!this.options.mandatory) {
            localStorage.setItem('talktime_notification_dismissed', 'true');
            localStorage.setItem('talktime_notification_permission', 'denied');
        }

        this.cleanup();
        this.closeModal();
        this.options.onDeny('denied');
    }

    /**
     * Copy the current page URL to clipboard (for private mode users)
     */
    async copyPageUrl() {
        const copyBtn = this.modal.querySelector('#copy-url-btn');
        try {
            await navigator.clipboard.writeText(window.location.href);
            if (copyBtn) {
                copyBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    Copied to Clipboard
                `;
                copyBtn.style.background = '#116C00';
                copyBtn.onmouseover = null;
                copyBtn.onmouseout = null;
                setTimeout(() => {
                    if (copyBtn) {
                        copyBtn.innerHTML = `
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            Copy Page Address
                        `;
                        copyBtn.style.background = '#3867FF';
                    }
                }, 2000);
            }
        } catch (e) {
            // Clipboard API may fail — select the URL text as fallback
            if (copyBtn) {
                copyBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    Copy from address bar manually
                `;
                copyBtn.style.background = '#6b7280';
            }
        }
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

            setTimeout(() => notification.close(), 5000);
        }
    }

    /**
     * Clean up watchers and event listeners
     */
    cleanup() {
        if (this.permissionWatcher) {
            this.permissionWatcher.onchange = null;
            this.permissionWatcher = null;
        }
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
        }
    }

    closeModal() {
        if (this.backdrop && this.backdrop.parentNode) {
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
            console.log(`[TalkTime] Showing notification permission modal (mode: ${this.permissionStatus})`);

            // Start watching for permission changes if in denied mode
            if (this.permissionStatus === 'denied') {
                this.watchPermissionChanges();
            }

            // Run private browsing detection asynchronously
            // If detected, swap the modal content to the private mode view
            this.detectPrivateBrowsing().then(isPrivate => {
                if (isPrivate && this.backdrop && this.backdrop.parentNode) {
                    console.log('[TalkTime] Private/incognito browsing detected — switching to private mode view');
                    this.permissionStatus = 'private';
                    this.modal.innerHTML = this.getPrivateContent();
                    this.bindEvents();
                    this.trackEvent('private_browsing_detected', {
                        browser: this.browserInfo.browser,
                        os: this.browserInfo.os
                    });
                }
            }).catch(() => {
                // Detection failed — continue with normal flow
            });

            return true;
        }
        console.log('[TalkTime] Modal not needed - permission already granted or not supported');
        return false;
    }

    // Default event handlers
    defaultOnAllow(permission) {
        console.log('[TalkTime] Notification permission granted:', permission);
        this.trackEvent('notification_permission_granted', { permission });
    }

    defaultOnDeny(permission) {
        console.log('[TalkTime] Notification permission denied:', permission);
        this.trackEvent('notification_permission_denied', { permission });

        if (this.options.mandatory) {
            this.showMandatoryWarning();
        }
    }

    defaultOnClose() {
        console.log('[TalkTime] Notification permission modal closed');
    }

    showMandatoryWarning() {
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
        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, data);
        }

        if (window.TalkTimeAnalytics) {
            window.TalkTimeAnalytics.track(eventName, data);
        }

        console.log(`[TalkTime] Analytics: ${eventName}`, data);
    }

    // Static methods
    static show(options = {}) {
        return new NotificationPermissionModal(options).show();
    }

    static isPermissionNeeded() {
        if (!('Notification' in window)) return false;
        return Notification.permission !== 'granted';
    }

    static getPermissionStatus() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    }
}

// Make it globally available
window.NotificationPermissionModal = NotificationPermissionModal;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[TalkTime] Notification Permission Modal loaded and ready');
    });
} else {
    console.log('[TalkTime] Notification Permission Modal loaded and ready');
}

window.NotificationPermissionModal = NotificationPermissionModal;

} else {
    console.log('[TalkTime] NotificationPermissionModal already declared');
}
