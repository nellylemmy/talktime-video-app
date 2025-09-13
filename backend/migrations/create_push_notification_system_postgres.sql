-- TalkTime Push Notification System Migration for PostgreSQL
-- Docker-compatible migration for notification system

-- Enable necessary PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom functions for notification system
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    device_info JSONB DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_user_endpoint UNIQUE(user_id, endpoint)
);

-- Create indexes for push_subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- Create push_notification_logs table for tracking sent notifications
CREATE TABLE IF NOT EXISTS push_notification_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    subscription_id INTEGER,
    notification_data JSONB NOT NULL DEFAULT '{}',
    status TEXT DEFAULT 'sent',
    error_message TEXT,
    sent_at TIMESTAMP DEFAULT NOW(),
    delivered_at TIMESTAMP,
    clicked_at TIMESTAMP,
    CONSTRAINT fk_push_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_push_logs_subscription FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE SET NULL
);

-- Create indexes for push_notification_logs
CREATE INDEX IF NOT EXISTS idx_push_logs_user_id ON push_notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_sent_at ON push_notification_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_push_logs_status ON push_notification_logs(status);

-- Create notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE,
    
    -- Push notification preferences
    push_enabled INTEGER DEFAULT 1,
    push_meeting_reminders INTEGER DEFAULT 1,
    push_instant_calls INTEGER DEFAULT 1,
    push_messages INTEGER DEFAULT 1,
    push_system_alerts INTEGER DEFAULT 1,
    push_connection_requests INTEGER DEFAULT 1,
    push_marketing INTEGER DEFAULT 0,
    
    -- Timing preferences
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '08:00',
    timezone TEXT DEFAULT 'UTC',
    
    -- Advanced settings
    require_interaction INTEGER DEFAULT 0,
    sound_enabled INTEGER DEFAULT 1,
    vibration_enabled INTEGER DEFAULT 1,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT fk_notification_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for notification_preferences
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id ON notification_preferences(user_id);

-- Update notifications table to include push-related fields (if it exists)
DO $$
BEGIN
    -- Check if notifications table exists and add columns if they don't exist
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notifications') THEN
        -- Add push_sent column if it doesn't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'push_sent') THEN
            ALTER TABLE notifications ADD COLUMN push_sent INTEGER DEFAULT 0;
        END IF;
        
        -- Add push_subscription_id column if it doesn't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'push_subscription_id') THEN
            ALTER TABLE notifications ADD COLUMN push_subscription_id INTEGER;
        END IF;
        
        -- Add push_sent_at column if it doesn't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'push_sent_at') THEN
            ALTER TABLE notifications ADD COLUMN push_sent_at TIMESTAMP;
        END IF;
        
        -- Add push_error column if it doesn't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'push_error') THEN
            ALTER TABLE notifications ADD COLUMN push_error TEXT;
        END IF;
    END IF;
END
$$;

-- Create indexes for the new notification fields (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notifications') THEN
        CREATE INDEX IF NOT EXISTS idx_notifications_push_sent ON notifications(push_sent);
        CREATE INDEX IF NOT EXISTS idx_notifications_push_sent_at ON notifications(push_sent_at);
    END IF;
END
$$;

-- Create triggers for automatic updated_at updates
DROP TRIGGER IF EXISTS update_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER update_push_subscriptions_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

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
    np.push_enabled,
    np.push_meeting_reminders,
    np.push_instant_calls,
    np.push_messages,
    np.push_system_alerts,
    np.push_connection_requests,
    np.quiet_hours_start,
    np.quiet_hours_end,
    np.timezone
FROM push_subscriptions ps
JOIN users u ON ps.user_id = u.id
LEFT JOIN notification_preferences np ON u.id = np.user_id
WHERE ps.is_active = 1 AND (np.push_enabled IS NULL OR np.push_enabled = 1);

-- Create view for notification analytics
CREATE OR REPLACE VIEW notification_analytics AS
SELECT 
    DATE(sent_at) as date,
    COUNT(*) as total_sent,
    COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
    COUNT(CASE WHEN status = 'clicked' THEN 1 END) as clicked_count,
    ROUND(
        (COUNT(CASE WHEN status = 'delivered' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)), 2
    ) as delivery_rate,
    ROUND(
        (COUNT(CASE WHEN status = 'clicked' THEN 1 END) * 100.0 / 
         NULLIF(COUNT(CASE WHEN status = 'delivered' THEN 1 END), 0)), 2
    ) as click_rate
FROM push_notification_logs
WHERE sent_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(sent_at)
ORDER BY date DESC;

-- Create default notification preferences for existing users
INSERT INTO notification_preferences (
    user_id, 
    push_enabled, 
    push_meeting_reminders, 
    push_instant_calls, 
    push_messages, 
    push_system_alerts, 
    push_connection_requests,
    created_at,
    updated_at
)
SELECT 
    id, 
    1, 1, 1, 1, 1, 0,
    NOW(),
    NOW()
FROM users 
WHERE id NOT IN (SELECT user_id FROM notification_preferences)
ON CONFLICT (user_id) DO NOTHING;

-- Create a function to clean up old notification logs
CREATE OR REPLACE FUNCTION cleanup_old_notification_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM push_notification_logs 
    WHERE sent_at < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get notification statistics
CREATE OR REPLACE FUNCTION get_notification_stats(days_back INTEGER DEFAULT 30)
RETURNS TABLE(
    total_subscriptions BIGINT,
    active_subscriptions BIGINT,
    total_notifications_sent BIGINT,
    delivery_rate NUMERIC,
    click_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM push_subscriptions)::BIGINT,
        (SELECT COUNT(*) FROM push_subscriptions WHERE is_active = 1)::BIGINT,
        (SELECT COUNT(*) FROM push_notification_logs WHERE sent_at >= NOW() - (days_back || ' days')::INTERVAL)::BIGINT,
        (SELECT 
            ROUND(
                COUNT(CASE WHEN status = 'delivered' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2
            )
         FROM push_notification_logs 
         WHERE sent_at >= NOW() - (days_back || ' days')::INTERVAL)::NUMERIC,
        (SELECT 
            ROUND(
                COUNT(CASE WHEN status = 'clicked' THEN 1 END) * 100.0 / 
                NULLIF(COUNT(CASE WHEN status = 'delivered' THEN 1 END), 0), 2
            )
         FROM push_notification_logs 
         WHERE sent_at >= NOW() - (days_back || ' days')::INTERVAL)::NUMERIC;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO CURRENT_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO CURRENT_USER;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO CURRENT_USER;

-- Insert sample notification preferences for testing (optional)
-- These will be ignored if users already exist
/*
INSERT INTO notification_preferences (
    user_id, push_enabled, push_meeting_reminders, push_instant_calls, 
    push_messages, push_system_alerts, push_connection_requests
) VALUES 
(1, 1, 1, 1, 1, 1, 0),
(2, 1, 1, 1, 0, 1, 0),
(3, 1, 1, 0, 1, 1, 1)
ON CONFLICT(user_id) DO UPDATE SET
    push_enabled = EXCLUDED.push_enabled,
    push_meeting_reminders = EXCLUDED.push_meeting_reminders,
    push_instant_calls = EXCLUDED.push_instant_calls,
    push_messages = EXCLUDED.push_messages,
    push_system_alerts = EXCLUDED.push_system_alerts,
    push_connection_requests = EXCLUDED.push_connection_requests,
    updated_at = NOW();
*/
