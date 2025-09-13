-- Fix volunteer settings migration to work with existing schema

-- Create missing indexes (only the ones that can work with existing notification schema)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- Insert default settings for existing volunteer users
INSERT INTO volunteer_settings (volunteer_id)
SELECT id FROM users u
WHERE u.role = 'volunteer' 
AND NOT EXISTS (
    SELECT 1 FROM volunteer_settings vs WHERE vs.volunteer_id = u.id
);

-- Verify tables were created properly
SELECT 
    'volunteer_settings' as table_name,
    COUNT(*) as record_count
FROM volunteer_settings
UNION ALL
SELECT 
    'volunteer_availability' as table_name,
    COUNT(*) as record_count  
FROM volunteer_availability
UNION ALL
SELECT 
    'notifications' as table_name,
    COUNT(*) as record_count
FROM notifications;
