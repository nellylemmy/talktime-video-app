import pool from '../config/database.js';

/**
 * Migration script to add first_name and last_name columns to students table
 * and populate them from the existing full_name column
 */
const migrateStudentNames = async () => {
  try {
    console.log('Starting migration: Adding first_name and last_name columns to students table...');
    
    // Check if columns already exist
    const checkColumnsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'students' 
      AND column_name IN ('first_name', 'last_name');
    `;
    const { rows: existingColumns } = await pool.query(checkColumnsQuery);
    
    if (existingColumns.length === 2) {
      console.log('Migration already applied. Columns first_name and last_name already exist.');
      return;
    }
    
    // Add the new columns if they don't exist
    if (!existingColumns.find(col => col.column_name === 'first_name')) {
      await pool.query(`ALTER TABLE students ADD COLUMN first_name VARCHAR(100);`);
      console.log('Added first_name column');
    }
    
    if (!existingColumns.find(col => col.column_name === 'last_name')) {
      await pool.query(`ALTER TABLE students ADD COLUMN last_name VARCHAR(100);`);
      console.log('Added last_name column');
    }
    
    // Get all students
    const { rows: students } = await pool.query('SELECT id, full_name FROM students;');
    console.log(`Found ${students.length} students to migrate`);
    
    // Update each student with first_name and last_name extracted from full_name
    for (const student of students) {
      const nameParts = student.full_name.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');
      
      await pool.query(
        'UPDATE students SET first_name = $1, last_name = $2 WHERE id = $3',
        [firstName, lastName, student.id]
      );
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  }
};

// Run the migration
migrateStudentNames().finally(() => pool.end());
