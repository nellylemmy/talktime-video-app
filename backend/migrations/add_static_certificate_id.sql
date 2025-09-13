-- Add static certificate ID field to users table
-- This field will store a permanent certificate ID that never changes for each volunteer

ALTER TABLE users 
ADD COLUMN static_certificate_id VARCHAR(50) UNIQUE;

-- Create a function to generate static certificate IDs
CREATE OR REPLACE FUNCTION generate_static_certificate_id(volunteer_id INTEGER, created_date TIMESTAMP)
RETURNS VARCHAR(50) AS $$
BEGIN
    -- Format: TT-{volunteerId}-{year}-{hash of volunteer info}
    -- This creates a deterministic ID that won't change
    RETURN 'TT-' || volunteer_id || '-' || EXTRACT(YEAR FROM created_date)::text || '-' || 
           LPAD((volunteer_id * 12345 + EXTRACT(DOY FROM created_date)::INTEGER * 67)::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Update existing volunteers with static certificate IDs
UPDATE users 
SET static_certificate_id = generate_static_certificate_id(id, created_at)
WHERE role = 'volunteer' AND static_certificate_id IS NULL;

-- Create index for efficient lookups
CREATE INDEX idx_users_static_certificate_id ON users(static_certificate_id);

-- Add constraint to ensure only volunteers can have certificate IDs
ALTER TABLE users 
ADD CONSTRAINT chk_certificate_id_volunteers_only 
CHECK ((role = 'volunteer' AND static_certificate_id IS NOT NULL) OR (role != 'volunteer' AND static_certificate_id IS NULL));

-- Create trigger to automatically generate certificate ID for new volunteers
CREATE OR REPLACE FUNCTION set_static_certificate_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'volunteer' AND NEW.static_certificate_id IS NULL THEN
        NEW.static_certificate_id = generate_static_certificate_id(NEW.id, NEW.created_at);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_static_certificate_id
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_static_certificate_id();
