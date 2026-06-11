// TalkTime Enhanced Notification Service Worker
// Handles background notifications, action buttons, and persistent notifications

const CACHE_NAME = 'talktime-notifications-v1';
const APP_NAME = 'TalkTime';

// Install event
self.addEventListener('install', event => {
    console.log('📦 TalkTime Notification Service Worker installing...');
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', event => {
    console.log('🚀 TalkTime Notification Service Worker activated');
    event.waitUntil(self.clients.claim());
});

// Handle notification click events
self.addEventListener('notificationclick', event => {
    console.log('🔔 Notification clicked:', event.notification.tag);
    
    const notification = event.notification;
    const action = event.action;
    const data = notification.data || {};
    
    notification.close();

    // Handle different notification actions
    switch (action) {
        case 'join':
            handleJoinMeeting(data);
            break;
        case 'accept':
            handleAcceptCall(data);
            break;
        case 'decline':
            handleDeclineCall(data);
            break;
        case 'view_details':
        case 'view_dashboard':
            handleViewDashboard(data);
            break;
        case 'add_calendar':
            handleAddToCalendar(data);
            break;
        case 'schedule_new':
            handleScheduleNew(data);
            break;
        case 'rate_meeting':
            handleRateMeeting(data);
            break;
        case 'schedule_next':
            handleScheduleNext(data);
            break;
        case 'remind_later':
            handleRemindLater(data);
            break;
        case 'acknowledge':
            handleAcknowledge(data);
            break;
        case 'dismiss':
            // Just close the notification (already done above)
            break;
        default:
            // Default click action - open the app
            handleDefaultClick(data);
            break;
    }
});

// Handle notification close events
self.addEventListener('notificationclose', event => {
    console.log('🔕 Notification closed:', event.notification.tag);
    
    // Track notification dismissal
    const data = event.notification.data || {};
    if (data.notification_id) {
        trackNotificationEvent(data.notification_id, 'dismissed');
    }
});

// Handle background sync for notifications
self.addEventListener('sync', event => {
    if (event.tag === 'background-notification-sync') {
        event.waitUntil(processBackgroundNotifications());
    }
});

// Handle push messages (for future Web Push API integration)
self.addEventListener('push', event => {
    console.log('📨 Push message received');
    
    if (event.data) {
        let data;
        try {
            data = event.data.json();
        } catch (e) {
            // Non-JSON payload: show a generic notification instead of crashing
            data = { title: 'TalkTime', message: event.data.text ? event.data.text() : 'You have a new notification' };
        }
        event.waitUntil(handlePushMessage(data));
    }
});

// Handle messages from main thread
self.addEventListener('message', event => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'cleanup-old-notifications':
            cleanupOldNotifications();
            break;
        case 'clear-all-notifications':
            clearAllNotifications();
            break;
        case 'show-notification':
            showNotification(data);
            break;
        default:
            console.log('Unknown message type:', type);
    }
});

// Action Handlers
async function handleJoinMeeting(data) {
    const url = data.meeting_url || '/volunteer/dashboard/upcoming.html';
    await openWindow(url);
    trackNotificationEvent(data.notification_id, 'join_meeting');
}

async function handleAcceptCall(data) {
    const url = data.call_url || `/call/${data.call_id || data.meeting_id}`;
    await openWindow(url);
    trackNotificationEvent(data.notification_id, 'accept_call');
    
    // Notify main app about call acceptance
    broadcastMessage({
        type: 'call_accepted',
        call_id: data.call_id,
        meeting_id: data.meeting_id
    });
}

async function handleDeclineCall(data) {
    trackNotificationEvent(data.notification_id, 'decline_call');
    
    // Notify main app about call decline
    broadcastMessage({
        type: 'call_declined',
        call_id: data.call_id,
        meeting_id: data.meeting_id
    });
    
    // Show feedback notification
    showNotification({
        title: 'Call Declined',
        body: 'You declined the instant call. The caller has been notified.',
        icon: '/favicon.ico',
        tag: 'call-declined-feedback',
        requireInteraction: false,
        actions: []
    });
}

async function handleViewDashboard(data) {
    const url = data.url || '/volunteer/dashboard/students.html';
    await openWindow(url);
    trackNotificationEvent(data.notification_id, 'view_dashboard');
}

