/**
 * One-time migration runner for the notifications table
 */
import { up } from './migrations/create-notifications-table.js';

// Run the migration
async function runMigration() {
  try {
    console.log('Starting migration: create-notifications-table');
    await up();
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
