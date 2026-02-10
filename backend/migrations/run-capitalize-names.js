/**
 * Migration script to capitalize existing names in the database
 * Uses the same capitalizeName function used by the application
 * Run with: node migrations/run-capitalize-names.js
 */

import pool from '../src/config/database.js';
import { capitalizeName } from '../src/utils/nameUtils.js';

async function migrateNames() {
    console.log('Starting name capitalization migration...');

    try {
        // Get all users with their current names
        const usersResult = await pool.query(
            'SELECT id, full_name FROM users WHERE full_name IS NOT NULL'
        );

        let usersUpdated = 0;

        for (const user of usersResult.rows) {
            const capitalizedName = capitalizeName(user.full_name);

            if (capitalizedName !== user.full_name) {
                await pool.query(
                    'UPDATE users SET full_name = $1 WHERE id = $2',
                    [capitalizedName, user.id]
                );
                console.log(`Updated user ${user.id}: "${user.full_name}" -> "${capitalizedName}"`);
                usersUpdated++;
            }
        }

        console.log(`\nUsers updated: ${usersUpdated} of ${usersResult.rows.length}`);

        // Check if students table exists and has guardian_name column
        const studentsCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'students' AND column_name = 'guardian_name'
            );
        `);

        if (studentsCheck.rows[0].exists) {
            const studentsResult = await pool.query(
                'SELECT id, guardian_name FROM students WHERE guardian_name IS NOT NULL'
            );

            let guardiansUpdated = 0;

            for (const student of studentsResult.rows) {
                const capitalizedName = capitalizeName(student.guardian_name);

                if (capitalizedName !== student.guardian_name) {
                    await pool.query(
                        'UPDATE students SET guardian_name = $1 WHERE id = $2',
                        [capitalizedName, student.id]
                    );
                    console.log(`Updated guardian ${student.id}: "${student.guardian_name}" -> "${capitalizedName}"`);
                    guardiansUpdated++;
                }
            }

            console.log(`Guardian names updated: ${guardiansUpdated} of ${studentsResult.rows.length}`);
        }

        console.log('\nName capitalization migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrateNames();
