/**
 * Migration script to create feedback table
 */
import db from '../config/database.js';

/**
 * Create feedback table
 */
export const up = async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS feedback (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                category VARCHAR(50) NOT NULL,
                rating INTEGER CHECK (rating >= 1 AND rating <= 5),
                message TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'new',
                admin_notes TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for faster queries
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
            CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
            CREATE INDEX IF NOT EXISTS idx_feedback_category ON feedback(category);
            CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
        `);

        console.log('Feedback table created successfully');
    } catch (error) {
        console.error('Error creating feedback table:', error);
        throw error;
    }
};

/**
 * Drop feedback table
 */
export const down = async () => {
    try {
        await db.query(`
            DROP TABLE IF EXISTS feedback
        `);

        console.log('Feedback table dropped successfully');
    } catch (error) {
        console.error('Error dropping feedback table:', error);
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
