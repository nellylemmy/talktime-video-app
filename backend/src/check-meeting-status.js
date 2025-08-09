/**
 * Script to check existing meeting status values
 */
import pool from './config/database.js';

async function checkStatus() {
    try {
        console.log('🔍 Checking existing meeting status values...');
        const result = await pool.query('SELECT DISTINCT status FROM meetings ORDER BY status');
        console.log('📊 Found status values:', result.rows.map(row => row.status));
        
        // Also check count of each status
        const countResult = await pool.query('SELECT status, COUNT(*) as count FROM meetings GROUP BY status ORDER BY status');
        console.log('📈 Status counts:');
        countResult.rows.forEach(row => {
            console.log(`   ${row.status}: ${row.count}`);
        });
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error checking status:', error);
        process.exit(1);
    }
}

checkStatus();