async function handleAddToCalendar(data) {
    if (data.scheduled_time) {
        const startDate = new Date(data.scheduled_time);
        const endDate = new Date(startDate.getTime() + 30 * 60000); // 30 minutes
        
        const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=TalkTime Meeting&dates=${startDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z/${endDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z&details=TalkTime conversation practice session&location=Online`;
        
        await openWindow(calendarUrl);
        trackNotificationEvent(data.notification_id, 'add_calendar');
    }
}

async function handleScheduleNew(data) {
    const url = '/volunteer/dashboard/students.html';
    await openWindow(url);
    trackNotificationEvent(data.notification_id, 'schedule_new');
}

async function handleRateMeeting(data) {
    const url = `/volunteer/feedback?meeting=${data.meeting_id}`;
    await openWindow(url);
    trackNotificationEvent(data.notification_id, 'rate_meeting');
}

async function handleScheduleNext(data) {
    const url = '/volunteer/dashboard/students.html';
    await openWindow(url);
    trackNotificationEvent(data.notification_id, 'schedule_next');
}

async function handleRemindLater(data) {
    // Service workers are terminated within ~30s of idling, so a bare
    // setTimeout dies silently. Delegate the timer to an open page (pages
    // live as long as the tab); keep the SW timeout only as a fallback
    // for the rare case the SW stays alive.
    const reminder = {
        type: 'talktime-remind-later',
        delayMs: 5 * 60 * 1000,
        title: '⏰ Reminder',
        body: data && data.title ? `Reminder: ${data.title}` : 'This is your requested reminder.',
        notification_id: data && data.notification_id
    };

    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (clientList.length > 0) {
        clientList[0].postMessage(reminder);
    } else {
        // Best effort: only fires if the SW happens to survive 5 minutes
        setTimeout(() => {
            showNotification({
                title: reminder.title,
                body: reminder.body,
                icon: '/favicon.ico',
                tag: 'reminder-' + Date.now(),
                requireInteraction: false,
                actions: [
                    { action: 'acknowledge', title: '✅ Got it' },
                    { action: 'dismiss', title: '✕ Dismiss' }
                ]
            });
        }, reminder.delayMs);
    }

    trackNotificationEvent(data.notification_id, 'remind_later');
    
    // Show confirmation
    showNotification({
        title: '⏰ Reminder Set',
        body: 'You\'ll be reminded about this in 5 minutes.',
        icon: '/favicon.ico',
        tag: 'reminder-set',
        requireInteraction: false,
        actions: []
    });
}

async function handleAcknowledge(data) {
    trackNotificationEvent(data.notification_id, 'acknowledged');
    
    // Show acknowledgment feedback
    showNotification({
        title: '✅ Acknowledged',
        body: 'Thank you for acknowledging this notification.',
        icon: '/favicon.ico',
        tag: 'acknowledged-feedback',
        requireInteraction: false,
        actions: []
    });
}

async function handleDefaultClick(data) {
    const url = data.url || '/volunteer/dashboard/students.html';
    await openWindow(url);
    trackNotificationEvent(data.notification_id, 'clicked');
}

// Utility Functions
async function openWindow(url) {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    
    // Try to focus existing window with the URL
    for (const client of clients) {
        if (client.url.includes(url.split('?')[0])) {
            client.focus();
            if (url.includes('?')) {
                client.navigate(url);
            }
            return;
        }
    }
    
    // Open new window if no existing window found
    return self.clients.openWindow(url);
}

async function broadcastMessage(message) {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage(message);
    });
}

function trackNotificationEvent(notificationId, action) {
    if (!notificationId) return;
    
    // Send tracking data to server
    fetch('/api/v1/notifications/track', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            notification_id: notificationId,
            action: action,
            timestamp: new Date().toISOString(),
            source: 'service_worker'
        })
    }).catch(error => {
        console.error('Failed to track notification event:', error);
    });
}

function showNotification(data) {
    const {
        title,
        body,
        icon = '/favicon.ico',
        badge = '/favicon.ico',
        tag = 'talktime-' + Date.now(),
        requireInteraction = false,
        actions = [],
        vibrate = [200, 100, 200],
        data: notificationData = {}
    } = data;
    
    return self.registration.showNotification(title, {
        body,
        icon,
        badge,
        tag,
        requireInteraction,
        actions,
        vibrate,
        data: notificationData
    });
}

async function cleanupOldNotifications() {
    try {
        const notifications = await self.registration.getNotifications();
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        
        notifications.forEach(notification => {
            const timestamp = notification.data?.timestamp;
            if (timestamp && new Date(timestamp).getTime() < oneDayAgo) {
                notification.close();
            }
        });
        
        console.log(`🧹 Cleaned up old notifications`);
    } catch (error) {
        console.error('Error cleaning up notifications:', error);
    }
}

async function clearAllNotifications() {
    try {
        const notifications = await self.registration.getNotifications();
        notifications.forEach(notification => notification.close());
        console.log('🗑️ Cleared all notifications');
    } catch (error) {
        console.error('Error clearing notifications:', error);
    }
}

async function processBackgroundNotifications() {
    // Process any queued notifications that need to be sent
    try {
        const response = await fetch('/api/v1/notifications/pending');
        if (response.ok) {
            const notifications = await response.json();
            
            for (const notification of notifications) {
                await showNotification({
                    title: notification.title,
                    body: notification.message,
                    icon: notification.icon_url,
                    badge: notification.badge_url,
                    tag: notification.tag,
                    requireInteraction: notification.require_interaction,
                    actions: notification.actions || [],
                    data: {
                        notification_id: notification.id,
                        url: notification.action_url,
                        timestamp: notification.created_at
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error processing background notifications:', error);
    }
}

async function handlePushMessage(data) {
    // Handle Web Push API messages
    const { title, body, icon, badge, tag, actions, url } = data;
    
    await showNotification({
        title: title || 'TalkTime Notification',
        body: body || 'You have a new notification',
        icon: icon || '/favicon.ico',
        badge: badge || '/favicon.ico',
        tag: tag || 'push-' + Date.now(),
        requireInteraction: data.requireInteraction || false,
        actions: actions || [
            { action: 'view', title: '👀 View' },
            { action: 'dismiss', title: '✕ Dismiss' }
        ],
        data: {
            url: url || '/volunteer/dashboard/students.html',
            timestamp: new Date().toISOString(),
            type: 'push'
        }
    });
}

console.log('🔔 TalkTime Enhanced Notification Service Worker loaded');
