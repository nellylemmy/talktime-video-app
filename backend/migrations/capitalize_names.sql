-- Migration: Capitalize existing names in the database
-- This migration uses PostgreSQL's INITCAP function for basic capitalization
-- Note: INITCAP handles space-separated words but may not perfectly handle
-- edge cases like O'Brien or Mary-Jane. A follow-up script can refine these.

-- Update full_name column for all users
UPDATE users
SET full_name = INITCAP(full_name)
WHERE full_name IS NOT NULL
  AND full_name != INITCAP(full_name);

-- Update guardian_name column if it exists and has data
UPDATE students
SET guardian_name = INITCAP(guardian_name)
WHERE guardian_name IS NOT NULL
  AND guardian_name != INITCAP(guardian_name);

-- Log the number of records updated
DO $$
DECLARE
    users_updated INTEGER;
    students_updated INTEGER;
BEGIN
    GET DIAGNOSTICS users_updated = ROW_COUNT;
    RAISE NOTICE 'Name capitalization migration completed';
END $$;
