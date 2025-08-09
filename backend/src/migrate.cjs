/**
 * CommonJS migration runner for meetings table to users table migration
 */
const { Pool } = require('pg');
require('dotenv').config();

// Database connection - Use the same config as the backend
const pool = new Pool({
  user: process.env.DB_USER || 'user',
  host: process.env.DB_HOST || 'db', 
  database: process.env.DB_DATABASE || 'talktimedb_dev',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

console.log('Database config:', {
  user: process.env.DB_USER || 'user',
  host: process.env.DB_HOST || 'db',
  database: process.env.DB_DATABASE || 'talktimedb_dev',
  port: process.env.DB_PORT || 5432
});

// Run the migration
async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting migration: Update meetings.student_id FK from students(id) to users(id)');
    
    // Begin transaction
    await client.query('BEGIN');
    
    // Step 1: Check if legacy students table exists and has data
    console.log('📋 Step 1: Checking legacy students table...');
    const studentsCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'students'
      ) as table_exists;
    `);
    
    if (!studentsCheck.rows[0].table_exists) {
      console.log('⚠️  Legacy students table does not exist. Migration may not be needed.');
      await client.query('ROLLBACK');
      return;
    }
    
    const studentsCount = await client.query('SELECT COUNT(*) FROM students');
    console.log(`📊 Found ${studentsCount.rows[0].count} records in legacy students table`);
    
    // Step 2: Check current meetings table structure
    console.log('📋 Step 2: Checking current meetings table structure...');
    const meetingsCheck = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'meetings' 
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);
    
    console.log('Current meetings table columns:');
    meetingsCheck.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    
    // Step 3: Check if migration is needed
    const fkCheck = await client.query(`
      SELECT 
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'meetings'
        AND kcu.column_name = 'student_id';
    `);
    
    if (fkCheck.rows.length > 0) {
      const fk = fkCheck.rows[0];
      console.log(`🔗 Current FK: ${fk.constraint_name} references ${fk.foreign_table_name}(${fk.foreign_column_name})`);
      
      if (fk.foreign_table_name === 'users') {
        console.log('✅ Migration already completed - student_id already references users table');
        await client.query('ROLLBACK');
        return;
      }
    }
    
    // Step 4: Map existing meetings from students to users
    console.log('📋 Step 4: Mapping existing meetings from students to users...');
    
    const mappingQuery = await client.query(`
      SELECT 
        m.id as meeting_id,
        m.student_id as old_student_id,
        s.admission_number,
        u.id as new_user_id,
        u.username as user_username
      FROM meetings m
      JOIN students s ON m.student_id = s.id
      LEFT JOIN users u ON u.username = s.admission_number AND u.role = 'student'
      ORDER BY m.id;
    `);
    
    console.log(`📊 Found ${mappingQuery.rows.length} meetings to migrate`);
    
    // Check for unmapped students
    const unmappedStudents = mappingQuery.rows.filter(row => !row.new_user_id);
    if (unmappedStudents.length > 0) {
      console.log(`⚠️  Warning: ${unmappedStudents.length} meetings reference students not found in users table:`);
      unmappedStudents.forEach(row => {
        console.log(`  - Meeting ${row.meeting_id}: admission_number ${row.admission_number} not found in users`);
      });
      
      // For now, we'll skip these meetings - in production you might want to handle this differently
      console.log('🔄 Proceeding with mappable meetings only...');
    }
    
    const mappableStudents = mappingQuery.rows.filter(row => row.new_user_id);
    console.log(`✅ ${mappableStudents.length} meetings can be migrated`);
    
    // Step 5: Add missing columns if they don't exist
    console.log('📋 Step 5: Adding missing columns...');
    
    const columnChecks = [
      { name: 'student_access_token', type: 'TEXT' },
      { name: 'access_token_expires_at', type: 'TIMESTAMP WITH TIME ZONE' },
      { name: 'is_instant', type: 'BOOLEAN DEFAULT FALSE' }
    ];
    
    for (const col of columnChecks) {
      const exists = meetingsCheck.rows.some(row => row.column_name === col.name);
      if (!exists) {
        console.log(`➕ Adding column: ${col.name}`);
        await client.query(`ALTER TABLE meetings ADD COLUMN ${col.name} ${col.type}`);
      } else {
        console.log(`✅ Column ${col.name} already exists`);
      }
    }
    
    // Step 6: Drop existing foreign key constraint
    if (fkCheck.rows.length > 0) {
      const constraintName = fkCheck.rows[0].constraint_name;
      console.log(`🗑️  Step 6: Dropping existing FK constraint: ${constraintName}`);
      await client.query(`ALTER TABLE meetings DROP CONSTRAINT ${constraintName}`);
    }
    
    // Step 7: Update student_id values
    console.log('📋 Step 7: Updating student_id values...');
    
    for (const mapping of mappableStudents) {
      await client.query(`
        UPDATE meetings 
        SET student_id = $1 
        WHERE id = $2
      `, [mapping.new_user_id, mapping.meeting_id]);
    }
    
    console.log(`✅ Updated ${mappableStudents.length} meeting records`);
    
    // Step 8: Add new foreign key constraint
    console.log('📋 Step 8: Adding new FK constraint to users table...');
    await client.query(`
      ALTER TABLE meetings 
      ADD CONSTRAINT meetings_student_id_fkey 
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    `);
    
    // Step 9: Update status constraint to include instant call statuses
    console.log('📋 Step 9: Updating status constraint...');
    
    // Drop existing constraint
    await client.query(`
      ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_status_check
    `);
    
    // Add updated constraint
    await client.query(`
      ALTER TABLE meetings ADD CONSTRAINT meetings_status_check 
      CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'missed', 'instant_pending', 'instant_active', 'instant_completed'))
    `);
    
    // Step 10: Verification
    console.log('📋 Step 10: Verifying migration...');
    
    const verificationQuery = await client.query(`
      SELECT 
        COUNT(*) as total_meetings,
        COUNT(CASE WHEN u.id IS NOT NULL THEN 1 END) as valid_references
      FROM meetings m
      LEFT JOIN users u ON m.student_id = u.id AND u.role = 'student'
    `);
    
    const verification = verificationQuery.rows[0];
    console.log(`📊 Verification: ${verification.valid_references}/${verification.total_meetings} meetings have valid user references`);
    
    if (verification.valid_references !== verification.total_meetings) {
      throw new Error(`Migration verification failed: ${verification.total_meetings - verification.valid_references} meetings have invalid user references`);
    }
    
    // Commit transaction
    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
    
    // Summary
    console.log('\n📋 Migration Summary:');
    console.log(`  - Updated ${mappableStudents.length} meeting records`);
    console.log(`  - Added missing columns: student_access_token, access_token_expires_at, is_instant`);
    console.log(`  - Updated FK constraint: meetings.student_id -> users(id)`);
    console.log(`  - Updated status constraint to include instant call statuses`);
    console.log(`  - All ${verification.total_meetings} meetings now reference users table`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

runMigration().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
