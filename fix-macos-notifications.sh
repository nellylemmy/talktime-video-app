#!/bin/bash
# macOS Notification Troubleshooting Script

echo "🔍 Checking macOS notification settings..."

# Check if Do Not Disturb is enabled
echo "📵 Checking Do Not Disturb status..."
defaults read ~/Library/Preferences/ByHost/com.apple.notificationcenterui.plist doNotDisturb 2>/dev/null || echo "Do Not Disturb setting not found (likely OFF)"

# Check notification center settings
echo "🔔 Checking Notification Center settings..."
echo "Please manually check: System Preferences > Notifications & Focus > Google Chrome"

echo ""
echo "🛠️  Manual steps to fix macOS notifications:"
echo "1. Open System Preferences"
echo "2. Go to 'Notifications & Focus'"
echo "3. Find 'Google Chrome' in the left list"
echo "4. Make sure these are enabled:"
echo "   ✅ Allow Notifications"
echo "   ✅ Show in Notification Center"
echo "   ✅ Show on Lock Screen"
echo "   ✅ Show Previews: Always"
echo "   ✅ Alert Style: Banners or Alerts (NOT None)"
echo "5. Turn OFF any Focus modes"
echo "6. Turn OFF Do Not Disturb"

echo ""
echo "🌐 Chrome-specific steps:"
echo "1. In Chrome, go to: chrome://settings/content/notifications"
echo "2. Make sure 'Sites can ask to send notifications' is ON"
echo "3. Add localhost to 'Allow' list if not there"
echo "4. Remove localhost from 'Block' list if it's there"
