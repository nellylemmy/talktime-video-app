/**
 * Migration to create security events table for Phase 5 enhanced security
 * This table tracks all security-related events for monitoring and analysis
 */
import pool from '../config/database.js';

async function up() {
    try {
        console.log('Starting security events table migration...');
        
        // Create security events table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS security_events (
                id SERIAL PRIMARY KEY,
                event_type VARCHAR(100) NOT NULL,
                ip_address INET,
                user_id INTEGER REFERENCES users(id),
                meeting_id INTEGER REFERENCES meetings(id),
                user_agent TEXT,
                details TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        
        // Create indexes for efficient querying
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_security_events_type_time 
            ON security_events(event_type, created_at DESC);
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_security_events_ip_time 
            ON security_events(ip_address, created_at DESC);
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_security_events_user_time 
            ON security_events(user_id, created_at DESC) 
            WHERE user_id IS NOT NULL;
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_security_events_meeting_time 
            ON security_events(meeting_id, created_at DESC) 
            WHERE meeting_id IS NOT NULL;
        `);
        
        // Add security_review status to meetings if not exists
        // First check existing status values and include them in constraint
        await pool.query(`
            ALTER TABLE meetings 
            DROP CONSTRAINT IF EXISTS meetings_status_check;
        `);
        
        await pool.query(`
            ALTER TABLE meetings 
            ADD CONSTRAINT meetings_status_check 
            CHECK (status IN ('pending', 'active', 'completed', 'canceled', 'scheduled', 'security_review'));
        `);
        
        console.log('✅ Migration completed: Created security events table');
        console.log('   - Added security_events table with proper indexes');
        console.log('   - Updated meetings status constraint to include security_review');
        console.log('   - Added indexes for efficient security monitoring queries');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

async function down() {
    try {
        console.log('Rolling back security events table migration...');
        
        // Remove indexes
        await pool.query(`DROP INDEX IF EXISTS idx_security_events_type_time;`);
        await pool.query(`DROP INDEX IF EXISTS idx_security_events_ip_time;`);
        await pool.query(`DROP INDEX IF EXISTS idx_security_events_user_time;`);
        await pool.query(`DROP INDEX IF EXISTS idx_security_events_meeting_time;`);
        
        // Remove table
        await pool.query(`DROP TABLE IF EXISTS security_events;`);
        
        // Revert meetings status constraint (keep existing status values)
        await pool.query(`
            ALTER TABLE meetings 
            DROP CONSTRAINT IF EXISTS meetings_status_check;
        `);
        
        await pool.query(`
            ALTER TABLE meetings 
            ADD CONSTRAINT meetings_status_check 
            CHECK (status IN ('pending', 'active', 'completed', 'canceled', 'scheduled'));
        `);
        
        console.log('✅ Migration rollback completed: Removed security events table');
        
    } catch (error) {
        console.error('❌ Migration rollback failed:', error);
        throw error;
    }
}

export { up, down };
