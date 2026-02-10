-- Add cleared_by_admin flag to meetings table
-- When admin clears a volunteer's bad record, this flag is set on the relevant meetings.
-- The original status (canceled, missed) is preserved for history.
-- Restriction calculation excludes meetings where cleared_by_admin = TRUE.

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS cleared_by_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS cleared_by_admin_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_meetings_cleared_by_admin ON meetings(cleared_by_admin) WHERE cleared_by_admin = TRUE;
