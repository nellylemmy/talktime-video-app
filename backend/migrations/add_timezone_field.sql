-- Migration: Add timezone field to users table
-- Description: Adds timezone support for volunteer scheduling with proper IANA timezone identifiers
-- Created: 2025-01-07

-- Add timezone column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'America/New_York';

-- Add comment to document the field
COMMENT ON COLUMN users.timezone IS 'IANA timezone identifier for user location (e.g., America/New_York, Europe/London, Africa/Nairobi)';

-- Create index for performance when querying by timezone
CREATE INDEX IF NOT EXISTS idx_users_timezone ON users(timezone);

-- Update existing users with a default timezone if they don't have one
UPDATE users 
SET timezone = 'America/New_York' 
WHERE timezone IS NULL;

-- Add constraint to ensure timezone follows IANA format
ALTER TABLE users 
ADD CONSTRAINT chk_timezone_format 
CHECK (timezone ~ '^[A-Za-z_]+/[A-Za-z_]+$' OR timezone IS NULL);
