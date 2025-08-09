/**
 * Enhanced Instant Call Features Migration
 * Adds call history, persistent notifications, and minimum duration support
 */
import pool from '../config/database.js';

export async function up() {
    console.log('🚀 Running enhanced instant call features migration...');
    
    try {
        await pool.query('BEGIN');
        
        // 1. Create call_history table for tracking all call actions
        console.log('📋 Creating call_history table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS call_history (
                id SERIAL PRIMARY KEY,
                meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
                volunteer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                action_type VARCHAR(50) NOT NULL, -- 'initiated', 'accepted', 'rejected', 'message_sent', 'ended', 'timeout'
                action_data JSONB, -- Store additional data like message content, duration, etc.
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                user_agent TEXT, -- Browser info for debugging
                ip_address INET -- IP for security tracking
            );
        `);
        
        // 2. Add indexes for efficient querying
        console.log('🔍 Adding indexes for call_history...');
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_call_history_meeting_id ON call_history(meeting_id);
            CREATE INDEX IF NOT EXISTS idx_call_history_volunteer_id ON call_history(volunteer_id);
            CREATE INDEX IF NOT EXISTS idx_call_history_student_id ON call_history(student_id);
            CREATE INDEX IF NOT EXISTS idx_call_history_timestamp ON call_history(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_call_history_action_type ON call_history(action_type);
        `);
        
        // 3. Create persistent_notifications table for background notifications
        console.log('🔔 Creating persistent_notifications table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS persistent_notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER, -- Can be student_id or volunteer_id
                user_type VARCHAR(20) NOT NULL, -- 'student' or 'volunteer'
                notification_type VARCHAR(50) NOT NULL, -- 'instant_call', 'call_reminder', 'message'
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                data JSONB, -- Additional notification data
                is_read BOOLEAN DEFAULT FALSE,
                is_dismissed BOOLEAN DEFAULT FALSE,
                requires_action BOOLEAN DEFAULT FALSE, -- True for instant calls that need response
                expires_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                read_at TIMESTAMP WITH TIME ZONE,
                dismissed_at TIMESTAMP WITH TIME ZONE
            );
        `);
        
        // 4. Add indexes for persistent_notifications
        console.log('🔍 Adding indexes for persistent_notifications...');
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_persistent_notifications_user ON persistent_notifications(user_id, user_type);
            CREATE INDEX IF NOT EXISTS idx_persistent_notifications_type ON persistent_notifications(notification_type);
            CREATE INDEX IF NOT EXISTS idx_persistent_notifications_unread ON persistent_notifications(user_id, user_type, is_read) WHERE is_read = FALSE;
            CREATE INDEX IF NOT EXISTS idx_persistent_notifications_active ON persistent_notifications(user_id, user_type, requires_action) WHERE requires_action = TRUE AND is_dismissed = FALSE;
            CREATE INDEX IF NOT EXISTS idx_persistent_notifications_expires ON persistent_notifications(expires_at) WHERE expires_at IS NOT NULL;
        `);
        
        // 5. Add enhanced fields to meetings table for instant calls
        console.log('📞 Enhancing meetings table for instant calls...');
        await pool.query(`
            ALTER TABLE meetings 
            ADD COLUMN IF NOT EXISTS call_duration_seconds INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS min_duration_seconds INTEGER DEFAULT 60,
            ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS actual_end_time TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS call_quality_rating INTEGER CHECK (call_quality_rating >= 1 AND call_quality_rating <= 5),
            ADD COLUMN IF NOT EXISTS connection_issues JSONB, -- Store any technical issues
            ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP WITH TIME ZONE;
        `);
        
        // 6. Create function to clean up expired notifications
        console.log('🧹 Creating cleanup function for expired notifications...');
        await pool.query(`
            CREATE OR REPLACE FUNCTION cleanup_expired_notifications()
            RETURNS INTEGER AS $$
            DECLARE
                deleted_count INTEGER;
            BEGIN
                DELETE FROM persistent_notifications 
                WHERE expires_at IS NOT NULL 
                AND expires_at < CURRENT_TIMESTAMP;
                
                GET DIAGNOSTICS deleted_count = ROW_COUNT;
                RETURN deleted_count;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        // 7. Create function to get user call statistics
        console.log('📊 Creating call statistics function...');
        await pool.query(`
            CREATE OR REPLACE FUNCTION get_user_call_stats(
                p_user_id INTEGER,
                p_user_type VARCHAR(20),
                p_days_back INTEGER DEFAULT 30
            )
            RETURNS TABLE (
                total_calls INTEGER,
                accepted_calls INTEGER,
                rejected_calls INTEGER,
                messages_sent INTEGER,
                avg_call_duration NUMERIC,
                last_call_date TIMESTAMP WITH TIME ZONE
            ) AS $$
            BEGIN
                RETURN QUERY
                SELECT 
                    COUNT(DISTINCT ch.meeting_id)::INTEGER as total_calls,
                    COUNT(CASE WHEN ch.action_type = 'accepted' THEN 1 END)::INTEGER as accepted_calls,
                    COUNT(CASE WHEN ch.action_type = 'rejected' THEN 1 END)::INTEGER as rejected_calls,
                    COUNT(CASE WHEN ch.action_type = 'message_sent' THEN 1 END)::INTEGER as messages_sent,
                    AVG(CASE WHEN m.call_duration_seconds > 0 THEN m.call_duration_seconds END) as avg_call_duration,
                    MAX(ch.timestamp) as last_call_date
                FROM call_history ch
                LEFT JOIN meetings m ON ch.meeting_id = m.id
                WHERE (
                    (p_user_type = 'volunteer' AND ch.volunteer_id = p_user_id) OR
                    (p_user_type = 'student' AND ch.student_id = p_user_id)
                )
                AND ch.timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days_back;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        await pool.query('COMMIT');
        console.log('✅ Enhanced instant call features migration completed successfully!');
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('❌ Enhanced instant call features migration failed:', error);
        throw error;
    }
}

export async function down() {
    console.log('🔄 Rolling back enhanced instant call features migration...');
    
    try {
        await pool.query('BEGIN');
        
        // Drop functions
        await pool.query('DROP FUNCTION IF EXISTS get_user_call_stats(INTEGER, VARCHAR, INTEGER);');
        await pool.query('DROP FUNCTION IF EXISTS cleanup_expired_notifications();');
        
        // Remove added columns from meetings table
        await pool.query(`
            ALTER TABLE meetings 
            DROP COLUMN IF EXISTS call_duration_seconds,
            DROP COLUMN IF EXISTS min_duration_seconds,
            DROP COLUMN IF EXISTS actual_start_time,
            DROP COLUMN IF EXISTS actual_end_time,
            DROP COLUMN IF EXISTS call_quality_rating,
            DROP COLUMN IF EXISTS connection_issues,
            DROP COLUMN IF EXISTS retry_count,
            DROP COLUMN IF EXISTS last_retry_at;
        `);
        
        // Drop tables
        await pool.query('DROP TABLE IF EXISTS persistent_notifications;');
        await pool.query('DROP TABLE IF EXISTS call_history;');
        
        await pool.query('COMMIT');
        console.log('✅ Enhanced instant call features migration rollback completed!');
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('❌ Enhanced instant call features migration rollback failed:', error);
        throw error;
    }
}
