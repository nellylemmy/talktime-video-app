/**
 * TalkTime PWA bootstrap for the volunteer portal.
 *  - Registers the /volunteer/sw.js app-shell service worker
 *  - Captures beforeinstallprompt and shows a subtle, dismissible install chip
 *  - On iOS Safari (no install prompt API), shows add-to-home-screen guidance once
 */
(function () {
    'use strict';

    if (!('serviceWorker' in navigator)) return;
    if (!window.location.pathname.startsWith('/volunteer/')) return;

    navigator.serviceWorker.register('/volunteer/sw.js').catch(function (err) {
        console.warn('[TalkTime] App-shell SW registration failed:', err);
    });

    // "Remind me later": the notification SW delegates its 5-minute timer here
    // because service workers are terminated long before the timer would fire
    navigator.serviceWorker.addEventListener('message', function (event) {
        var msg = event.data;
        if (!msg || msg.type !== 'talktime-remind-later') return;
        setTimeout(function () {
            navigator.serviceWorker.ready.then(function (reg) {
                reg.showNotification(msg.title || 'Reminder', {
                    body: msg.body || 'This is your requested reminder.',
                    icon: '/volunteer/icons/icon-192.png',
                    tag: 'reminder-' + (msg.notification_id || 'later')
                });
            }).catch(function () { /* notifications unavailable */ });
        }, msg.delayMs || 5 * 60 * 1000);
    });

    var DISMISS_KEY = 'talktime_install_dismissed_until';
    function dismissedRecently() {
        try {
            return Date.now() <= parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
        } catch (e) { return true; }
    }
    function dismiss(days) {
        try {
            localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
        } catch (e) { /* ignore */ }
    }
    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    function showChip(label, onClick) {
        if (document.getElementById('talktime-install-chip')) return;
        var chip = document.createElement('div');
        chip.id = 'talktime-install-chip';
        chip.style.cssText = 'position:fixed;bottom:160px;right:16px;z-index:9000;background:#FFFFFF;border:1px solid #e5e7eb;border-radius:9999px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.15);display:flex;align-items:center;gap:8px;padding:10px 8px 10px 16px;font-family:inherit;font-size:14px;font-weight:600;color:#111827;';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.style.cssText = 'background:none;border:none;color:#D10100;font:inherit;font-weight:600;cursor:pointer;padding:0;';
        var close = document.createElement('button');
        close.type = 'button';
        close.setAttribute('aria-label', 'Dismiss');
        close.innerHTML = '&times;';
        close.style.cssText = 'background:none;border:none;color:#9ca3af;font-size:18px;line-height:1;cursor:pointer;padding:4px 8px;';
        close.addEventListener('click', function () { chip.remove(); dismiss(14); });
        btn.addEventListener('click', function () { chip.remove(); onClick(); });
        chip.appendChild(btn);
        chip.appendChild(close);
        document.body.appendChild(chip);
    }

    if (isStandalone() || dismissedRecently()) return;

    var deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        showChip('Install TalkTime', function () {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function () { deferredPrompt = null; dismiss(30); });
        });
    });

    // iOS Safari: no beforeinstallprompt; offer guidance instead
    var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    if (isIos) {
        document.addEventListener('DOMContentLoaded', function () {
            showChip('Add TalkTime to Home Screen', function () {
                dismiss(30);
                if (window.showNotification) {
                    window.showNotification('Tap the Share button in Safari, then choose "Add to Home Screen".', 'info', { title: 'Install TalkTime', autoClose: false, showCloseButton: true });
                } else {
                    // Non-blocking inline note instead of a blocking alert
                    var note = document.createElement('div');
                    note.textContent = 'Tap the Share button in Safari, then choose "Add to Home Screen".';
                    note.style.cssText = 'position:fixed;bottom:24px;left:16px;right:16px;z-index:9100;background:#111827;color:#fff;padding:14px 16px;border-radius:12px;font-size:14px;text-align:center;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);';
                    document.body.appendChild(note);
                    setTimeout(function () { note.remove(); }, 8000);
                }
            });
        });
    }
})();
