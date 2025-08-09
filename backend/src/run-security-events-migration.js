/**
 * Script to run the security events table migration
 */
import { up } from './migrations/add-security-events.js';

async function runMigration() {
    try {
        console.log('🚀 Running security events table migration...');
        await up();
        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
