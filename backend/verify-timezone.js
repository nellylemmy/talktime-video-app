import pool from './src/config/database.js';

async function verifyTimezoneData() {
    try {
        const query = 'SELECT username, full_name, email, timezone, created_at FROM users WHERE email = $1 ORDER BY created_at DESC LIMIT 1';
        const result = await pool.query(query, ['john.test@example.com']);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            console.log('✅ User created successfully with timezone data:');
            console.log('Username:', user.username);
            console.log('Full Name:', user.full_name);
            console.log('Email:', user.email);
            console.log('Timezone:', user.timezone);
            console.log('Created At:', user.created_at);
        } else {
            console.log('❌ User not found in database');
        }
    } catch (error) {
        console.error('Database verification error:', error.message);
    } finally {
        pool.end();
    }
}

verifyTimezoneData();
