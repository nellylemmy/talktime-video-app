/**
 * Script to delete all students from the database
 * This script is for testing and development purposes only
 * 
 * Usage: node delete-all-students.js
 */
import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function deleteAllStudents() {
    try {
        console.log('Connecting to database...');
        
        // Execute the delete query
        console.log('Deleting all students...');
        const result = await pool.query('DELETE FROM students');
        
        console.log(`Successfully deleted ${result.rowCount} students from the database.`);
        
        // Close the database connection
        await pool.end();
        console.log('Database connection closed.');
        
        return result.rowCount;
    } catch (error) {
        console.error('Error deleting students:', error);
        
        // Make sure to close the connection even if there's an error
        try {
            await pool.end();
            console.log('Database connection closed after error.');
        } catch (closeError) {
            console.error('Error closing database connection:', closeError);
        }
        
        process.exit(1);
    }
}

// Execute the function if this script is run directly
if (process.argv[1].includes('delete-all-students.js')) {
    console.log('Starting student deletion script...');
    
    // Ask for confirmation
    console.log('\n⚠️  WARNING: This will delete ALL students from the database! ⚠️');
    console.log('This action cannot be undone.');
    
    // Simple confirmation mechanism
    process.stdout.write('Are you sure you want to continue? (y/N): ');
    process.stdin.once('data', async (data) => {
        const input = data.toString().trim().toLowerCase();
        
        if (input === 'y' || input === 'yes') {
            console.log('\nProceeding with student deletion...');
            const count = await deleteAllStudents();
            console.log(`\n✅ Operation complete. ${count} students deleted.`);
        } else {
            console.log('\n❌ Operation cancelled. No students were deleted.');
        }
        
        process.exit(0);
    });
}

export default deleteAllStudents;
