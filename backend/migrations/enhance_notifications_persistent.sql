-- Enhanced Notifications System for Persistent and Rich Notifications
-- Migration: Add persistent notification features and rich content support

-- Add new columns to notifications table for enhanced functionality
DO $$ 
BEGIN
    -- Add persistence and interaction columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'is_persistent') THEN
        ALTER TABLE notifications ADD COLUMN is_persistent BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'auto_delete_after') THEN
        ALTER TABLE notifications ADD COLUMN auto_delete_after TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'require_interaction') THEN
        ALTER TABLE notifications ADD COLUMN require_interaction BOOLEAN DEFAULT false;
    END IF;
    
    -- Add action and styling columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'action_url') THEN
        ALTER TABLE notifications ADD COLUMN action_url TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'icon_url') THEN
        ALTER TABLE notifications ADD COLUMN icon_url TEXT DEFAULT '/favicon.ico';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'badge_url') THEN
        ALTER TABLE notifications ADD COLUMN badge_url TEXT DEFAULT '/favicon.ico';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'tag') THEN
        ALTER TABLE notifications ADD COLUMN tag VARCHAR(100);
    END IF;
    
    -- Add interaction tracking columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'clicked_at') THEN
        ALTER TABLE notifications ADD COLUMN clicked_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'dismissed_at') THEN
        ALTER TABLE notifications ADD COLUMN dismissed_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'channels_sent') THEN
        ALTER TABLE notifications ADD COLUMN channels_sent TEXT[] DEFAULT ARRAY[]::TEXT[];
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'delivery_status') THEN
        ALTER TABLE notifications ADD COLUMN delivery_status JSONB DEFAULT '{}'::JSONB;
    END IF;
    
    -- Add performance tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'engagement_score') THEN
        ALTER TABLE notifications ADD COLUMN engagement_score INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'response_time_ms') THEN
        ALTER TABLE notifications ADD COLUMN response_time_ms INTEGER;
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_persistent ON notifications(is_persistent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_auto_delete ON notifications(auto_delete_after) WHERE auto_delete_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_tag ON notifications(tag) WHERE tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_engagement ON notifications(engagement_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread_persistent ON notifications(recipient_id, is_read, is_persistent) WHERE is_read = false AND is_persistent = true;

-- Create notification preferences table for granular control
CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    user_role VARCHAR(20) NOT NULL,
    
    -- Email preferences
    email_enabled BOOLEAN DEFAULT true,
    email_meeting_scheduled BOOLEAN DEFAULT true,
    email_meeting_reminders BOOLEAN DEFAULT true,
    email_meeting_changes BOOLEAN DEFAULT true,
    email_instant_calls BOOLEAN DEFAULT true,
    email_system_alerts BOOLEAN DEFAULT true,
    
    -- SMS preferences
    sms_enabled BOOLEAN DEFAULT false,
    sms_urgent_reminders BOOLEAN DEFAULT false,
    sms_meeting_changes BOOLEAN DEFAULT false,
    sms_system_alerts BOOLEAN DEFAULT false,
    
    -- Push preferences (default all true for maximum engagement)
    push_enabled BOOLEAN DEFAULT true,
    push_meeting_scheduled BOOLEAN DEFAULT true,
    push_meeting_reminders BOOLEAN DEFAULT true,
    push_meeting_changes BOOLEAN DEFAULT true,
    push_instant_calls BOOLEAN DEFAULT true,
    push_system_alerts BOOLEAN DEFAULT true,
    push_engagement_notifications BOOLEAN DEFAULT true,
    
    -- Delivery preferences
    quiet_hours_start TIME DEFAULT '22:00:00',
    quiet_hours_end TIME DEFAULT '07:00:00',
    timezone VARCHAR(50) DEFAULT 'Africa/Nairobi',
    
    -- Engagement settings
    max_notifications_per_hour INTEGER DEFAULT 10,
    auto_mark_read_after_minutes INTEGER DEFAULT 1440, -- 24 hours
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create unique constraint for user preferences
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id, user_role);

-- Create notification analytics table
CREATE TABLE IF NOT EXISTS notification_analytics (
    id SERIAL PRIMARY KEY,
    notification_id INTEGER REFERENCES notifications(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    -- Event tracking
    event_type VARCHAR(50) NOT NULL, -- 'sent', 'delivered', 'clicked', 'dismissed', 'expired'
    channel VARCHAR(20) NOT NULL,    -- 'push', 'email', 'sms', 'in-app'
    
    -- Performance metrics
    response_time_ms INTEGER,
    engagement_score INTEGER DEFAULT 0,
    
    -- Context data
    user_agent TEXT,
    device_type VARCHAR(20),
    browser_info JSONB,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for analytics
CREATE INDEX IF NOT EXISTS idx_notification_analytics_event ON notification_analytics(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_analytics_channel ON notification_analytics(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_analytics_user ON notification_analytics(user_id, created_at DESC);

-- Create function to auto-cleanup old notifications
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
    -- Delete non-persistent notifications older than 7 days
    DELETE FROM notifications 
    WHERE is_persistent = false 
    AND created_at < NOW() - INTERVAL '7 days';
    
    -- Delete notifications marked for auto-deletion
    DELETE FROM notifications 
    WHERE auto_delete_after IS NOT NULL 
    AND auto_delete_after < NOW();
    
    -- Archive old analytics data (older than 90 days)
    DELETE FROM notification_analytics 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate engagement scores
CREATE OR REPLACE FUNCTION update_notification_engagement()
RETURNS void AS $$
BEGIN
    -- Update engagement scores based on user interactions
    UPDATE notifications 
    SET engagement_score = (
        CASE 
            WHEN clicked_at IS NOT NULL THEN 100
            WHEN dismissed_at IS NOT NULL THEN 50
            WHEN is_read = true THEN 25
            ELSE 0
        END +
        CASE 
            WHEN response_time_ms IS NOT NULL AND response_time_ms < 5000 THEN 25
            WHEN response_time_ms IS NOT NULL AND response_time_ms < 30000 THEN 10
            ELSE 0
        END
    )
    WHERE engagement_score = 0;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic updates
CREATE OR REPLACE FUNCTION update_notification_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_notification_preferences ON notification_preferences;
CREATE TRIGGER trigger_update_notification_preferences
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_preferences_timestamp();

-- Insert default preferences for existing users
INSERT INTO notification_preferences (user_id, user_role)
SELECT id, role FROM users 
WHERE NOT EXISTS (
    SELECT 1 FROM notification_preferences 
    WHERE notification_preferences.user_id = users.id 
    AND notification_preferences.user_role = users.role
);

-- Add comments for documentation
COMMENT ON TABLE notifications IS 'Enhanced notifications with persistence and rich content support';
COMMENT ON TABLE notification_preferences IS 'Granular notification preferences per user';
COMMENT ON TABLE notification_analytics IS 'Notification engagement and performance analytics';

COMMENT ON COLUMN notifications.is_persistent IS 'Whether notification persists until manually dismissed';
COMMENT ON COLUMN notifications.auto_delete_after IS 'Automatic deletion timestamp';
COMMENT ON COLUMN notifications.require_interaction IS 'Whether notification requires user interaction to dismiss';
COMMENT ON COLUMN notifications.engagement_score IS 'Calculated engagement score (0-125)';
COMMENT ON COLUMN notifications.response_time_ms IS 'Time taken for user to interact with notification';

-- Create notification summary view
CREATE OR REPLACE VIEW notification_summary AS
SELECT 
    n.recipient_id,
    n.recipient_role,
    COUNT(*) as total_notifications,
    COUNT(*) FILTER (WHERE n.is_read = false) as unread_count,
    COUNT(*) FILTER (WHERE n.is_persistent = true AND n.is_read = false) as persistent_unread,
    COUNT(*) FILTER (WHERE n.clicked_at IS NOT NULL) as clicked_count,
    AVG(n.engagement_score) as avg_engagement_score,
    MAX(n.created_at) as last_notification_time
FROM notifications n
WHERE n.created_at > NOW() - INTERVAL '30 days'
GROUP BY n.recipient_id, n.recipient_role;

COMMENT ON VIEW notification_summary IS 'Summary of notification metrics per user';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO talktime_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO talktime_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_analytics TO talktime_app;
GRANT SELECT ON notification_summary TO talktime_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO talktime_app;
