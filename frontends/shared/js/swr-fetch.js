/**
 * swr-fetch.js — stale-while-revalidate data layer for TalkTime pages.
 *
 * Pattern: paint instantly from the last localStorage snapshot, then revalidate
 * with If-None-Match. 304 → nothing to do; 200 → re-render fresh + store.
 * While revalidating, the container gets `.swr-refreshing` (subtle blur +
 * shimmer sweep) so users can see the data is being updated.
 *
 * Staleness guards:
 *  - every call ALWAYS revalidates — cache is for paint, network is truth
 *  - socket events (meetings/notifications/messages) invalidate snapshots
 *  - cache keys are scoped per user; logout/login can't cross-read
 *  - kill switch: localStorage.setItem('talktime_swr_disabled', '1')
 */
(function () {
    'use strict';

    const PREFIX = 'swr:';
    const SCHEMA = 'v1';
    const MAX_SNAPSHOT_BYTES = 200 * 1024; // don't hoard megabyte payloads

    function disabled() {
        try { return localStorage.getItem('talktime_swr_disabled') === '1'; } catch (e) { return true; }
    }

    function currentUserId() {
        try {
            const raw = localStorage.getItem('volunteer_talktime_user');
            if (raw) { const u = JSON.parse(raw); return u && (u.id || u.userId) || 'anon'; }
        } catch (e) { /* fall through */ }
        return 'anon';
    }

    function storageKey(key) {
        return PREFIX + SCHEMA + ':' + currentUserId() + ':' + key;
    }

    function readSnapshot(key) {
        try {
            const raw = localStorage.getItem(storageKey(key));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) return null;
            return parsed;
        } catch (e) { return null; }
    }

    function writeSnapshot(key, etag, data) {
        try {
            const payload = JSON.stringify({ etag: etag || null, data: data, ts: Date.now() });
            if (payload.length > MAX_SNAPSHOT_BYTES) return;
            localStorage.setItem(storageKey(key), payload);
        } catch (e) {
            // Quota exceeded → drop all swr snapshots and carry on uncached
            try {
                Object.keys(localStorage)
                    .filter(k => k.indexOf(PREFIX) === 0)
                    .forEach(k => localStorage.removeItem(k));
            } catch (e2) { /* give up silently */ }
        }
    }

    function invalidate(keyOrPrefix) {
        try {
            const target = storageKey(keyOrPrefix);
            Object.keys(localStorage)
                .filter(k => k.indexOf(target) === 0)
                .forEach(k => localStorage.removeItem(k));
        } catch (e) { /* ignore */ }
    }

    function resolveEl(container) {
        if (!container) return null;
        return typeof container === 'string' ? document.querySelector(container) : container;
    }

    function setRefreshing(el, on) {
        if (!el) return;
        el.classList.toggle('swr-refreshing', !!on);
    }

    /**
     * swrFetch({ key, url, container, render })
     *  key       cache key, stable per dataset (e.g. 'my-students')
     *  url       GET endpoint
     *  container element/selector blurred+shimmered during revalidation
     *  render    function(data, meta) — meta.fromCache true on the instant paint
     * Returns a promise of the freshest data (resolves after revalidation).
     */
    window.swrFetch = async function ({ key, url, container, render }) {
        const el = resolveEl(container);
        const auth = window.TalkTimeAuth;
        const off = disabled() || !auth || !auth.isAuthenticated || !auth.isAuthenticated();

        let snapshot = off ? null : readSnapshot(key);
        if (snapshot) {
            try { render(snapshot.data, { fromCache: true }); } catch (e) { console.error('[swr] cached render failed:', e); snapshot = null; }
            setRefreshing(el, true);
        }

        try {
            const headers = {};
            if (snapshot && snapshot.etag) headers['If-None-Match'] = snapshot.etag;
            const response = await auth.authenticatedRequest(url, { method: 'GET', headers });

            if (response.status === 304 && snapshot) {
                return snapshot.data; // unchanged — instant paint was already correct
            }
            if (!response.ok) throw new Error('HTTP ' + response.status);

            const data = await response.json();
            if (!off) writeSnapshot(key, response.headers.get('ETag'), data);
            render(data, { fromCache: false });
            return data;
        } catch (err) {
            if (snapshot) {
                // Network failed but the user already has the snapshot on screen.
                console.warn('[swr] revalidation failed, showing last snapshot:', err.message);
                return snapshot.data;
            }
            throw err; // no snapshot — page's own error handling takes over
        } finally {
            setRefreshing(el, false);
        }
    };

    window.swrInvalidate = invalidate;

    // --- Realtime staleness guard -------------------------------------------
    // Any pushed change wipes the related snapshots, so a cached paint can
    // never outlive a known change. Next page paint refetches in full.
    function armSocketInvalidation() {
        const s = window.socket;
        if (!s || typeof s.on !== 'function' || s.__swrArmed) return;
        s.__swrArmed = true;
        ['meeting-update', 'meeting-auto-launch', 'meeting-cancelled', 'meeting-rescheduled',
         'new-notification', 'notification', 'new-message', 'message-received',
         'incoming-enhanced-instant-call']
            .forEach(evt => s.on(evt, () => {
                invalidate('my-students');
                invalidate('dashboard-data');
                invalidate('notifications');
                invalidate('messages');
                invalidate('history');
                invalidate('upcoming');
            }));
    }
    armSocketInvalidation();
    document.addEventListener('DOMContentLoaded', armSocketInvalidation);
    setTimeout(armSocketInvalidation, 3000); // socket connects async on most pages

    // --- Shimmer style (self-contained so no shared-CSS version bump) -------
    const style = document.createElement('style');
    style.textContent =
        '.swr-refreshing{position:relative;filter:blur(1.2px) saturate(.92);transition:filter .2s ease;pointer-events:none;}' +
        '.swr-refreshing::after{content:"";position:absolute;inset:0;z-index:5;border-radius:inherit;' +
            'background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.55) 50%,transparent 70%);' +
            'background-size:200% 100%;animation:swrShimmer 1.1s linear infinite;}' +
        '@media (prefers-reduced-motion: reduce){.swr-refreshing::after{animation:none;}}' +
        '@keyframes swrShimmer{from{background-position:200% 0}to{background-position:-200% 0}}';
    (document.head || document.documentElement).appendChild(style);
})();
