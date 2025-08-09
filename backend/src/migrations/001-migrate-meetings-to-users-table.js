/**
 * Migration: Update meetings table to reference users table instead of legacy students table
 * 
 * This migration:
 * 1. Maps existing meetings.student_id from students.id to users.id (where role='student')
 * 2. Updates the foreign key constraint to reference users(id)
 * 3. Adds missing columns for meeting access tokens if they don't exist
 * 4. Preserves all existing meeting data
 */

import pool from '../config/database.js';

const runMigration = async () => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log('🔄 Starting migration: meetings table to users table...');
        
        // Step 1: Check if students table exists and has data
        const studentsExist = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'students'
            );
        `);
        
        if (studentsExist.rows[0].exists) {
            console.log('📋 Found legacy students table, mapping to users...');
            
            // Step 2: Create mapping from students to users based on admission_number/username
            const mappingQuery = `
                SELECT 
                    s.id as old_student_id,
                    u.id as new_user_id,
                    s.admission_number,
                    u.username,
                    s.full_name,
                    u.full_name as user_full_name
                FROM students s
                JOIN users u ON (
                    u.username = s.admission_number 
                    OR u.username LIKE s.admission_number || '%'
                    OR s.admission_number LIKE u.username || '%'
                )
                WHERE u.role = 'student';
            `;
            
            const mappingResult = await client.query(mappingQuery);
            console.log(`📊 Found ${mappingResult.rows.length} student mappings`);
            
            if (mappingResult.rows.length > 0) {
                // Step 3: Update meetings.student_id to reference users.id
                for (const mapping of mappingResult.rows) {
                    const updateResult = await client.query(`
                        UPDATE meetings 
                        SET student_id = $1 
                        WHERE student_id = $2
                    `, [mapping.new_user_id, mapping.old_student_id]);
                    
                    if (updateResult.rowCount > 0) {
                        console.log(`✅ Updated ${updateResult.rowCount} meetings for student: ${mapping.user_full_name} (${mapping.username})`);
                    }
                }
            }
        } else {
            console.log('ℹ️  No legacy students table found, assuming clean installation');
        }
        
        // Step 4: Drop existing foreign key constraint
        console.log('🔧 Updating foreign key constraints...');
        
        // Find the constraint name
        const constraintQuery = `
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'meetings' 
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name LIKE '%student_id%';
        `;
        
        const constraintResult = await client.query(constraintQuery);
        
        if (constraintResult.rows.length > 0) {
            const constraintName = constraintResult.rows[0].constraint_name;
            await client.query(`ALTER TABLE meetings DROP CONSTRAINT ${constraintName};`);
            console.log(`🗑️  Dropped old constraint: ${constraintName}`);
        }
        
        // Step 5: Add new foreign key constraint to users table
        await client.query(`
            ALTER TABLE meetings 
            ADD CONSTRAINT meetings_student_id_fkey 
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
        `);
        console.log('✅ Added new foreign key constraint: meetings.student_id -> users.id');
        
        // Step 6: Add meeting access token columns if they don't exist
        const tokenColumnsExist = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'meetings' 
            AND column_name IN ('student_access_token', 'access_token_expires_at');
        `);
        
        const existingColumns = tokenColumnsExist.rows.map(row => row.column_name);
        
        if (!existingColumns.includes('student_access_token')) {
            await client.query(`
                ALTER TABLE meetings 
                ADD COLUMN student_access_token VARCHAR(255) UNIQUE;
            `);
            console.log('✅ Added student_access_token column');
        }
        
        if (!existingColumns.includes('access_token_expires_at')) {
            await client.query(`
                ALTER TABLE meetings 
                ADD COLUMN access_token_expires_at TIMESTAMP WITH TIME ZONE;
            `);
            console.log('✅ Added access_token_expires_at column');
        }
        
        // Step 7: Add is_instant column if it doesn't exist (for instant calls)
        if (!existingColumns.includes('is_instant')) {
            await client.query(`
                ALTER TABLE meetings 
                ADD COLUMN is_instant BOOLEAN DEFAULT FALSE;
            `);
            console.log('✅ Added is_instant column');
        }
        
        // Step 8: Update status check constraint to include new statuses
        await client.query(`
            ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_status_check;
        `);
        
        await client.query(`
            ALTER TABLE meetings 
            ADD CONSTRAINT meetings_status_check 
            CHECK (status IN ('scheduled', 'completed', 'canceled', 'pending', 'active', 'declined'));
        `);
        console.log('✅ Updated status constraint with instant call statuses');
        
        await client.query('COMMIT');
        console.log('🎉 Migration completed successfully!');
        
        // Step 9: Verify the migration
        const verificationQuery = `
            SELECT 
                COUNT(*) as total_meetings,
                COUNT(CASE WHEN u.role = 'student' THEN 1 END) as valid_student_meetings
            FROM meetings m
            LEFT JOIN users u ON m.student_id = u.id
        `;
        
        const verification = await client.query(verificationQuery);
        const { total_meetings, valid_student_meetings } = verification.rows[0];
        
        console.log(`📊 Verification: ${valid_student_meetings}/${total_meetings} meetings have valid student references`);
        
        if (parseInt(total_meetings) > 0 && parseInt(valid_student_meetings) !== parseInt(total_meetings)) {
            console.warn('⚠️  Warning: Some meetings may have invalid student references');
        }
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runMigration()
        .then(() => {
            console.log('Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

export default runMigration;
