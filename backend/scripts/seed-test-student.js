import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../src/config/database.js';

// Configure environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function createTestStudent() {
  try {
    console.log('Creating test student...');
    
    const studentData = {
      fullName: 'Beatrice Wanjiku',
      admissionNumber: '0002',
      age: 15,
      gender: 'female',
      bio: 'Test student for development',
      story: 'This is a test student account for development and testing purposes.',
      photoUrl: '/images/students/default-profile.jpg',
      gallery: []
    };

    // Check if student already exists
    const checkQuery = 'SELECT * FROM students WHERE admission_number = $1';
    const { rows: existingStudents } = await pool.query(checkQuery, [studentData.admissionNumber]);
    
    if (existingStudents.length > 0) {
      console.log(`Student with admission number ${studentData.admissionNumber} already exists.`);
      return existingStudents[0];
    }

    // Insert new student
    const insertQuery = `
      INSERT INTO students (
        full_name, admission_number, age, gender, bio, story, photo_url, gallery, is_available
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    
    const values = [
      studentData.fullName,
      studentData.admissionNumber,
      studentData.age,
      studentData.gender,
      studentData.bio,
      studentData.story,
      studentData.photoUrl,
      studentData.gallery,
      true  // is_available
    ];

    const { rows } = await pool.query(insertQuery, values);
    console.log('Test student created successfully:', rows[0]);
    return rows[0];
  } catch (error) {
    console.error('Error creating test student:', error);
    throw error;
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Run the script
createTestStudent()
  .then(() => {
    console.log('Test student creation completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
