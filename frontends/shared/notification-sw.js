// Service Worker for Push Notifications
// TalkTime Notification Service Worker - Docker Compatible

console.log('🔧 TalkTime Notification Service Worker loaded');

// Listen for push events
self.addEventListener('push', function(event) {
    console.log('📱 Push notification received:', event);
    
    let notificationData = {
        title: 'TalkTime Notification',
        body: 'You have a new message',
        icon: '/images/default-profile.jpg',
        badge: '/images/default-profile.jpg',
        data: {}
    };
    
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || notificationData.body,
                icon: data.icon || notificationData.icon,
                badge: data.badge || notificationData.badge,
                data: data.data || {}
            };
        } catch (e) {
            console.error('❌ Error parsing push data:', e);
            notificationData.body = event.data.text();
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            data: notificationData.data,
            requireInteraction: true,
            actions: [
                {
                    action: 'view',
                    title: 'View'
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss'
                }
            ]
        })
    );
});

// Listen for notification clicks
self.addEventListener('notificationclick', function(event) {
    console.log('🖱️ Notification clicked:', event);
    
    event.notification.close();
    
    if (event.action === 'view' || !event.action) {
        // Handle notification click - open the app
        event.waitUntil(
            clients.matchAll().then(function(clientList) {
                // If there's already a window open, focus it
                for (let client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // Otherwise, open a new window
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
        );
    }
});

// Listen for notification close
self.addEventListener('notificationclose', function(event) {
    console.log('❌ Notification closed:', event);
    
    // Track notification close if needed
    // Could send analytics data here
});

// Handle service worker installation
self.addEventListener('install', function(event) {
    console.log('🔧 Service Worker installing...');
    self.skipWaiting();
});

// Handle service worker activation
self.addEventListener('activate', function(event) {
    console.log('✅ Service Worker activated');
    event.waitUntil(self.clients.claim());
});
