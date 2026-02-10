-- Migration: Create application settings table
-- Description: Admin-configurable settings for the TalkTime platform
-- This allows admins to change meeting duration, limits, and other settings without code changes

-- Application Settings Table
CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    data_type VARCHAR(20) NOT NULL DEFAULT 'string' CHECK (data_type IN ('string', 'number', 'boolean', 'json')),
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    description TEXT,
    is_public BOOLEAN DEFAULT false, -- If true, can be fetched without auth (for frontend config)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_app_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
CREATE TRIGGER update_app_settings_updated_at
    BEFORE UPDATE ON app_settings
    FOR EACH ROW EXECUTE FUNCTION update_app_settings_updated_at();

-- Insert default settings

-- Meeting Duration Settings
INSERT INTO app_settings (key, value, data_type, category, description, is_public) VALUES
    ('meeting.duration_minutes', '40', 'number', 'meetings', 'Default meeting duration in minutes', true),
    ('meeting.min_duration_minutes', '5', 'number', 'meetings', 'Minimum meeting duration to be considered completed', false),
    ('meeting.auto_timeout_minutes', '40', 'number', 'meetings', 'Minutes after scheduled time before marking as missed', false),
    ('meeting.max_future_months', '3', 'number', 'meetings', 'Maximum months in future a meeting can be scheduled', true)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();

-- Meeting Limits
INSERT INTO app_settings (key, value, data_type, category, description, is_public) VALUES
    ('meeting.calls_per_student_per_day', '1', 'number', 'meetings', 'Maximum calls a student can have per day', true),
    ('meeting.meetings_per_volunteer_student_pair', '3', 'number', 'meetings', 'Maximum active meetings between same volunteer-student pair', true)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();

-- Instant Call Settings
INSERT INTO app_settings (key, value, data_type, category, description, is_public) VALUES
    ('instant_call.response_timeout_seconds', '180', 'number', 'instant_calls', 'Seconds student has to respond to instant call', true),
    ('instant_call.cleanup_interval_minutes', '3', 'number', 'instant_calls', 'Minutes after which stale instant calls are auto-canceled', false)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();

-- Call Timer Settings
INSERT INTO app_settings (key, value, data_type, category, description, is_public) VALUES
    ('call_timer.warning_1_minutes', '5', 'number', 'call_timer', 'First warning before call ends (in minutes)', true),
    ('call_timer.warning_2_minutes', '1', 'number', 'call_timer', 'Second warning before call ends (in minutes)', true)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();

-- Volunteer Performance Settings
INSERT INTO app_settings (key, value, data_type, category, description, is_public) VALUES
    ('volunteer.cancellation_rate_threshold', '40', 'number', 'volunteer', 'Cancellation rate percentage that triggers restriction', false),
    ('volunteer.missed_rate_threshold', '30', 'number', 'volunteer', 'Missed rate percentage that triggers restriction', false),
    ('volunteer.min_reputation_score', '30', 'number', 'volunteer', 'Minimum reputation score before account is restricted', false)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();

-- Notification Settings
INSERT INTO app_settings (key, value, data_type, category, description, is_public) VALUES
    ('notification.reminder_intervals_minutes', '[30, 10, 5]', 'json', 'notifications', 'Meeting reminder intervals in minutes before scheduled time', false),
    ('notification.auto_launch_minutes', '5', 'number', 'notifications', 'Minutes before meeting when auto-launch is triggered', false),
    ('notification.sound_enabled', 'true', 'boolean', 'notifications', 'Enable notification sounds', true)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(category);
CREATE INDEX IF NOT EXISTS idx_app_settings_is_public ON app_settings(is_public) WHERE is_public = true;

COMMENT ON TABLE app_settings IS 'Application-wide settings configurable by admin without code changes';
