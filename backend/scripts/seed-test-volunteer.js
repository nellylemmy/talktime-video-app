import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import pool from '../src/config/database.js';

// Configure environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function createTestVolunteer() {
  try {
    console.log('Creating test volunteer...');
    
    const volunteerData = {
      username: 'testvolunteer',
      name: 'Test Volunteer',
      email: 'test@volunteer.com',
      password: 'password123',
      role: 'volunteer',
      volunteerType: 'standard'
    };

    // Check if volunteer already exists
    const checkQuery = 'SELECT * FROM users WHERE email = $1';
    const { rows: existingVolunteers } = await pool.query(checkQuery, [volunteerData.email]);
    
    if (existingVolunteers.length > 0) {
      console.log(`Volunteer with email ${volunteerData.email} already exists.`);
      return existingVolunteers[0];
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(volunteerData.password, saltRounds);

    // Insert new volunteer
    const insertQuery = `
      INSERT INTO users (
        username, full_name, email, password_hash, role, volunteer_type, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *;
    `;
    
    const values = [
      volunteerData.username,
      volunteerData.name,
      volunteerData.email,
      hashedPassword,
      volunteerData.role,
      volunteerData.volunteerType
    ];

    const { rows } = await pool.query(insertQuery, values);
    console.log('Test volunteer created successfully:', {
      id: rows[0].id,
      full_name: rows[0].full_name,
      email: rows[0].email,
      role: rows[0].role,
      volunteer_type: rows[0].volunteer_type
    });
    console.log('Login credentials:');
    console.log('Email:', volunteerData.email);
    console.log('Password:', volunteerData.password);
    return rows[0];
  } catch (error) {
    console.error('Error creating test volunteer:', error);
    throw error;
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Run the script
createTestVolunteer()
  .then(() => {
    console.log('Test volunteer creation completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
