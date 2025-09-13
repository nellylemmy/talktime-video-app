-- Fix volunteer settings to use integer IDs matching existing schema

-- Drop and recreate volunteer_settings with correct data types
DROP TABLE IF EXISTS volunteer_settings CASCADE;

CREATE TABLE volunteer_settings (
    id SERIAL PRIMARY KEY,
    volunteer_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
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

-- Drop and recreate volunteer_availability with correct data types  
DROP TABLE IF EXISTS volunteer_availability CASCADE;

CREATE TABLE volunteer_availability (
    id SERIAL PRIMARY KEY,
    volunteer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

-- Create indexes for performance
CREATE INDEX idx_volunteer_settings_volunteer_id ON volunteer_settings(volunteer_id);
CREATE INDEX idx_volunteer_availability_volunteer_id ON volunteer_availability(volunteer_id);
CREATE INDEX idx_volunteer_availability_day_active ON volunteer_availability(day_of_week, is_active);

-- Create updated_at trigger for volunteer_settings
CREATE TRIGGER update_volunteer_settings_updated_at 
    BEFORE UPDATE ON volunteer_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default settings for existing volunteers
INSERT INTO volunteer_settings (volunteer_id)
SELECT id FROM users u
WHERE u.role = 'volunteer' 
AND NOT EXISTS (
    SELECT 1 FROM volunteer_settings vs WHERE vs.volunteer_id = u.id
);

-- Verify setup
SELECT 
    'volunteer_settings' as table_name,
    COUNT(*) as record_count
FROM volunteer_settings
UNION ALL
SELECT 
    'volunteer_availability' as table_name,
    COUNT(*) as record_count  
FROM volunteer_availability;
