import pool from './src/config/database.js';
import bcrypt from 'bcrypt';

async function checkAndCreateStudentUser() {
  try {
    // Check if we have any users with role 'student'
    const checkQuery = 'SELECT * FROM users WHERE role = $1';
    const checkResult = await pool.query(checkQuery, ['student']);
    
    console.log('Current student users:', checkResult.rows);
    
    if (checkResult.rows.length === 0) {
      console.log('No student users found. Creating test student user...');
      
      // Create a test student user
      const hashedPassword = await bcrypt.hash('student123', 10);
      const insertQuery = `
        INSERT INTO users (username, full_name, email, password_hash, role, age, gender)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const insertResult = await pool.query(insertQuery, [
        'ADM0001',
        'Test Student',
        'student@test.com',
        hashedPassword,
        'student',
        20,
        'male'
      ]);
      
      console.log('Created student user:', insertResult.rows[0]);
    } else {
      console.log('Student users already exist.');
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

checkAndCreateStudentUser();
