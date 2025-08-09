#!/usr/bin/env node

/**
 * Complete Database Migration: Unified Authentication System
 * 
 * This script migrates the TalkTime database to use a unified authentication system
 * where all user references point to the `users` table instead of the legacy `students` table.
 * 
 * Migration Steps:
 * 1. Update meetings table to reference users.id for student_id
 * 2. Update all related tables to use unified user references
 * 3. Verify data integrity after migration
 * 4. Create backup before migration
 */

import pool from './src/config/database.js';
import fs from 'fs';
import path from 'path';

async function createBackup() {
    console.log('📦 Creating database backup before migration...');
    
    try {
        // Export current meetings data
        const meetingsBackup = await pool.query(`
            SELECT m.*, s.full_name as student_name, u.full_name as volunteer_name
            FROM meetings m
            LEFT JOIN students s ON m.student_id = s.id
            LEFT JOIN users u ON m.volunteer_id = u.id
            ORDER BY m.id
        `);
        
        // Save backup to file
        const backupData = {
            timestamp: new Date().toISOString(),
            meetings: meetingsBackup.rows,
            migration_version: '1.0.0'
        };
        
        const backupPath = path.join(process.cwd(), `database-backup-${Date.now()}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
        
        console.log(`✅ Database backup created: ${backupPath}`);
        console.log(`📊 Backed up ${meetingsBackup.rows.length} meetings`);
        
        return backupPath;
    } catch (error) {
        console.error('❌ Error creating backup:', error);
        throw error;
    }
}

async function verifyDataIntegrity() {
    console.log('🔍 Verifying data integrity before migration...');
    
    try {
        // Check for orphaned student references
        const orphanedStudents = await pool.query(`
            SELECT m.id, m.student_id
            FROM meetings m
            LEFT JOIN students s ON m.student_id = s.id
            WHERE s.id IS NULL
        `);
        
        if (orphanedStudents.rows.length > 0) {
            console.warn(`⚠️  Found ${orphanedStudents.rows.length} meetings with orphaned student references`);
            orphanedStudents.rows.forEach(row => {
                console.warn(`   Meeting ID ${row.id} references non-existent student_id ${row.student_id}`);
            });
        }
        
        // Check student-user mapping
        const studentUserMapping = await pool.query(`
            SELECT s.id as student_id, s.full_name, u.id as user_id
            FROM students s
            LEFT JOIN users u ON s.full_name = u.full_name AND u.role = 'student'
            ORDER BY s.id
        `);
        
        const unmappedStudents = studentUserMapping.rows.filter(row => !row.user_id);
        if (unmappedStudents.length > 0) {
            console.warn(`⚠️  Found ${unmappedStudents.length} students without corresponding user records:`);
            unmappedStudents.forEach(student => {
                console.warn(`   Student "${student.full_name}" (ID: ${student.student_id}) has no user record`);
            });
        }
        
        console.log(`✅ Data integrity check complete`);
        console.log(`📊 ${studentUserMapping.rows.length} total students checked`);
        console.log(`📊 ${studentUserMapping.rows.length - unmappedStudents.length} students have user mappings`);
        
        return {
            orphanedMeetings: orphanedStudents.rows,
            unmappedStudents: unmappedStudents,
            totalStudents: studentUserMapping.rows.length
        };
    } catch (error) {
        console.error('❌ Error verifying data integrity:', error);
        throw error;
    }
}

async function migrateMeetingsTable() {
    console.log('🔄 Migrating meetings table to use unified user references...');
    
    try {
        // Step 1: Add temporary column for new user-based student references
        console.log('   📝 Adding temporary student_user_id column...');
        await pool.query(`
            ALTER TABLE meetings 
            ADD COLUMN IF NOT EXISTS student_user_id INT REFERENCES users(id)
        `);
        
        // Step 2: Populate the new column with user IDs
        console.log('   🔄 Populating student_user_id with user references...');
        const updateResult = await pool.query(`
            UPDATE meetings 
            SET student_user_id = u.id
            FROM students s
            JOIN users u ON s.full_name = u.full_name AND u.role = 'student'
            WHERE meetings.student_id = s.id
        `);
        
        console.log(`   ✅ Updated ${updateResult.rowCount} meeting records with user references`);
        
        // Step 3: Verify all meetings have been mapped
        const unmappedMeetings = await pool.query(`
            SELECT id, student_id 
            FROM meetings 
            WHERE student_user_id IS NULL
        `);
        
        if (unmappedMeetings.rows.length > 0) {
            console.error(`❌ ${unmappedMeetings.rows.length} meetings could not be mapped to users:`);
            unmappedMeetings.rows.forEach(meeting => {
                console.error(`   Meeting ID ${meeting.id} with student_id ${meeting.student_id}`);
            });
            throw new Error('Migration failed: Some meetings could not be mapped to users');
        }
        
        // Step 4: Drop the old foreign key constraint
        console.log('   🗑️  Dropping old student_id foreign key constraint...');
        await pool.query(`
            ALTER TABLE meetings 
            DROP CONSTRAINT IF EXISTS meetings_student_id_fkey
        `);
        
        // Step 5: Drop the old student_id column
        console.log('   🗑️  Dropping old student_id column...');
        await pool.query(`
            ALTER TABLE meetings 
            DROP COLUMN IF EXISTS student_id
        `);
        
        // Step 6: Rename the new column to student_id
        console.log('   📝 Renaming student_user_id to student_id...');
        await pool.query(`
            ALTER TABLE meetings 
            RENAME COLUMN student_user_id TO student_id
        `);
        
        // Step 7: Add NOT NULL constraint to the new column
        console.log('   🔒 Adding NOT NULL constraint to student_id...');
        await pool.query(`
            ALTER TABLE meetings 
            ALTER COLUMN student_id SET NOT NULL
        `);
        
        console.log('✅ Meetings table migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Error migrating meetings table:', error);
        throw error;
    }
}

async function migrateRelatedTables() {
    console.log('🔄 Migrating related tables to use unified user references...');
    
    try {
        // Check if call_history table exists and needs migration
        const callHistoryExists = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'call_history'
            )
        `);
        
        if (callHistoryExists.rows[0].exists) {
            console.log('   🔄 Migrating call_history table...');
            
            // Add temporary column
            await pool.query(`
                ALTER TABLE call_history 
                ADD COLUMN IF NOT EXISTS student_user_id INT REFERENCES users(id)
            `);
            
            // Populate with user references
            const callHistoryUpdate = await pool.query(`
                UPDATE call_history 
                SET student_user_id = u.id
                FROM students s
                JOIN users u ON s.full_name = u.full_name AND u.role = 'student'
                WHERE call_history.student_id = s.id
            `);
            
            console.log(`   ✅ Updated ${callHistoryUpdate.rowCount} call_history records`);
            
            // Replace old column
            await pool.query(`ALTER TABLE call_history DROP CONSTRAINT IF EXISTS call_history_student_id_fkey`);
            await pool.query(`ALTER TABLE call_history DROP COLUMN IF EXISTS student_id`);
            await pool.query(`ALTER TABLE call_history RENAME COLUMN student_user_id TO student_id`);
            await pool.query(`ALTER TABLE call_history ALTER COLUMN student_id SET NOT NULL`);
        }
        
        console.log('✅ Related tables migration completed!');
        
    } catch (error) {
        console.error('❌ Error migrating related tables:', error);
        throw error;
    }
}

