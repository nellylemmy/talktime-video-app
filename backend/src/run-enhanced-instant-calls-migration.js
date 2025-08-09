/**
 * Migration runner for enhanced instant call features
 */
import { up } from './migrations/add-enhanced-instant-calls.js';
import pool from './config/database.js';

async function runMigration() {
    try {
        console.log('🚀 Starting enhanced instant call features migration...');
        await up();
        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
