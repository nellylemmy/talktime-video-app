// Enhanced Push Notification Test for macOS Chrome
async function testPushNotificationDetailed() {
    console.log('🔔 Starting detailed push notification test for macOS Chrome...');
    
    // Step 1: Check browser support
    console.log('1️⃣ Checking browser support...');
    if (!('Notification' in window)) {
        console.error('❌ Notifications not supported in this browser');
        return;
    }
    console.log('✅ Browser supports notifications');
    
    // Step 2: Check service worker support
    console.log('2️⃣ Checking service worker support...');
    if (!('serviceWorker' in navigator)) {
        console.error('❌ Service workers not supported');
        return;
    }
    console.log('✅ Service workers supported');
    
    // Step 3: Check current permission
    console.log('3️⃣ Checking notification permission...');
    console.log('📋 Current permission status:', Notification.permission);
    
    if (Notification.permission === 'denied') {
        console.error('❌ Notifications are blocked. Please enable in Chrome settings:');
        console.log('   1. Go to Chrome Settings > Privacy and Security > Site Settings > Notifications');
        console.log('   2. Make sure this site is in "Allow" list');
        console.log('   3. Also check macOS System Preferences > Notifications > Chrome');
        return;
    }
    
    // Step 4: Request permission if needed
    if (Notification.permission === 'default') {
        console.log('4️⃣ Requesting notification permission...');
        const permission = await Notification.requestPermission();
        console.log('📋 Permission result:', permission);
        
        if (permission !== 'granted') {
            console.error('❌ Permission not granted');
            return;
        }
    }
    
    // Step 5: Test basic notification
    console.log('5️⃣ Testing basic browser notification...');
    try {
        const notification = new Notification('🎉 TalkTime Test', {
            body: 'This is a test notification from TalkTime on macOS Chrome!',
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'test-notification',
            requireInteraction: false,
            silent: false
        });
        
        notification.onclick = function() {
            console.log('✅ Notification clicked!');
            notification.close();
        };
        
        notification.onshow = function() {
            console.log('✅ Notification displayed!');
        };
        
        notification.onerror = function(error) {
            console.error('❌ Notification error:', error);
        };
        
        console.log('✅ Basic notification created');
        
        // Auto-close after 5 seconds for testing
        setTimeout(() => {
            notification.close();
            console.log('🔔 Test notification closed');
        }, 5000);
        
    } catch (error) {
        console.error('❌ Error creating notification:', error);
    }
    
    // Step 6: Check for service worker registration
    console.log('6️⃣ Checking service worker registration...');
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        console.log(`📋 Found ${registrations.length} service worker registrations`);
        
        if (registrations.length > 0) {
            registrations.forEach((registration, index) => {
                console.log(`   SW ${index + 1}: ${registration.scope}`);
            });
        } else {
            console.log('⚠️ No service workers registered - this might affect push notifications');
        }
    } catch (error) {
        console.error('❌ Error checking service workers:', error);
    }
    
    // Step 7: Test push subscription check
    console.log('7️⃣ Checking push subscription status...');
    try {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            
            if (subscription) {
                console.log('✅ Push subscription exists');
                console.log('📋 Subscription endpoint:', subscription.endpoint.substring(0, 50) + '...');
            } else {
                console.log('⚠️ No push subscription found - notifications may not work when browser is closed');
            }
        }
    } catch (error) {
        console.error('❌ Error checking push subscription:', error);
    }
    
    console.log('🏁 Test completed! If you saw a notification popup, push notifications are working.');
    console.log('📝 If no notification appeared, check:');
    console.log('   1. Chrome notification settings');
    console.log('   2. macOS System Preferences > Notifications');
    console.log('   3. Focus/Do Not Disturb mode is OFF');
}

// Auto-run enhanced test
testPushNotificationDetailed();
