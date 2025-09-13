-- Migration: Create volunteer settings tables
-- Description: Add comprehensive settings support for volunteers including accessibility, availability, and notifications

-- User Settings Table
CREATE TABLE IF NOT EXISTS volunteer_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_id UUID UNIQUE NOT NULL,
    
    -- Accessibility Settings
    theme_mode VARCHAR(10) DEFAULT 'light' CHECK (theme_mode IN ('light', 'dark', 'auto')),
    font_size VARCHAR(10) DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large', 'xl')),
    zoom_level INTEGER DEFAULT 100 CHECK (zoom_level IN (75, 100, 125, 150)),
    
    -- Availability Settings
    max_meetings_per_day INTEGER DEFAULT 3 CHECK (max_meetings_per_day > 0 AND max_meetings_per_day <= 10),
    max_meetings_per_week INTEGER DEFAULT 15 CHECK (max_meetings_per_week > 0 AND max_meetings_per_week <= 50),
    advance_notice_hours INTEGER DEFAULT 2 CHECK (advance_notice_hours >= 0 AND advance_notice_hours <= 168),
    auto_accept_meetings BOOLEAN DEFAULT false,
    
    -- Time Zone Settings
    primary_timezone VARCHAR(50) DEFAULT 'UTC',
    display_timezone_preference VARCHAR(10) DEFAULT 'local' CHECK (display_timezone_preference IN ('local', 'eat')),
    dst_handling BOOLEAN DEFAULT true,
    
    -- Notification Preferences (JSONB for flexibility)
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
    reminder_timings INTEGER[] DEFAULT ARRAY[60, 30, 5], -- minutes before meeting
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Availability Windows Table
CREATE TABLE IF NOT EXISTS volunteer_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_id UUID NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure end time is after start time
    CONSTRAINT valid_time_window CHECK (end_time > start_time),
    -- Unique constraint to prevent overlapping windows for same volunteer on same day
    UNIQUE (volunteer_id, day_of_week, start_time, end_time, timezone)
);

-- Notifications Table (Universal for all user types)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('volunteer', 'student', 'admin')),
    type VARCHAR(50) NOT NULL, -- 'meeting_reminder', 'meeting_scheduled', 'system_update', etc.
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb, -- Additional metadata (meeting_id, etc.)
    read_at TIMESTAMP WITH TIME ZONE NULL,
    expires_at TIMESTAMP WITH TIME ZONE NULL, -- Optional expiration for temporary notifications
    priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_volunteer_settings_volunteer_id ON volunteer_settings(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_availability_volunteer_id ON volunteer_availability(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_availability_day_active ON volunteer_availability(day_of_week, is_active);
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_id ON notifications(user_type, user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_expires ON notifications(expires_at) WHERE expires_at IS NOT NULL;

-- Create updated_at trigger for volunteer_settings
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_volunteer_settings_updated_at 
    BEFORE UPDATE ON volunteer_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default settings for existing volunteers
INSERT INTO volunteer_settings (volunteer_id)
SELECT id FROM volunteers v
WHERE NOT EXISTS (
    SELECT 1 FROM volunteer_settings vs WHERE vs.volunteer_id = v.id
);

COMMENT ON TABLE volunteer_settings IS 'Comprehensive settings for volunteer accounts including accessibility, availability, and notification preferences';
COMMENT ON TABLE volunteer_availability IS 'Weekly availability windows for volunteers with timezone support';
COMMENT ON TABLE notifications IS 'Universal notification system for all user types with read status and expiration';