async function verifyMigration() {
    console.log('🔍 Verifying migration results...');
    
    try {
        // Check meetings table structure
        const meetingsSchema = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'meetings' AND column_name = 'student_id'
        `);
        
        console.log('   📊 Meetings table student_id column:', meetingsSchema.rows[0]);
        
        // Check foreign key constraints
        const constraints = await pool.query(`
            SELECT conname, contype
            FROM pg_constraint
            WHERE conrelid = 'meetings'::regclass
            AND conname LIKE '%student%'
        `);
        
        console.log('   🔗 Student-related constraints:', constraints.rows);
        
        // Test a sample query with the new structure
        const sampleQuery = await pool.query(`
            SELECT m.id, m.student_id, u.full_name as student_name, u.role
            FROM meetings m
            JOIN users u ON m.student_id = u.id
            WHERE u.role = 'student'
            LIMIT 5
        `);
        
        console.log(`   ✅ Sample query successful: ${sampleQuery.rows.length} meetings found`);
        sampleQuery.rows.forEach(row => {
            console.log(`      Meeting ${row.id}: Student "${row.student_name}" (User ID: ${row.student_id})`);
        });
        
        console.log('✅ Migration verification completed successfully!');
        
    } catch (error) {
        console.error('❌ Error verifying migration:', error);
        throw error;
    }
}

async function main() {
    console.log('🚀 Starting Complete Database Migration to Unified Authentication System');
    console.log('=' .repeat(80));
    
    try {
        // Step 1: Create backup
        const backupPath = await createBackup();
        
        // Step 2: Verify data integrity
        const integrityCheck = await verifyDataIntegrity();
        
        if (integrityCheck.unmappedStudents.length > 0) {
            console.log('⚠️  Warning: Some students don\'t have user records. Migration will skip these.');
            console.log('   Consider running the JWT migration script first if needed.');
        }
        
        // Step 3: Migrate meetings table
        await migrateMeetingsTable();
        
        // Step 4: Migrate related tables
        await migrateRelatedTables();
        
        // Step 5: Verify migration
        await verifyMigration();
        
        console.log('=' .repeat(80));
        console.log('🎉 Database migration completed successfully!');
        console.log(`📦 Backup saved to: ${backupPath}`);
        console.log('');
        console.log('Next steps:');
        console.log('1. Update backend controllers to use the new unified system');
        console.log('2. Test student authentication and dashboard functionality');
        console.log('3. Remove any remaining legacy authentication code');
        
    } catch (error) {
        console.error('💥 Migration failed:', error);
        console.log('');
        console.log('Recovery steps:');
        console.log('1. Check the backup file for data recovery if needed');
        console.log('2. Review the error message above');
        console.log('3. Fix the issue and re-run the migration');
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the migration
main().catch(console.error);
