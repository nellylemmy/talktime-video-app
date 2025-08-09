/**
 * Migration to add instant call fields to the meetings table
 * This adds:
 * - is_instant: boolean field to indicate if a meeting is an instant call
 * - Updates the status enum to include 'pending' and 'declined' values
 */
import pool from '../config/database.js';

async function up() {
    try {
        // First, add the is_instant column to the meetings table
        await pool.query(`
            ALTER TABLE meetings 
            ADD COLUMN is_instant BOOLEAN DEFAULT FALSE;
        `);
        
        // Then update the status enum type to include new statuses
        await pool.query(`
            ALTER TABLE meetings 
            DROP CONSTRAINT IF EXISTS meetings_status_check;
        `);
        
        await pool.query(`
            ALTER TABLE meetings 
            ADD CONSTRAINT meetings_status_check 
            CHECK (status IN ('scheduled', 'active', 'completed', 'canceled', 'pending', 'declined'));
        `);
        
        console.log('Migration: Added is_instant field and updated status enum in meetings table');
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
}

async function down() {
    try {
        // Remove the is_instant column
        await pool.query(`
            ALTER TABLE meetings 
            DROP COLUMN IF EXISTS is_instant;
        `);
        
        // Revert the status enum
        await pool.query(`
            ALTER TABLE meetings 
            DROP CONSTRAINT IF EXISTS meetings_status_check;
        `);
        
        await pool.query(`
            ALTER TABLE meetings 
            ADD CONSTRAINT meetings_status_check 
            CHECK (status IN ('scheduled', 'active', 'completed', 'canceled'));
        `);
        
        console.log('Migration: Removed is_instant field and reverted status enum in meetings table');
    } catch (error) {
        console.error('Migration rollback failed:', error);
        throw error;
    }
}

export { up, down };
