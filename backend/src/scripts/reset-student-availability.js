/**
 * Reset Student Availability Script
 * 
 * This script immediately resets availability for all students who have
 * no future scheduled meetings. It can be run manually or scheduled
 * to ensure student availability is properly maintained.
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../config/database.js';

async function resetStudentAvailability() {
    try {
        console.log('Starting student availability reset...');
        const now = new Date();
        
        // First, log all students with their availability status
        const allStudentsQuery = `
            SELECT s.id, s.full_name, s.is_available,
                (SELECT COUNT(*) FROM meetings m 
                 WHERE m.student_id = s.id 
                 AND m.status = 'scheduled'
                 AND m.scheduled_time > $1) as future_meetings_count
            FROM students s
            ORDER BY s.full_name;
        `;
        
        const { rows: allStudents } = await pool.query(allStudentsQuery, [now]);
        console.log('Current student availability status:');
        allStudents.forEach(student => {
            console.log(`- ${student.full_name}: available=${student.is_available}, future_meetings=${student.future_meetings_count}`);
        });
        
        // Update all students to be available if they have no future scheduled meetings
        const updateQuery = `
            UPDATE students s
            SET is_available = true
            WHERE NOT EXISTS (
                SELECT 1 FROM meetings m
                WHERE m.student_id = s.id
                AND m.scheduled_time > $1
                AND m.status = 'scheduled'
            )
            RETURNING id, full_name;
        `;
        
        const { rows: updatedStudents } = await pool.query(updateQuery, [now]);
        
        console.log(`\nReset availability for ${updatedStudents.length} students:`);
        updatedStudents.forEach(student => {
            console.log(`- ${student.full_name} (ID: ${student.id})`);
        });
        
        console.log('\nStudent availability reset completed successfully.');
    } catch (error) {
        console.error('Error resetting student availability:', error);
    } finally {
        // Close the database connection
        await pool.end();
    }
}

// Run the reset function
resetStudentAvailability();
