import pool from './config/database.js';

const createTables = async () => {
  const dropUserTable = `DROP TABLE IF EXISTS users CASCADE;`;
  const createUserTable = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'volunteer' CHECK (role IN ('admin', 'volunteer', 'student')),
      volunteer_type VARCHAR(30) DEFAULT 'standard' CHECK (volunteer_type IN ('standard', 'student_volunteer')),
      age INT,
      gender VARCHAR(20),
      phone VARCHAR(30),
      school_name VARCHAR(255),
      parent_email VARCHAR(100),
      parent_phone VARCHAR(20),
      is_under_18 BOOLEAN DEFAULT false,
      is_approved BOOLEAN DEFAULT true,
      parent_approved BOOLEAN DEFAULT NULL,
      parent_approval_token VARCHAR(255),
      parent_approval_sent_at TIMESTAMP WITH TIME ZONE,
      parent_approved_at TIMESTAMP WITH TIME ZONE,
      profile_image VARCHAR(500),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createStudentTable = `
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(100) NOT NULL,
      admission_number VARCHAR(50) UNIQUE NOT NULL,
      age INT,
      gender VARCHAR(10),
      bio TEXT,
      story TEXT,
      photo_url TEXT,
      gallery TEXT[], -- Array of image URLs
      is_available BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createMeetingTable = `
    CREATE TABLE IF NOT EXISTS meetings (
      id SERIAL PRIMARY KEY,
      room_id VARCHAR(255) UNIQUE NOT NULL,
      volunteer_id INT REFERENCES users(id),
      student_id INT REFERENCES users(id),
      scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
      original_scheduled_time TIMESTAMP WITH TIME ZONE,
      status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'canceled', 'pending', 'active', 'declined')),
      is_rescheduled BOOLEAN DEFAULT false,
      reschedule_count INT DEFAULT 0,
      last_rescheduled_at TIMESTAMP WITH TIME ZONE,
      rescheduled_by INT REFERENCES users(id),
      is_instant BOOLEAN DEFAULT false,
      student_access_token VARCHAR(255) UNIQUE,
      access_token_expires_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createNotificationsTable = `
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      meeting_id INT REFERENCES meetings(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL CHECK (type IN (
        'meeting_scheduled', 'meeting_rescheduled', 'meeting_canceled',
        'meeting_reminder_30min', 'meeting_reminder_10min', 'meeting_reminder_5min',
        'meeting_started', 'meeting_ended', 'instant_call_received',
        'message_received', 'parent_approval_received', 'system_announcement'
      )),
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      channels TEXT[] DEFAULT ARRAY['dashboard'], -- Array of channels: email, sms, dashboard, push, sound, vibration
      is_read BOOLEAN DEFAULT false,
      is_sent BOOLEAN DEFAULT false,
      sent_at TIMESTAMP WITH TIME ZONE,
      scheduled_for TIMESTAMP WITH TIME ZONE, -- For scheduled notifications like reminders
      metadata JSONB, -- Store additional data like meeting details, volunteer info, etc.
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createMessagesTable = `
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INT REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INT REFERENCES users(id) ON DELETE CASCADE,
      meeting_id INT REFERENCES meetings(id) ON DELETE SET NULL, -- Optional: link to specific meeting
      type VARCHAR(30) DEFAULT 'direct' CHECK (type IN ('direct', 'instant_call_response', 'missed_call_message', 'system')),
      subject VARCHAR(255),
      content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      is_urgent BOOLEAN DEFAULT false,
      parent_message_id INT REFERENCES messages(id) ON DELETE SET NULL, -- For message threads/replies
      attachments JSONB, -- Store file attachments metadata
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(dropUserTable);
    console.log('"users" table dropped.');
    await pool.query(createUserTable);
    console.log('"users" table created or already exists.');
    await pool.query(createStudentTable);
    console.log('"students" table created or already exists.');
    await pool.query(createMeetingTable);
    console.log('"meetings" table created or already exists.');
    await pool.query(createNotificationsTable);
    console.log('"notifications" table created or already exists.');
    await pool.query(createMessagesTable);
    console.log('"messages" table created or already exists.');
    console.log('Database initialization complete.');
  } catch (err) {
    console.error('Error creating tables:', err);
  }
};

createTables().finally(() => pool.end());
