// Complete Push Notification Setup and Test
// Run this in browser console on localhost/volunteer/dashboard

async function setupAndTestPushNotifications() {
    console.log('🚀 Setting up push notifications...');
    
    try {
        // Step 1: Check support
        if (!('Notification' in window)) {
            console.error('❌ Notifications not supported');
            return;
        }
        
        if (!('serviceWorker' in navigator)) {
            console.error('❌ Service Worker not supported');
            return;
        }
        
        // Step 2: Request permission
        let permission = Notification.permission;
        if (permission !== 'granted') {
            console.log('📋 Requesting notification permission...');
            permission = await Notification.requestPermission();
        }
        
        if (permission !== 'granted') {
            console.error('❌ Notification permission denied');
            return;
        }
        console.log('✅ Notification permission granted');
        
        // Step 3: Register service worker
        console.log('📝 Registering service worker...');
        let registration;
        try {
            registration = await navigator.serviceWorker.register('/notification-sw.js');
            console.log('✅ Service worker registered');
        } catch (swError) {
            console.error('❌ Service worker registration failed:', swError);
            return;
        }
        
        // Step 4: Get VAPID public key
        console.log('🔑 Getting VAPID public key...');
        const vapidResponse = await fetch('/api/v1/push-notifications/vapid-public-key');
        if (!vapidResponse.ok) {
            console.error('❌ Failed to get VAPID key');
            return;
        }
        const { publicKey } = await vapidResponse.json();
        console.log('✅ VAPID key received:', publicKey.substring(0, 20) + '...');
        
        // Step 5: Subscribe to push notifications
        console.log('📡 Subscribing to push notifications...');
        await navigator.serviceWorker.ready;
        
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
        console.log('✅ Push subscription created');
        
        // Step 6: Send subscription to server
        console.log('💾 Saving subscription to server...');
        const subscribeResponse = await fetch('/api/v1/push-notifications/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subscription: subscription.toJSON(),
                userId: getCurrentUserId(), // We'll need to get this
                userRole: 'volunteer' // Assuming volunteer for now
            })
        });
        
        if (subscribeResponse.ok) {
            console.log('✅ Subscription saved to server');
        } else {
            console.error('❌ Failed to save subscription');
            return;
        }
        
        // Step 7: Test notification
        console.log('🧪 Testing push notification...');
        const testResponse = await fetch('/api/v1/push-notifications/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: getCurrentUserId(),
                title: '🎉 Push Notification Test',
                body: 'This is a test push notification from TalkTime!',
                data: {
                    test: true,
                    timestamp: new Date().toISOString()
                }
            })
        });
        
        if (testResponse.ok) {
            console.log('✅ Test notification sent! Check your system notifications.');
        } else {
            console.error('❌ Failed to send test notification');
        }
        
    } catch (error) {
        console.error('❌ Setup failed:', error);
    }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Helper to get current user ID (you may need to adapt this)
function getCurrentUserId() {
    // Try to get from localStorage, sessionStorage, or JWT
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.id || payload.userId;
        } catch (e) {
            console.log('Could not parse token');
        }
    }
    
    // Fallback - you can replace this with the actual user ID
    return 54; // maina john's user ID based on logs
}

// Auto-run setup
console.log('🔔 Starting push notification setup...');
setupAndTestPushNotifications();
