/**
 * Script to run the instant call response tracking migration
 */
import { up } from './migrations/add-instant-call-responses.js';

async function runMigration() {
    try {
        console.log('🚀 Running instant call response tracking migration...');
        await up();
        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
