// Enhanced notification test with event tracking
function testNotificationWithEvents() {
    console.log('🔔 Testing notification with event handlers...');
    
    if (Notification.permission !== 'granted') {
        console.log('❌ Permission not granted:', Notification.permission);
        return;
    }
    
    const notification = new Notification('🎉 Enhanced Test', {
        body: 'Testing with event handlers to track notification lifecycle',
        icon: '/favicon.ico',
        tag: 'test-notification-events',
        requireInteraction: false,
        silent: false
    });
    
    // Track all notification events
    notification.onshow = function(event) {
        console.log('✅ Notification SHOWN successfully!');
        console.log('📱 If you don\'t see it visually, check:');
        console.log('   1. macOS Notification Center (click clock)');
        console.log('   2. Focus/Do Not Disturb is OFF');
        console.log('   3. Chrome notification settings');
    };
    
    notification.onclick = function(event) {
        console.log('👆 Notification CLICKED!');
        notification.close();
    };
    
    notification.onclose = function(event) {
        console.log('❌ Notification CLOSED');
    };
    
    notification.onerror = function(event) {
        console.error('💥 Notification ERROR:', event);
    };
    
    // Auto-close after 5 seconds for testing
    setTimeout(() => {
        if (notification) {
            notification.close();
            console.log('⏰ Test notification auto-closed after 5 seconds');
        }
    }, 5000);
    
    return notification;
}

// Run the test
testNotificationWithEvents();
