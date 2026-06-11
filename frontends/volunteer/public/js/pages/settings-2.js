/**
 * TalkTime Settings page (redesigned).
 * Every control auto-saves and is verified to work end-to-end:
 *  - Display size: documentElement zoom, stored in talktime_zoom_level and
 *    applied globally by brand-config.js on every page; synced to the server.
 *  - Time zone: saved to volunteer_settings.primary_timezone AND users.timezone
 *    (the value scheduling actually reads).
 *  - Notifications: push permission status/enable, browser-notification toggles
 *    (saved server-side), sound toggle (shared sound-manager preference).
 */
(function () {
    'use strict';

    const SAVE_DEBOUNCE_MS = 600;
    let saveTimer = null;
    let pendingPayload = {};

    function showSaved(message) {
        const pill = document.getElementById('save-pill');
        if (!pill) return;
        pill.textContent = message || 'Saved';
        pill.classList.add('show');
        clearTimeout(showSaved._t);
        showSaved._t = setTimeout(() => pill.classList.remove('show'), 1600);
    }

    function queueSave(fields) {
        Object.assign(pendingPayload, fields);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    }

    async function flushSave() {
        const payload = pendingPayload;
        pendingPayload = {};
        if (!Object.keys(payload).length) return;
        try {
            const res = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/settings', {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showSaved('Saved');
            } else {
                showSaved('Could not save - try again');
            }
        } catch (e) {
            console.error('Settings save failed:', e);
            showSaved('Could not save - check connection');
        }
    }

    /* ---------- Display size ---------- */
    function applyZoom(level) {
        try {
            document.documentElement.style.zoom = level === 100 ? '' : level + '%';
            localStorage.setItem('talktime_zoom_level', String(level));
        } catch (e) { /* storage blocked */ }
    }

    function initZoom(savedLevel) {
        const control = document.getElementById('zoom-control');
        if (!control) return;
        const buttons = control.querySelectorAll('button[data-zoom]');

        function select(level, save) {
            buttons.forEach(b => b.classList.toggle('selected', parseInt(b.dataset.zoom, 10) === level));
            applyZoom(level);
            if (save) queueSave({ zoom_level: level });
        }

        buttons.forEach(b => {
            b.addEventListener('click', () => select(parseInt(b.dataset.zoom, 10), true));
        });

        const initial = [75, 100, 125, 150].includes(savedLevel) ? savedLevel : 100;
        select(initial, false);
    }

    /* ---------- Time zone ---------- */
    const CURATED_TZ = [
        'Africa/Nairobi', 'Africa/Lagos', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Accra',
        'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
        'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo', 'America/Bogota',
        'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
        'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Athens', 'Europe/Istanbul',
        'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok',
        'Asia/Singapore', 'Asia/Manila', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
        'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland'
    ];

    function tzLabel(tz) {
        let offset = '';
        try {
            const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
            const p = parts.find(x => x.type === 'timeZoneName');
            if (p) offset = ' (' + p.value + ')';
        } catch (e) { /* older browser */ }
        return tz.replace(/_/g, ' ') + offset;
    }

    let clockTimer = null;
    function startClock(tz) {
        const el = document.getElementById('tz-now');
        if (!el) return;
        clearInterval(clockTimer);
        const tick = () => {
            try {
                el.textContent = 'Right now: ' + new Date().toLocaleTimeString([], {
                    timeZone: tz, hour: '2-digit', minute: '2-digit'
                });
            } catch (e) { el.textContent = ''; }
        };
        tick();
        clockTimer = setInterval(tick, 30000);
    }

    function initTimezone(savedTz) {
        const select = document.getElementById('primary-timezone');
        const detectBtn = document.getElementById('detect-timezone-btn');
        if (!select) return;

        let zones = CURATED_TZ;
        try {
            if (typeof Intl.supportedValuesOf === 'function') {
                zones = Intl.supportedValuesOf('timeZone');
            }
        } catch (e) { /* fall back to curated */ }

        const current = savedTz || (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Africa/Nairobi';
        if (!zones.includes(current)) zones = [current].concat(zones);

        select.innerHTML = '';
        zones.forEach(tz => {
            const opt = document.createElement('option');
            opt.value = tz;
            opt.textContent = tzLabel(tz);
            if (tz === current) opt.selected = true;
            select.appendChild(opt);
        });
        startClock(current);

        select.addEventListener('change', () => {
            queueSave({ primary_timezone: select.value });
            startClock(select.value);
        });

        if (detectBtn) {
            detectBtn.addEventListener('click', () => {
                let detected = null;
                try { detected = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* ignore */ }
                if (!detected) {
                    showSaved('Could not detect your time zone');
                    return;
                }
                if (!Array.from(select.options).some(o => o.value === detected)) {
                    const opt = document.createElement('option');
                    opt.value = detected;
                    opt.textContent = tzLabel(detected);
                    select.insertBefore(opt, select.firstChild);
                }
                select.value = detected;
                queueSave({ primary_timezone: detected });
                startClock(detected);
            });
        }
    }

    /* ---------- Notifications ---------- */
    function initPush() {
        const statusText = document.getElementById('push-status-text');
        const enableBtn = document.getElementById('enable-push-btn');
        const setStatus = (msg) => { if (statusText) statusText.textContent = msg; };

        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            setStatus('Not supported in this browser');
            return;
        }

        const reflect = (permission) => {
            if (permission === 'granted') {
                setStatus('On - you get alerts even when TalkTime is closed');
                if (enableBtn) enableBtn.classList.add('hidden');
            } else if (permission === 'denied') {
                setStatus('Blocked by your browser - tap the lock icon next to the address bar to allow notifications');
                if (enableBtn) enableBtn.classList.add('hidden');
            } else {
                setStatus('Off');
                if (enableBtn) enableBtn.classList.remove('hidden');
            }
        };
        reflect(Notification.permission);

        if (enableBtn) {
            enableBtn.addEventListener('click', async () => {
                try {
                    const permission = await Notification.requestPermission();
                    reflect(permission);
                    if (permission === 'granted') {
                        if (window.talktimeNotificationEnforcer &&
                            typeof window.talktimeNotificationEnforcer.onPermissionGranted === 'function') {
                            window.talktimeNotificationEnforcer.onPermissionGranted();
                        }
                        showSaved('Notifications on');
                    }
                } catch (e) {
                    console.error('Push permission request failed:', e);
                }
            });
        }
    }

    function initBrowserToggles(saved) {
        document.querySelectorAll('.browser-notification').forEach(box => {
            const type = box.dataset.type;
            if (saved && typeof saved === 'object' && type in saved) {
                box.checked = saved[type] !== false;
            }
            box.addEventListener('change', () => {
                const prefs = {};
                document.querySelectorAll('.browser-notification').forEach(b => {
                    prefs[b.dataset.type] = b.checked;
                });
                queueSave({ browser_notifications: prefs });
            });
        });
    }

    function initSoundToggle() {
        const toggle = document.getElementById('notification-sound-toggle');
        if (!toggle) return;
        const KEY = 'talktime_notification_sound_preferences';
        let prefs = {};
        try { prefs = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { prefs = {}; }
        toggle.checked = prefs.enabled !== false;
        toggle.addEventListener('change', () => {
            prefs.enabled = toggle.checked;
            prefs.lastUpdated = new Date().toISOString();
            try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
            if (window.talkTimeSoundManager) {
                window.talkTimeSoundManager.enabled = toggle.checked;
            }
            showSaved(toggle.checked ? 'Sound on' : 'Sound off');
        });
    }

    /* ---------- Boot ---------- */
    async function loadServerSettings() {
        try {
            const res = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/settings', { method: 'GET' });
            if (!res.ok) return {};
            const data = await res.json();
            return (data && data.settings) || {};
        } catch (e) {
            console.warn('Could not load settings from server:', e);
            return {};
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        document.body.classList.add('page-ready');

        if (!window.TalkTimeAuth && typeof TalkTimeJWTAuth !== 'undefined') {
            window.TalkTimeAuth = new TalkTimeJWTAuth('volunteer');
        }

        const settings = await loadServerSettings();

        // Server zoom wins over any stale local value (cross-device sync)
        let zoom = parseInt(settings.zoom_level, 10);
        if (!zoom) {
            try { zoom = parseInt(localStorage.getItem('talktime_zoom_level') || '100', 10); } catch (e) { zoom = 100; }
        }
        initZoom(zoom || 100);
        initTimezone(settings.primary_timezone);
        initPush();
        initBrowserToggles(settings.browser_notifications);
        initSoundToggle();

        // Flush any pending change if the user navigates away quickly
        window.addEventListener('pagehide', () => {
            clearTimeout(saveTimer);
            flushSave();
        });
    });
})();
