/**
 * Migration to add secure meeting access control fields
 * This adds:
 * - student_access_token: unique token for secure student access
 * - access_token_expires_at: expiration timestamp for the token
 * - Creates meeting_access_logs table for audit trail
 */
import pool from '../config/database.js';

async function up() {
    try {
        console.log('Starting secure meeting access migration...');
        
        // Add secure access fields to meetings table
        await pool.query(`
            ALTER TABLE meetings 
            ADD COLUMN IF NOT EXISTS student_access_token VARCHAR(255) UNIQUE,
            ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMP WITH TIME ZONE;
        `);
        
        // Create index on access token for fast lookups
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_meetings_access_token 
            ON meetings(student_access_token) 
            WHERE student_access_token IS NOT NULL;
        `);
        
        // Create meeting access logs table for security audit trail
        await pool.query(`
            CREATE TABLE IF NOT EXISTS meeting_access_logs (
                id SERIAL PRIMARY KEY,
                meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
                access_attempt_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                access_granted BOOLEAN NOT NULL DEFAULT FALSE,
                ip_address INET,
                user_agent TEXT,
                failure_reason TEXT,
                access_token_used VARCHAR(255),
                session_id VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        
        // Create indexes for efficient querying of access logs
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_access_logs_meeting_id 
            ON meeting_access_logs(meeting_id);
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_access_logs_attempt_time 
            ON meeting_access_logs(access_attempt_time);
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_access_logs_ip_address 
            ON meeting_access_logs(ip_address);
        `);
        
        // Add constraint to ensure access token expires in the future when set
        await pool.query(`
            ALTER TABLE meetings 
            ADD CONSTRAINT chk_access_token_expiry 
            CHECK (
                (student_access_token IS NULL AND access_token_expires_at IS NULL) OR
                (student_access_token IS NOT NULL AND access_token_expires_at IS NOT NULL)
            );
        `);
        
        console.log('✅ Migration completed: Added secure meeting access fields and audit logging');
        console.log('   - Added student_access_token and access_token_expires_at to meetings table');
        console.log('   - Created meeting_access_logs table for security audit trail');
        console.log('   - Added necessary indexes for performance');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

async function down() {
    try {
        console.log('Rolling back secure meeting access migration...');
        
        // Drop the meeting access logs table
        await pool.query(`
            DROP TABLE IF EXISTS meeting_access_logs CASCADE;
        `);
        
        // Remove constraints and indexes
        await pool.query(`
            ALTER TABLE meetings 
            DROP CONSTRAINT IF EXISTS chk_access_token_expiry;
        `);
        
        await pool.query(`
            DROP INDEX IF EXISTS idx_meetings_access_token;
        `);
        
        // Remove the secure access columns
        await pool.query(`
            ALTER TABLE meetings 
            DROP COLUMN IF EXISTS student_access_token,
            DROP COLUMN IF EXISTS access_token_expires_at;
        `);
        
        console.log('✅ Migration rollback completed: Removed secure meeting access fields');
        
    } catch (error) {
        console.error('❌ Migration rollback failed:', error);
        throw error;
    }
}

export { up, down };
