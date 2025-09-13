import pool from './src/config/database.js';
import fs from 'fs';

async function runMigration() {
    try {
        const migration = fs.readFileSync('./migrations/create_newsletter_subscriptions.sql', 'utf8');
        await pool.query(migration);
        console.log('✅ Newsletter subscription tables created successfully');
    } catch (error) {
        console.log('ℹ️ Migration result:', error.message);
    } finally {
        pool.end();
    }
}

runMigration();
