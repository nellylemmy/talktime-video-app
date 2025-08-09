/**
 * Script to create an admin account in the database
 */
import pool from './config/database.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

// Get the admin secret code from environment variables or use default for development
const ADMIN_SECRET_CODE = process.env.ADMIN_SECRET_CODE || '123456';

async function createAdminAccount() {
  try {
    console.log('Creating admin account in the database...');
    
    // Admin account details
    const adminData = {
      username: 'admin@talktime.org',
      full_name: 'ADEA Admin',
      email: 'admin@talktime.org',
      password: 'adminpassword', // This would be more secure in production
      role: 'admin',
      is_approved: true
    };
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminData.password, salt);
    
    // Check if admin already exists
    const checkResult = await pool.query('SELECT * FROM users WHERE email = $1', [adminData.email]);
    
    if (checkResult.rows.length > 0) {
      console.log('Admin account already exists with this email.');
      return;
    }
    
    // Insert the admin user
    const result = await pool.query(`
      INSERT INTO users (username, full_name, email, password_hash, role, is_approved)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, full_name, email, role, is_approved
    `, [
      adminData.username,
      adminData.full_name,
      adminData.email,
      hashedPassword,
      adminData.role,
      adminData.is_approved
    ]);
    
    if (result.rows.length > 0) {
      const admin = result.rows[0];
      console.log('Admin account created successfully:');
      console.log(`  ID: ${admin.id}`);
      console.log(`  Name: ${admin.full_name}`);
      console.log(`  Username: ${admin.username}`);
      console.log(`  Email: ${admin.email}`);
      console.log(`  Role: ${admin.role}`);
      console.log(`  Approved: ${admin.is_approved ? 'Yes' : 'No'}`);
      
      // Store the admin secret code in .env if not already there
      console.log(`\nAdmin secret code: ${ADMIN_SECRET_CODE}`);
      console.log('Make sure this code is stored in your .env file as ADMIN_SECRET_CODE.');
    } else {
      console.log('Failed to create admin account.');
    }
  } catch (error) {
    console.error('Error creating admin account:', error);
  } finally {
    // Close the database connection
    pool.end();
  }
}

// Run the function
createAdminAccount();
