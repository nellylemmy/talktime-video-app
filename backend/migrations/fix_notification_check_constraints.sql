-- Fix notification CHECK constraints that block missed_call and other notification types
-- Root cause: notifications_type_check did not include 'missed_call', 'instant_call',
-- 'meeting_canceled_confirmation', 'meeting_auto_launch', 'new_message'
-- Also: notifications_priority_check did not include 'medium' (default in notificationService.js)
-- Date: 2026-03-18

-- Step 1: Drop the restrictive type CHECK constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Step 2: Add updated type CHECK constraint with ALL types used in code
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
    type::text = ANY (ARRAY[
        'meeting_scheduled',
        'meeting_rescheduled',
        'meeting_canceled',
        'meeting_canceled_confirmation',
        'meeting_reminder_30min',
        'meeting_reminder_10min',
        'meeting_reminder_5min',
        'meeting_started',
        'meeting_ended',
        'meeting_auto_launch',
        'instant_call_received',
        'instant_call_request',
        'instant_call',
        'missed_call',
        'new_message',
        'message_received',
        'parent_approval_received',
        'system_announcement',
        'general'
    ]::text[])
);

-- Step 3: Drop the restrictive priority CHECK constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_priority_check;

-- Step 4: Add updated priority CHECK constraint with 'medium'
ALTER TABLE notifications ADD CONSTRAINT notifications_priority_check CHECK (
    priority::text = ANY (ARRAY[
        'low',
        'normal',
        'medium',
        'high',
        'urgent'
    ]::text[])
);

-- Step 5: Add indexes for recipient_id lookups
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type, created_at DESC);
