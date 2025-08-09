import pool from '../config/database.js';
import bcrypt from 'bcryptjs';

const createTestUsers = async () => {
    try {
        console.log('Creating test users...');
        
        // Hash the password for all test users
        const password = 'password';
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Create admin test user
        const adminQuery = `
            INSERT INTO users (username, full_name, email, password_hash, role)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (username) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                email = EXCLUDED.email,
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role
            RETURNING id, username, email, role;
        `;
        
        const adminResult = await pool.query(adminQuery, [
            'admin_test',
            'Admin Test User',
            'admin_test@example.com',
            passwordHash,
            'admin'
        ]);
        
        console.log('✅ Admin user created/updated:', adminResult.rows[0]);
        
        // Create volunteer test user
        const volunteerQuery = `
            INSERT INTO users (username, full_name, email, password_hash, role, volunteer_type)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (username) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                email = EXCLUDED.email,
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                volunteer_type = EXCLUDED.volunteer_type
            RETURNING id, username, email, role, volunteer_type;
        `;
        
        const volunteerResult = await pool.query(volunteerQuery, [
            'volunteer_test',
            'Volunteer Test User',
            'volunteer_test@example.com',
            passwordHash,
            'volunteer',
            'standard'
        ]);
        
        console.log('✅ Volunteer user created/updated:', volunteerResult.rows[0]);
        
        // Verify student user exists (should already exist from previous session)
        const studentQuery = `SELECT id, full_name, admission_number FROM students WHERE admission_number = $1;`;
        const studentResult = await pool.query(studentQuery, ['ADM0001']);
        
        if (studentResult.rows.length > 0) {
            console.log('✅ Student user verified:', studentResult.rows[0]);
        } else {
            console.log('⚠️ Student user not found, may need to be created separately');
        }
        
        console.log('\n🎉 Test users setup complete!');
        console.log('Login credentials:');
        console.log('Admin: admin_test@example.com / password');
        console.log('Volunteer: volunteer_test@example.com / password');
        console.log('Student: Test Student / 0001');
        
    } catch (error) {
        console.error('❌ Error creating test users:', error);
    }
};

createTestUsers().finally(() => pool.end());
