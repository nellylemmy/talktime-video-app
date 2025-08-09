-- Migration: Add comprehensive student profile fields to users table
-- Date: 2025-08-08
-- Description: Add all missing fields needed by frontend components for complete student profiles

-- Add core student profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS story TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(100) DEFAULT 'Kenya';
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT DEFAULT 'English conversation practice';

-- Add gallery image fields (up to 5 images as used in admin form)
-- Using TEXT to accommodate long URLs from image hosting services
ALTER TABLE users ADD COLUMN IF NOT EXISTS gallery_image_1 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gallery_image_2 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gallery_image_3 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gallery_image_4 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gallery_image_5 TEXT;

-- Add availability status for scheduling
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;

-- Add additional fields used in frontend but missing from database
-- Note: profile_image already exists in users table
-- Add any other fields that might be needed for complete profiles
ALTER TABLE users ADD COLUMN IF NOT EXISTS admission_notes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_grade VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS english_level VARCHAR(50) DEFAULT 'Beginner';
ALTER TABLE users ADD COLUMN IF NOT EXISTS learning_goals TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS special_needs TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_topics TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Africa/Nairobi';

-- Update existing students with default values if needed
UPDATE users 
SET 
    location = COALESCE(location, 'Kenya'),
    interests = COALESCE(interests, 'English conversation practice'),
    is_available = COALESCE(is_available, true),
    english_level = COALESCE(english_level, 'Beginner'),
    timezone = COALESCE(timezone, 'Africa/Nairobi')
WHERE role = 'student';

-- Add comments for documentation
COMMENT ON COLUMN users.bio IS 'Brief description of the student (1-2 sentences)';
COMMENT ON COLUMN users.story IS 'Detailed background story about the student';
COMMENT ON COLUMN users.location IS 'Student location (default: Kenya)';
COMMENT ON COLUMN users.interests IS 'Student interests and goals';
COMMENT ON COLUMN users.gallery_image_1 IS 'First gallery image URL';
COMMENT ON COLUMN users.gallery_image_2 IS 'Second gallery image URL';
COMMENT ON COLUMN users.gallery_image_3 IS 'Third gallery image URL';
COMMENT ON COLUMN users.gallery_image_4 IS 'Fourth gallery image URL';
COMMENT ON COLUMN users.gallery_image_5 IS 'Fifth gallery image URL';
COMMENT ON COLUMN users.is_available IS 'Whether student is available for scheduling';
COMMENT ON COLUMN users.admission_notes IS 'Additional notes about student admission';
COMMENT ON COLUMN users.emergency_contact IS 'Emergency contact information';
COMMENT ON COLUMN users.guardian_name IS 'Name of student guardian/parent';
COMMENT ON COLUMN users.guardian_phone IS 'Guardian phone number';
COMMENT ON COLUMN users.school_grade IS 'Current school grade/class';
COMMENT ON COLUMN users.english_level IS 'Current English proficiency level';
COMMENT ON COLUMN users.learning_goals IS 'Student learning objectives and goals';
COMMENT ON COLUMN users.special_needs IS 'Any special learning needs or accommodations';
COMMENT ON COLUMN users.preferred_topics IS 'Topics student prefers to discuss';
COMMENT ON COLUMN users.timezone IS 'Student timezone (default: Africa/Nairobi)';

-- Create indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_users_role_available ON users(role, is_available) WHERE role = 'student';
CREATE INDEX IF NOT EXISTS idx_users_admission_number ON users(username) WHERE role = 'student';
CREATE INDEX IF NOT EXISTS idx_users_english_level ON users(english_level) WHERE role = 'student';
