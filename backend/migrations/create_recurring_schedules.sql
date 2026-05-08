-- Migration: Create recurring_schedules table for volunteer recurring schedule feature
-- Allows volunteers to set up daily/weekly recurring time slots with auto-assigned students

CREATE TABLE IF NOT EXISTS recurring_schedules (
    id SERIAL PRIMARY KEY,
    volunteer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    time_slot TIME NOT NULL,              -- EAT time (e.g., '16:30:00')
    days_of_week INTEGER[] NOT NULL,      -- 1=Mon..6=Sat (Sunday excluded)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT no_sunday CHECK (NOT (0 = ANY(days_of_week))),
    CONSTRAINT valid_days CHECK (days_of_week <@ ARRAY[1,2,3,4,5,6])
);

CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_schedules(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_recurring_volunteer ON recurring_schedules(volunteer_id);
