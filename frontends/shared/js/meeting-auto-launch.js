/**
 * meeting-auto-launch.js — shared across all volunteer dashboard pages.
 *
 * Single source of truth for:
 *   1. triggerAutoLaunch()    — the "Meeting Time!" overlay + auto-redirect to the call.
 *   2. renderMeetingCountdown() — visual-only countdown formatter (no launching).
 *   3. MeetingAutoLauncher    — always-on engine that fires triggerAutoLaunch at the
 *                                scheduled time, regardless of which dashboard page is open.
 *
 * "Always-on" means: works while ANY volunteer dashboard tab is open. If the browser is
 * fully closed, the existing push notification still prompts a manual click — no client
 * JS can force-open a call from a closed tab.
 */
(function () {
    'use strict';

    // Inject animation keyframes once, reduced-motion aware.
    if (!document.getElementById('tt-auto-launch-styles')) {
        const style = document.createElement('style');
        style.id = 'tt-auto-launch-styles';
        style.textContent = `
            @keyframes ttAlPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
            @keyframes ttAlFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @media (prefers-reduced-motion: reduce) {
                #auto-launch-redirect-overlay,
                #auto-launch-redirect-overlay * { animation: none !important; }
            }
        `;
        document.head.appendChild(style);
    }

    // ---- Launched-once guard, persisted so navigation mid-launch never re-overlays ----
    const STORAGE_KEY = 'talktime_autolaunched';
    function loadLaunched() {
        try { return new Set(JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')); }
        catch (e) { return new Set(); }
    }
    function saveLaunched(set) {
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...set])); } catch (e) {}
    }
    const launched = loadLaunched();

    /**
     * Show overlay and auto-redirect volunteer to the call. Fires when meeting time arrives.
     */
    function triggerAutoLaunch(meetingId, roomId, studentName, studentId) {
        if (launched.has(String(meetingId))) return;
        launched.add(String(meetingId));
        saveLaunched(launched);

        console.log('🚀 AUTO-LAUNCH: Meeting time reached, starting call automatically');

        const existingOverlay = document.getElementById('auto-launch-redirect-overlay');
        if (existingOverlay) existingOverlay.remove();

        const volunteer = window.TalkTimeAuth ? window.TalkTimeAuth.getUser() : null;
        const volunteerName = volunteer ? (volunteer.fullName || volunteer.full_name || volunteer.name || 'Volunteer') : 'Volunteer';

        const callUrl = `/call/call.html?room=${roomId || meetingId}&role=volunteer&studentId=${studentId || ''}&studentName=${encodeURIComponent(studentName || 'Student')}&volunteerName=${encodeURIComponent(volunteerName)}`;

        const overlay = document.createElement('div');
        overlay.id = 'auto-launch-redirect-overlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85);
            z-index: 10000; display: flex; align-items: center; justify-content: center;
            animation: ttAlFadeIn 0.3s ease;
        `;
        overlay.innerHTML = `
            <div style="background: white; padding: 40px; border-radius: 24px; max-width: 420px; text-align: center; box-shadow: 0 25px 50px rgba(0,0,0,0.3);">
                <div style="width: 90px; height: 90px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; animation: ttAlPulse 1.5s ease-in-out infinite;">
                    <i class="fas fa-video" style="font-size: 40px; color: white;"></i>
                </div>
                <h2 style="font-size: 26px; font-weight: 700; color: #111827; margin-bottom: 12px;">Meeting Time!</h2>
                <p style="color: #6b7280; margin-bottom: 8px; font-size: 16px;">Your meeting with <strong>${studentName || 'your student'}</strong> is starting now.</p>
                <p style="color: #9ca3af; margin-bottom: 28px; font-size: 14px;">Connecting you automatically...</p>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="background: #f3f4f6; border-radius: 12px; padding: 16px;">
                        <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Joining in</div>
                        <div id="auto-launch-countdown" style="font-size: 36px; font-weight: 700; color: #10b981;">5</div>
                    </div>
                    <a href="${callUrl}" id="join-now-btn"
                       style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 16px 32px; border-radius: 12px; font-weight: 600; text-decoration: none; font-size: 16px; transition: transform 0.2s;">
                        <i class="fas fa-video" style="margin-right: 8px;"></i>Join Now
                    </a>
                    <button onclick="document.getElementById('auto-launch-redirect-overlay').remove()"
                            style="color: #6b7280; background: none; border: none; cursor: pointer; font-size: 14px; padding: 8px;">
                        Not now
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        try {
            const audio = new Audio('/sounds/notification.mp3');
            audio.volume = 0.6;
            audio.play().catch(() => {});
        } catch (e) {}

        let countdown = 5;
        const countdownEl = document.getElementById('auto-launch-countdown');
        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdownEl) countdownEl.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                window.location.href = callUrl;
            }
        }, 1000);
        overlay.dataset.countdownInterval = countdownInterval;
    }

    /**
     * Visual-only countdown. Writes "Xd Xh Xm Xs" into valueEl and toggles urgency classes
     * on the nearest [data-countdown-band] (or valueEl). Does NOT launch — display only.
     * Returns the interval id (also auto-clears once the meeting window has fully passed).
     */
    function renderMeetingCountdown(valueEl, scheduledTimeISO) {
        if (!valueEl) return null;
        const bandEl = valueEl.closest('[data-countdown-band]') || valueEl;
        const meetingTime = new Date(scheduledTimeISO).getTime();
        let intervalId = null;

        const update = () => {
            const distance = meetingTime - Date.now();
            const minutesUntil = Math.floor(distance / (1000 * 60));

            if (distance <= 0) {
                const minutesPast = Math.abs(minutesUntil);
                if (minutesPast < 30) {
                    valueEl.textContent = 'Starting now';
                    bandEl.classList.remove('urgency-soon');
                    bandEl.classList.add('urgency-now');
                } else {
                    valueEl.textContent = 'Ended';
                    bandEl.classList.remove('urgency-soon', 'urgency-now');
                    if (intervalId) clearInterval(intervalId);
                }
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            let s = '';
            if (days > 0) s += `${days}d `;
            if (hours > 0 || days > 0) s += `${hours}h `;
            s += `${minutes}m ${seconds}s`;
            valueEl.textContent = s.trim();

            bandEl.classList.remove('urgency-soon', 'urgency-now');
            if (minutesUntil <= 1) bandEl.classList.add('urgency-now');
            else if (minutesUntil <= 5) bandEl.classList.add('urgency-soon');
        };

        update();
        intervalId = setInterval(update, 1000);
        return intervalId;
    }

    /**
     * Always-on engine. Fetches upcoming meetings, arms a 1s checker, and fires
     * triggerAutoLaunch once per meeting when its scheduled time arrives.
     */
    const MeetingAutoLauncher = {
        _armed: new Map(),   // meetingId -> { id, time, roomId, name, studentId }
        _tick: null,
        _refresh: null,
        _started: false,

        async start() {
            if (this._started) return;
            if (!window.TalkTimeAuth || !window.TalkTimeAuth.isAuthenticated()) return;
            this._started = true;

            await this._load();
            this._tick = setInterval(() => this._check(), 1000);
            this._refresh = setInterval(() => this._load(), 60000);

            // Belt-and-suspenders: a new/rescheduled meeting may arrive via socket.
            // Only refresh the armed list here — do NOT launch (that event fires at T-5min).
            if (window.socket && typeof window.socket.on === 'function') {
                window.socket.on('meeting-auto-launch', () => this._load());
            }
        },

        async _load() {
            try {
                const res = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/dashboard-data?upcoming=1', { method: 'GET' });
                if (!res.ok) return;
                const data = await res.json();
                const upcoming = (data.meetings && data.meetings.upcoming) || [];
                this._armed.clear();
                upcoming.forEach(m => {
                    this._armed.set(String(m.id), {
                        id: m.id,
                        time: new Date(m.time).getTime(),
                        roomId: m.roomId || m.roomid || m.id,
                        name: m.name || 'Student',
                        studentId: m.studentId || m.studentid || ''
                    });
                });
            } catch (e) {
                console.error('[MeetingAutoLauncher] load failed:', e);
            }
        },

        _check() {
            const now = Date.now();
            this._armed.forEach(m => {
                const minutesPast = (now - m.time) / 60000;
                // Launch in the 0–2 min window after the scheduled start (mirrors prior behaviour).
                if (minutesPast >= 0 && minutesPast < 2 && !launched.has(String(m.id))) {
                    triggerAutoLaunch(m.id, m.roomId, m.name, m.studentId);
                }
            });
        }
    };

    window.triggerAutoLaunch = triggerAutoLaunch;
    window.renderMeetingCountdown = renderMeetingCountdown;
    window.MeetingAutoLauncher = MeetingAutoLauncher;

    // Auto-start once auth is ready, so any page that merely includes this script
    // gets always-on auto-launch without extra wiring. Idempotent (start() guards _started).
    function autoStart() {
        let tries = 0;
        const t = setInterval(() => {
            if (window.TalkTimeAuth && window.TalkTimeAuth.isAuthenticated()) {
                MeetingAutoLauncher.start();
                clearInterval(t);
            } else if (++tries > 40) {
                clearInterval(t);
            }
        }, 250);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoStart);
    } else {
        autoStart();
    }
})();
