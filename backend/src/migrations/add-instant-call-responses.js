/**
 * Migration to add instant call response tracking fields
 * This adds:
 * - call_response: track student responses (pending, accepted, rejected, timeout)
 * - response_message: optional message from student
 * - call_timeout_at: when the call expires if not answered
 * - call_initiated_at: when the instant call was initiated
 */
import pool from '../config/database.js';

async function up() {
    try {
        console.log('Starting instant call response tracking migration...');
        
        // Add instant call response tracking fields
        await pool.query(`
            ALTER TABLE meetings 
            ADD COLUMN IF NOT EXISTS call_response VARCHAR(20) DEFAULT 'pending',
            ADD COLUMN IF NOT EXISTS response_message TEXT,
            ADD COLUMN IF NOT EXISTS call_timeout_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS call_initiated_at TIMESTAMP WITH TIME ZONE;
        `);
        
        // Add constraint for valid call responses
        await pool.query(`
            ALTER TABLE meetings 
            DROP CONSTRAINT IF EXISTS meetings_call_response_check;
        `);
        
        await pool.query(`
            ALTER TABLE meetings 
            ADD CONSTRAINT meetings_call_response_check 
            CHECK (call_response IN ('pending', 'accepted', 'rejected', 'timeout', 'no_response'));
        `);
        
        // Create index for efficient querying of pending calls
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_meetings_call_response_pending 
            ON meetings(call_response, call_timeout_at) 
            WHERE call_response = 'pending' AND is_instant = true;
        `);
        
        // Create index for call timeout queries
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_meetings_call_timeout 
            ON meetings(call_timeout_at) 
            WHERE call_timeout_at IS NOT NULL;
        `);
        
        console.log('✅ Migration completed: Added instant call response tracking fields');
        console.log('   - Added call_response, response_message, call_timeout_at, call_initiated_at fields');
        console.log('   - Added constraint for valid call response values');
        console.log('   - Added indexes for efficient querying');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

async function down() {
    try {
        console.log('Rolling back instant call response tracking migration...');
        
        // Remove indexes
        await pool.query(`
            DROP INDEX IF EXISTS idx_meetings_call_response_pending;
        `);
        
        await pool.query(`
            DROP INDEX IF EXISTS idx_meetings_call_timeout;
        `);
        
        // Remove constraint
        await pool.query(`
            ALTER TABLE meetings 
            DROP CONSTRAINT IF EXISTS meetings_call_response_check;
        `);
        
        // Remove columns
        await pool.query(`
            ALTER TABLE meetings 
            DROP COLUMN IF EXISTS call_response,
            DROP COLUMN IF EXISTS response_message,
            DROP COLUMN IF EXISTS call_timeout_at,
            DROP COLUMN IF EXISTS call_initiated_at;
        `);
        
        console.log('✅ Migration rollback completed: Removed instant call response tracking fields');
        
    } catch (error) {
        console.error('❌ Migration rollback failed:', error);
        throw error;
    }
}

export { up, down };
