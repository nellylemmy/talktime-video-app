/**
 * Migration script to create appeals table
 */
import db from '../config/database.js';

/**
 * Create appeals table
 */
export const up = async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS appeals (
                id SERIAL PRIMARY KEY,
                volunteer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                admin_response TEXT,
                admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                cancelled_count INTEGER NOT NULL DEFAULT 0,
                missed_count INTEGER NOT NULL DEFAULT 0,
                total_scheduled INTEGER NOT NULL DEFAULT 0,
                reputation_score INTEGER NOT NULL DEFAULT 0,
                resolved_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for faster queries
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_appeals_volunteer_id ON appeals(volunteer_id);
            CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status);
            CREATE INDEX IF NOT EXISTS idx_appeals_created_at ON appeals(created_at DESC);
        `);

        console.log('Appeals table created successfully');
    } catch (error) {
        console.error('Error creating appeals table:', error);
        throw error;
    }
};

/**
 * Drop appeals table
 */
export const down = async () => {
    try {
        await db.query(`
            DROP TABLE IF EXISTS appeals
        `);

        console.log('Appeals table dropped successfully');
    } catch (error) {
        console.error('Error dropping appeals table:', error);
        throw error;
    }
};

// Run migration if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
    up()
        .then(() => {
            console.log('Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}
