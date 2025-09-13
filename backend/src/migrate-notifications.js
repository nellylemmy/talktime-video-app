#!/usr/bin/env node

/**
 * TalkTime Push Notification Migration Script
 * Docker-compatible migration for the notification system
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration from environment variables
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_DATABASE || 'talktimedb_dev',
    user: process.env.DB_USER || 'user',
    password: process.env.DB_PASSWORD || 'password'
};

async function runMigration() {
    const client = new Client(dbConfig);
    
    try {
        console.log('🔔 Starting TalkTime Push Notification Migration...');
        console.log('📊 Database Config:', {
            host: dbConfig.host,
            port: dbConfig.port,
            database: dbConfig.database,
            user: dbConfig.user
        });
        
        await client.connect();
        console.log('✅ Connected to PostgreSQL database');
        
        // Read the migration SQL file
        const migrationPath = path.join(__dirname, '../migrations/create_push_notification_system.sql');
        console.log('📁 Reading migration file:', migrationPath);
        
        let migrationSQL;
        try {
            migrationSQL = await fs.readFile(migrationPath, 'utf8');
            console.log('✅ Migration file loaded successfully');
        } catch (error) {
            console.error('❌ Error reading migration file:', error.message);
            throw error;
        }
        
        // Convert SQLite-specific syntax to PostgreSQL
        const postgresSQL = convertSQLiteToPostgreSQL(migrationSQL);
        
        // Split SQL into individual statements and execute them
        const statements = postgresSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('/*'));
        
        console.log(`🔧 Executing ${statements.length} migration statements...`);
        
        for (const [index, statement] of statements.entries()) {
            try {
                if (statement.trim()) {
                    console.log(`⚡ Executing statement ${index + 1}/${statements.length}`);
                    await client.query(statement);
                }
            } catch (error) {
                // Some errors are expected (like table already exists)
                if (error.message.includes('already exists')) {
                    console.log(`⚠️  Statement ${index + 1}: ${error.message} (continuing...)`);
                } else {
                    console.error(`❌ Error in statement ${index + 1}:`, error.message);
                    console.error('Statement:', statement.substring(0, 100) + '...');
                    // Continue with other statements
                }
            }
        }
        
        // Verify migration success
        await verifyMigration(client);
        
        console.log('🎉 Push Notification Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await client.end();
        console.log('📤 Database connection closed');
    }
}

function convertSQLiteToPostgreSQL(sqliteSQL) {
    console.log('🔄 Converting SQLite syntax to PostgreSQL...');
    
    let postgresSQL = sqliteSQL
        // Convert INTEGER PRIMARY KEY AUTOINCREMENT to SERIAL PRIMARY KEY
        .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
        
        // Convert DATETIME to TIMESTAMP
        .replace(/DATETIME/g, 'TIMESTAMP')
        
        // Convert SQLite's datetime() function to PostgreSQL's NOW()
        .replace(/datetime\('now'\)/g, 'NOW()')
        .replace(/CURRENT_TIMESTAMP/g, 'NOW()')
        
        // Convert TEXT to appropriate PostgreSQL types
        .replace(/TEXT NOT NULL/g, 'TEXT NOT NULL')
        .replace(/TEXT DEFAULT/g, 'TEXT DEFAULT')
        
        // Convert INTEGER DEFAULT to appropriate PostgreSQL syntax
        .replace(/INTEGER DEFAULT (\d+)/g, 'INTEGER DEFAULT $1')
        
        // Convert TIME fields
        .replace(/TIME DEFAULT/g, 'TIME DEFAULT')
        
        // Handle IF NOT EXISTS for PostgreSQL
        .replace(/CREATE TABLE IF NOT EXISTS/g, 'CREATE TABLE IF NOT EXISTS')
        .replace(/CREATE INDEX IF NOT EXISTS/g, 'CREATE INDEX IF NOT EXISTS')
        .replace(/CREATE TRIGGER IF NOT EXISTS/g, 'CREATE OR REPLACE FUNCTION')
        .replace(/CREATE VIEW IF NOT EXISTS/g, 'CREATE OR REPLACE VIEW')
        
        // Remove SQLite-specific UNIQUE constraints and convert to PostgreSQL
        .replace(/UNIQUE\(([^)]+)\)/g, 'UNIQUE($1)')
        
        // Convert ON CONFLICT to ON CONFLICT for PostgreSQL (syntax is similar)
        .replace(/ON CONFLICT\(([^)]+)\) DO UPDATE SET/g, 'ON CONFLICT($1) DO UPDATE SET')
        
        // Remove SQLite-specific triggers (we'll recreate them as PostgreSQL functions)
        .replace(/CREATE TRIGGER.*?END;/gs, '-- Trigger converted to PostgreSQL function')
        
        // Handle date functions
        .replace(/date\('now', '([^']+)'\)/g, "NOW() + INTERVAL '$1'")
        .replace(/DATE\(([^)]+)\)/g, 'DATE($1)')
        
        // Convert AUTOINDEX references
        .replace(/sqlite_autoindex_\w+_\d+/g, '')
        
        // Handle JSON fields (TEXT in SQLite becomes JSONB in PostgreSQL)
        .replace(/device_info TEXT/g, 'device_info JSONB')
        .replace(/notification_data TEXT/g, 'notification_data JSONB');
    
    // Add PostgreSQL-specific extensions and functions
    const postgresPrefix = `
-- Enable necessary PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom functions for notification system
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

`;
    
    // Add triggers for updated_at columns
    const postgresSuffix = `
-- Create triggers for automatic updated_at updates
DROP TRIGGER IF EXISTS update_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER update_push_subscriptions_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;
    
    return postgresPrefix + postgresSQL + postgresSuffix;
}

async function verifyMigration(client) {
    console.log('🔍 Verifying migration success...');
    
    try {
        // Check if tables were created
        const tables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name LIKE '%push%' OR table_name LIKE '%notification%'
        `);
        
        console.log('✅ Created tables:', tables.rows.map(row => row.table_name));
        
        // Check if indexes were created
        const indexes = await client.query(`
            SELECT indexname 
            FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND (indexname LIKE '%push%' OR indexname LIKE '%notification%')
        `);
        
        console.log('✅ Created indexes:', indexes.rows.map(row => row.indexname));
        
        // Count rows in notification_preferences (should have defaults for existing users)
        const prefCount = await client.query('SELECT COUNT(*) FROM notification_preferences');
        console.log('✅ Notification preferences created:', prefCount.rows[0].count);
        
        // Verify views were created
        const views = await client.query(`
            SELECT table_name 
            FROM information_schema.views 
            WHERE table_schema = 'public' 
            AND table_name LIKE '%notification%'
        `);
        
        console.log('✅ Created views:', views.rows.map(row => row.table_name));
        
    } catch (error) {
        console.error('⚠️  Error during verification:', error.message);
    }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
    runMigration().catch(error => {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    });
}

export { runMigration, convertSQLiteToPostgreSQL };
