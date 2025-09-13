-- TalkTime Push Notification Subscriptions Migration (PostgreSQL)
-- Creates table to store Web Push API subscriptions for users

-- Create push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    device_info JSONB, -- JSON data for device information
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, endpoint) -- Prevent duplicate subscriptions
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- Create push_notification_logs table for tracking sent notifications
CREATE TABLE IF NOT EXISTS push_notification_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    subscription_id INTEGER,
    notification_data JSONB NOT NULL, -- JSON data with notification details
    status TEXT DEFAULT 'sent', -- sent, delivered, failed, clicked
    error_message TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    clicked_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE SET NULL
);

-- Index for notification logs
CREATE INDEX IF NOT EXISTS idx_push_logs_user_id ON push_notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_sent_at ON push_notification_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_push_logs_status ON push_notification_logs(status);

-- Create notification_preferences table (enhance existing or create new)
CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE,
    
    -- Push notification preferences
    push_enabled BOOLEAN DEFAULT true,
    push_meeting_reminders BOOLEAN DEFAULT true,
    push_instant_calls BOOLEAN DEFAULT true,
    push_messages BOOLEAN DEFAULT true,
    push_system_alerts BOOLEAN DEFAULT true,
    push_connection_requests BOOLEAN DEFAULT true,
    push_marketing BOOLEAN DEFAULT false,
    
    -- Timing preferences
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '08:00',
    timezone TEXT DEFAULT 'UTC',
    
    -- Advanced settings
    require_interaction BOOLEAN DEFAULT false, -- For important notifications
    sound_enabled BOOLEAN DEFAULT true,
    vibration_enabled BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for notification preferences
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id ON notification_preferences(user_id);

-- Create default notification preferences for existing users
INSERT INTO notification_preferences (user_id, created_at, updated_at)
SELECT id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP 
FROM users 
WHERE id NOT IN (SELECT user_id FROM notification_preferences)
ON CONFLICT (user_id) DO NOTHING;

-- Update existing notifications table to include push-related fields
-- Note: Use ALTER TABLE IF NOT EXISTS for PostgreSQL compatibility
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='push_sent') THEN
        ALTER TABLE notifications ADD COLUMN push_sent BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='push_subscription_id') THEN
        ALTER TABLE notifications ADD COLUMN push_subscription_id INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='push_sent_at') THEN
        ALTER TABLE notifications ADD COLUMN push_sent_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='push_error') THEN
        ALTER TABLE notifications ADD COLUMN push_error TEXT;
    END IF;
END $$;

-- Create indexes for the new notification fields
CREATE INDEX IF NOT EXISTS idx_notifications_push_sent ON notifications(push_sent);
CREATE INDEX IF NOT EXISTS idx_notifications_push_sent_at ON notifications(push_sent_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to update updated_at timestamp on notification_preferences
DROP TRIGGER IF EXISTS update_notification_preferences_timestamp ON notification_preferences;
CREATE TRIGGER update_notification_preferences_timestamp 
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger to update updated_at timestamp on push_subscriptions
DROP TRIGGER IF EXISTS update_push_subscriptions_timestamp ON push_subscriptions;
CREATE TRIGGER update_push_subscriptions_timestamp 
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for active push subscriptions with user info
CREATE OR REPLACE VIEW active_push_subscriptions AS
SELECT 
    ps.id,
    ps.user_id,
    ps.endpoint,
    ps.p256dh_key,
    ps.auth_key,
    ps.device_info,
    ps.created_at as subscription_created_at,
    ps.updated_at as subscription_updated_at,
    u.username,
    u.email,
    u.role,
    COALESCE(np.push_enabled, true) as push_enabled,
    COALESCE(np.push_meeting_reminders, true) as push_meeting_reminders,
    COALESCE(np.push_instant_calls, true) as push_instant_calls,
    COALESCE(np.push_messages, true) as push_messages,
    COALESCE(np.push_system_alerts, true) as push_system_alerts,
    COALESCE(np.push_connection_requests, true) as push_connection_requests,
    COALESCE(np.quiet_hours_start, '22:00'::TIME) as quiet_hours_start,
    COALESCE(np.quiet_hours_end, '08:00'::TIME) as quiet_hours_end,
    COALESCE(np.timezone, 'UTC') as timezone
FROM push_subscriptions ps
JOIN users u ON ps.user_id = u.id
LEFT JOIN notification_preferences np ON u.id = np.user_id
WHERE ps.is_active = true AND COALESCE(np.push_enabled, true) = true;

-- Create view for notification analytics
CREATE OR REPLACE VIEW notification_analytics AS
SELECT 
    DATE(sent_at) as date,
    COUNT(*) as total_sent,
    COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
    COUNT(CASE WHEN status = 'clicked' THEN 1 END) as clicked_count,
    ROUND(
        (COUNT(CASE WHEN status = 'delivered' THEN 1 END) * 100.0 / COUNT(*))::numeric, 2
    ) as delivery_rate,
    ROUND(
        (COUNT(CASE WHEN status = 'clicked' THEN 1 END) * 100.0 / 
         NULLIF(COUNT(CASE WHEN status = 'delivered' THEN 1 END), 0))::numeric, 2
    ) as click_rate
FROM push_notification_logs
WHERE sent_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(sent_at)
ORDER BY date DESC;

-- Sample data for testing (optional - remove in production)
/*
INSERT INTO notification_preferences (
    user_id, push_enabled, push_meeting_reminders, push_instant_calls, 
    push_messages, push_system_alerts, push_connection_requests
) VALUES 
(1, 1, 1, 1, 1, 1, 0),
(2, 1, 1, 1, 0, 1, 0),
(3, 1, 1, 0, 1, 1, 1)
ON CONFLICT(user_id) DO UPDATE SET
    push_enabled = excluded.push_enabled,
    push_meeting_reminders = excluded.push_meeting_reminders,
    push_instant_calls = excluded.push_instant_calls,
    push_messages = excluded.push_messages,
    push_system_alerts = excluded.push_system_alerts,
    push_connection_requests = excluded.push_connection_requests,
    updated_at = datetime('now');
*/

-- Migration verification queries
-- Uncomment to verify the migration worked correctly:

/*
-- Check if tables were created
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%push%';

-- Check if indexes were created
SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%push%';

-- Check if views were created
SELECT name FROM sqlite_master WHERE type='view' AND name LIKE '%notification%';

-- Count existing data
SELECT 'push_subscriptions' as table_name, COUNT(*) as row_count FROM push_subscriptions
UNION ALL
SELECT 'notification_preferences', COUNT(*) FROM notification_preferences
UNION ALL
SELECT 'push_notification_logs', COUNT(*) FROM push_notification_logs;
*/
