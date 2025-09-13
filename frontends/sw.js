/**
 * Basic TalkTime Service Worker
 * Fallback service worker for basic notification functionality
 */

const CACHE_NAME = 'talktime-basic-v1';

// Install event
self.addEventListener('install', event => {
    console.log('📦 Basic TalkTime Service Worker installing...');
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', event => {
    console.log('🚀 Basic TalkTime Service Worker activated');
    event.waitUntil(self.clients.claim());
});

// Handle push messages
self.addEventListener('push', event => {
    console.log('📨 Push message received');
    
    let notificationData = {
        title: 'TalkTime Notification',
        body: 'You have a new notification',
        icon: '/favicon.ico',
        badge: '/favicon.ico'
    };
    
    if (event.data) {
        try {
            const pushData = event.data.json();
            notificationData = {
                ...notificationData,
                ...pushData
            };
        } catch (error) {
            console.error('Error parsing push data:', error);
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            tag: notificationData.tag || 'talktime-basic',
            data: notificationData.data || {}
        })
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
    console.log('🔔 Notification clicked');
    
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(clientList => {
            // Try to focus existing window
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Open new window if none exists
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

console.log('🔔 Basic TalkTime Service Worker loaded');
