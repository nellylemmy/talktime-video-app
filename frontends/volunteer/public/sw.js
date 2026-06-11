/**
 * TalkTime Volunteer app-shell service worker.
 * Scope: /volunteer/ (push notifications are handled separately by /notification-sw.js).
 *
 * Strategy:
 *  - Navigations (HTML): network-first, offline.html fallback.
 *  - Static shell assets (fonts, vendor JS, brand CSS, icons): cache-first with background refresh.
 *  - NEVER touches /api/, /socket.io/, /call-socket.io/, or non-GET requests.
 */
const CACHE_VERSION = 'talktime-volunteer-v2';
const OFFLINE_URL = '/volunteer/offline.html';

const PRECACHE = [
    OFFLINE_URL,
    '/volunteer/manifest.json',
    '/volunteer/icons/icon-192.png',
    '/shared/css/brand-theme.css',
    '/shared/css/tailwind.min.css',
    '/shared/fonts/google/fonts.css',
    '/shared/fonts/fontawesome/all.min.css',
    '/shared/js/vendor/socket.io.min.js?v=2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/socket.io/') ||
        url.pathname.startsWith('/call-socket.io/') ||
        url.pathname.startsWith('/uploads/')) {
        return; // realtime/data: straight to network, no SW involvement
    }

    // Navigations: network-first with offline fallback
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).catch(() => caches.match(OFFLINE_URL))
        );
        return;
    }

    // Static assets: cache-first, refresh in background (nginx ETag keeps origin cheap)
    const isStatic = /\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?|ttf)$/.test(url.pathname);
    if (isStatic) {
        event.respondWith(
            caches.open(CACHE_VERSION).then(async (cache) => {
                const cached = await cache.match(req);
                const network = fetch(req).then((res) => {
                    if (res && res.ok) cache.put(req, res.clone());
                    return res;
                }).catch(() => cached);
                return cached || network;
            })
        );
    }
});
