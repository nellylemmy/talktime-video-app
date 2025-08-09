/**
 * Script to get Ann Keresa student information
 */
import pool from './config/database.js';

async function getAnnKeresa() {
    try {
        console.log('🔍 Looking for Ann Keresa student information...');
        
        // Search for Ann Keresa with various name patterns
        const result = await pool.query(`
            SELECT id, full_name, admission_number, age, gender, bio, photo_url 
            FROM students 
            WHERE full_name ILIKE '%Ann%' AND full_name ILIKE '%Keresa%'
            ORDER BY full_name
        `);
        
        if (result.rows.length > 0) {
            console.log('📋 Found Ann Keresa:');
            result.rows.forEach(student => {
                console.log(`   ID: ${student.id}`);
                console.log(`   Name: ${student.full_name}`);
                console.log(`   Admission Number: ${student.admission_number}`);
                console.log(`   Age: ${student.age}`);
                console.log(`   Gender: ${student.gender}`);
                console.log(`   Bio: ${student.bio}`);
                console.log(`   Photo: ${student.photo_url}`);
                console.log('   ---');
            });
        } else {
            console.log('❌ No student found with name containing "Ann" and "Keresa"');
            
            // Let's search for similar names
            console.log('🔍 Searching for similar names...');
            const similarResult = await pool.query(`
                SELECT id, full_name, admission_number 
                FROM students 
                WHERE full_name ILIKE '%Ann%' OR full_name ILIKE '%Keresa%'
                ORDER BY full_name
                LIMIT 10
            `);
            
            if (similarResult.rows.length > 0) {
                console.log('📋 Similar names found:');
                similarResult.rows.forEach(student => {
                    console.log(`   ${student.full_name} (${student.admission_number})`);
                });
            }
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

getAnnKeresa();
