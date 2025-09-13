// Force Chrome notification re-registration
async function forceNotificationSetup() {
    console.log('🔄 Force re-registering notifications...');
    
    try {
        // Step 1: Check current permission
        console.log('1️⃣ Current permission:', Notification.permission);
        
        // Step 2: Try to get a fresh permission (even if already granted)
        console.log('2️⃣ Requesting fresh permission...');
        const permission = await Notification.requestPermission();
        console.log('📋 Fresh permission result:', permission);
        
        if (permission !== 'granted') {
            console.error('❌ Permission not granted');
            return;
        }
        
        // Step 3: Create a more aggressive notification
        console.log('3️⃣ Creating system-style notification...');
        
        const notification = new Notification('🚨 TalkTime System Alert', {
            body: 'URGENT: This is a test of the emergency notification system. You should see this popup!',
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/><text x="50" y="55" text-anchor="middle" fill="white" font-size="20">!</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>',
            tag: 'urgent-test',
            requireInteraction: true,  // Forces user to click it
            silent: false,
            vibrate: [500, 200, 500, 200, 500],
            timestamp: Date.now(),
            renotify: true,
            actions: [
                {
                    action: 'confirm',
                    title: 'I See It!',
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="55" text-anchor="middle" fill="green" font-size="30">✓</text></svg>'
                }
            ]
        });
        
        // Step 4: Handle events
        notification.onshow = function() {
            console.log('✅ URGENT notification shown!');
            console.log('🎯 If you still don\'t see it, the issue is macOS system settings');
        };
        
        notification.onclick = function() {
            console.log('🎉 SUCCESS! You clicked the notification!');
            notification.close();
        };
        
        notification.onerror = function(error) {
            console.error('💥 Notification error:', error);
        };
        
        // Step 5: Also try to register service worker push
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            console.log('4️⃣ Registering service worker for push notifications...');
            
            try {
                const registration = await navigator.serviceWorker.register('/notification-sw.js');
                console.log('✅ Service worker registered');
                
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: await fetch('/api/v1/push-notifications/vapid-public-key')
                        .then(response => response.json())
                        .then(data => data.publicKey)
                });
                
                console.log('✅ Push subscription created');
                
                // Send subscription to server
                await fetch('/api/v1/push-notifications/subscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(subscription)
                });
                
                console.log('✅ Subscription sent to server');
                
            } catch (swError) {
                console.warn('⚠️ Service worker registration failed:', swError);
            }
        }
        
        // Step 6: Auto-close after 10 seconds
        setTimeout(() => {
            if (notification) {
                notification.close();
                console.log('⏰ Urgent notification auto-closed');
            }
        }, 10000);
        
        return notification;
        
    } catch (error) {
        console.error('❌ Force setup failed:', error);
    }
}

// Run the force setup
forceNotificationSetup();
