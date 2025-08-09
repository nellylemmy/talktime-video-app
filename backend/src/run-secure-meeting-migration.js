/**
 * Script to run the secure meeting access migration
 */
import { up } from './migrations/add-secure-meeting-access.js';

async function runMigration() {
    try {
        console.log('🚀 Running secure meeting access migration...');
        await up();
        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
