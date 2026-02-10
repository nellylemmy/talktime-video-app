-- Create volunteer_settings table
CREATE TABLE IF NOT EXISTS volunteer_settings (
    id SERIAL PRIMARY KEY,
    volunteer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Accessibility Settings
    theme_mode VARCHAR(20) DEFAULT 'light',
    font_size VARCHAR(20) DEFAULT 'medium',
    zoom_level INTEGER DEFAULT 100,

    -- Availability Settings
    max_meetings_per_day INTEGER DEFAULT 3,
    max_meetings_per_week INTEGER DEFAULT 15,
    advance_notice_hours INTEGER DEFAULT 2,
    auto_accept_meetings BOOLEAN DEFAULT false,

    -- Timezone Settings
    primary_timezone VARCHAR(50) DEFAULT 'UTC',
    display_timezone_preference VARCHAR(20) DEFAULT 'local',
    dst_handling BOOLEAN DEFAULT true,

    -- Notification Settings (JSONB for flexibility)
    email_notifications JSONB DEFAULT '{
        "meeting_scheduled": true,
        "meeting_reminder": true,
        "meeting_cancelled": true,
        "meeting_rescheduled": true,
        "system_updates": false,
        "new_student_alerts": false
    }'::jsonb,

    sms_notifications JSONB DEFAULT '{
        "meeting_reminder": false,
        "urgent_changes": false
    }'::jsonb,

    browser_notifications JSONB DEFAULT '{
        "meeting_reminder": true,
        "meeting_scheduled": true,
        "instant_calls": true
    }'::jsonb,

    reminder_timings INTEGER[] DEFAULT ARRAY[60, 30, 5],

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one settings row per volunteer
    UNIQUE(volunteer_id)
);

-- Create index for faster lookups
CREATE INDEX idx_volunteer_settings_volunteer_id ON volunteer_settings(volunteer_id);

-- Create update trigger for updated_at
CREATE OR REPLACE FUNCTION update_volunteer_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_volunteer_settings_updated_at
    BEFORE UPDATE ON volunteer_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_volunteer_settings_updated_at();