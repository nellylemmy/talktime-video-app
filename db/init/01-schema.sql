-- TalkTime Database Schema
-- This file initializes the database with all required tables

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'volunteer' CHECK (role IN ('admin', 'volunteer', 'student')),
    volunteer_type VARCHAR(30) DEFAULT 'standard' CHECK (volunteer_type IN ('standard', 'student_volunteer')),
    age INTEGER,
    gender VARCHAR(20),
    phone VARCHAR(30),
    timezone VARCHAR(100) DEFAULT 'America/New_York',
    school_name VARCHAR(255),
    parent_email VARCHAR(100),
    parent_phone VARCHAR(20),
    is_under_18 BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT true,
    parent_approved BOOLEAN,
    parent_approval_token VARCHAR(255),
    parent_approval_sent_at TIMESTAMPTZ,
    parent_approved_at TIMESTAMPTZ,
    profile_image VARCHAR(500),
    security_question_1 VARCHAR(255),
    security_answer_1_hash VARCHAR(255),
    security_question_2 VARCHAR(255),
    security_answer_2_hash VARCHAR(255),
    security_question_3 VARCHAR(255),
    security_answer_3_hash VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Meetings table
CREATE TABLE IF NOT EXISTS meetings (
    id SERIAL PRIMARY KEY,
    volunteer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_time TIMESTAMPTZ NOT NULL,
    room_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'pending', 'confirmed', 'in_progress', 'active', 'completed', 'canceled', 'missed', 'declined')),
    is_instant BOOLEAN DEFAULT FALSE,
    reschedule_count INTEGER DEFAULT 0,
    cleared_by_admin BOOLEAN DEFAULT FALSE,
    cleared_by_admin_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Admin secret codes table
CREATE TABLE IF NOT EXISTS admin_secret_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    is_used BOOLEAN DEFAULT FALSE,
    used_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMPTZ
);

-- Newsletter subscriptions table
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    subscribed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    unsubscribed_at TIMESTAMPTZ,
    source VARCHAR(50) DEFAULT 'website'
);

-- Volunteer settings table
CREATE TABLE IF NOT EXISTS volunteer_settings (
    id SERIAL PRIMARY KEY,
    volunteer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_sound BOOLEAN DEFAULT TRUE,
    notification_volume INTEGER DEFAULT 80,
    auto_accept_calls BOOLEAN DEFAULT FALSE,
    theme VARCHAR(20) DEFAULT 'light',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(volunteer_id)
);

-- Security events table
CREATE TABLE IF NOT EXISTS security_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_meetings_volunteer_id ON meetings(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_meetings_student_id ON meetings(student_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_time ON meetings(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_cleared_by_admin ON meetings(cleared_by_admin) WHERE cleared_by_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Activity log table (for future real-time audit logging)
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_role VARCHAR(20),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_created ON activity_log(user_id, created_at DESC);

-- Insert default admin secret code
INSERT INTO admin_secret_codes (code) VALUES ('123456') ON CONFLICT (code) DO NOTHING;
