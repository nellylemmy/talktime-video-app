import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config();

const { Pool } = pg;

// Create a connection pool - hardcoded for Docker environment
const pool = new Pool({
  user: 'user',
  host: 'db',
  database: 'talktimedb',
  password: 'password',
  port: 5432,
});

console.log('Attempting to connect to database with:', {
  user: 'user',
  host: 'db',
  database: 'talktimedb',
  port: '5432'
});

const studentId = 21; // The student ID we're trying to delete

async function debugStudentDeletion() {
  try {
    console.log(`=== DEBUGGING STUDENT DELETION FOR ID: ${studentId} ===`);
    
    // Check if student exists
    const studentQuery = 'SELECT * FROM students WHERE id = $1';
    const studentResult = await pool.query(studentQuery, [studentId]);
    
    if (studentResult.rows.length === 0) {
      console.log(`Student with ID ${studentId} does not exist.`);
      return;
    }
    
    console.log(`Student found: ${JSON.stringify(studentResult.rows[0])}`);
    
    // Check for meetings
    const now = new Date();
    console.log(`Current date/time: ${now.toISOString()}`);
    
    // Check all meetings
    const allMeetingsQuery = 'SELECT * FROM meetings WHERE student_id = $1';
    const allMeetingsResult = await pool.query(allMeetingsQuery, [studentId]);
    console.log(`Total meetings: ${allMeetingsResult.rows.length}`);
    
    if (allMeetingsResult.rows.length > 0) {
      console.log('All meetings:');
      allMeetingsResult.rows.forEach(meeting => {
        console.log(`- Meeting ID: ${meeting.id}, Status: ${meeting.status}, Scheduled: ${meeting.scheduled_time}, Room ID: ${meeting.room_id}`);
      });
    }
    
    // Check future scheduled meetings
    const futureMeetingsQuery = `
      SELECT * FROM meetings 
      WHERE student_id = $1 
      AND scheduled_time > $2
      AND status = 'scheduled'
    `;
    const futureMeetingsResult = await pool.query(futureMeetingsQuery, [studentId, now]);
    console.log(`Future scheduled meetings: ${futureMeetingsResult.rows.length}`);
    
    if (futureMeetingsResult.rows.length > 0) {
      console.log('Future meetings:');
      futureMeetingsResult.rows.forEach(meeting => {
        console.log(`- Meeting ID: ${meeting.id}, Status: ${meeting.status}, Scheduled: ${meeting.scheduled_time}`);
      });
      console.log('ISSUE: Student has future meetings and cannot be deleted until these are removed.');
    } else {
      console.log('Student has no future meetings and should be deletable.');
      
      // Attempt to delete all meetings for this student
      console.log('Attempting to delete all meetings for this student...');
      const deleteMeetingsQuery = 'DELETE FROM meetings WHERE student_id = $1 RETURNING id';
      const deleteMeetingsResult = await pool.query(deleteMeetingsQuery, [studentId]);
      console.log(`Deleted ${deleteMeetingsResult.rows.length} meetings.`);
      
      // Now try to delete the student
      console.log('Attempting to delete student...');
      const deleteStudentQuery = 'DELETE FROM students WHERE id = $1 RETURNING id';
      const deleteStudentResult = await pool.query(deleteStudentQuery, [studentId]);
      
      if (deleteStudentResult.rows.length > 0) {
        console.log(`SUCCESS: Student with ID ${studentId} deleted successfully.`);
      } else {
        console.log(`FAILED: Could not delete student with ID ${studentId}.`);
      }
    }
    
  } catch (error) {
    console.error('Error during debugging:', error);
  } finally {
    await pool.end();
  }
}

debugStudentDeletion();
