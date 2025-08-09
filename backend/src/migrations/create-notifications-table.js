/**
 * Migration script to create notifications table
 */
import db from '../config/database.js';

/**
 * Create notifications table
 */
export const up = async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id VARCHAR(255) PRIMARY KEY,
                user_id INTEGER NOT NULL,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                meeting_id INTEGER,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                priority VARCHAR(20) NOT NULL DEFAULT 'medium',
                channel VARCHAR(50),
                scheduled_for TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            )
        `);
        
        // Create index for faster queries
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
            CREATE INDEX IF NOT EXISTS idx_notifications_meeting_id ON notifications(meeting_id);
            CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_for ON notifications(scheduled_for);
        `);
        
        console.log('Notifications table created successfully');
    } catch (error) {
        console.error('Error creating notifications table:', error);
        throw error;
    }
};

/**
 * Drop notifications table
 */
export const down = async () => {
    try {
        await db.query(`
            DROP TABLE IF EXISTS notifications
        `);
        
        console.log('Notifications table dropped successfully');
    } catch (error) {
        console.error('Error dropping notifications table:', error);
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
