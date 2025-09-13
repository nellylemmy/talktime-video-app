import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../src/config/database.js';

// Configure environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function addCommunityCreditsData() {
  try {
    console.log('Adding Community Service Credits dummy data...');
    
    // Get volunteer ID for me@mail.com
    const volunteerQuery = `SELECT id FROM users WHERE email = 'me@mail.com' AND role = 'volunteer'`;
    const volunteerResult = await pool.query(volunteerQuery);
    
    if (volunteerResult.rows.length === 0) {
      console.error('Volunteer me@mail.com not found');
      return;
    }
    
    const volunteerId = volunteerResult.rows[0].id;
    console.log('Found volunteer ID:', volunteerId);
    
    // Get some student IDs for dummy meetings
    const studentsQuery = `SELECT id, full_name FROM users WHERE role = 'student' LIMIT 5`;
    const studentsResult = await pool.query(studentsQuery);
    
    if (studentsResult.rows.length === 0) {
      console.error('No students found in database');
      return;
    }
    
    const students = studentsResult.rows;
    console.log('Found students:', students.map(s => s.full_name));
    
    // Create dummy completed meetings over the past 3 months using available students
    const meetings = [];
    
    if (students.length >= 2) {
      const meetingTemplates = [
        // Recent meetings (last 2 weeks)
        { days: 2, status: 'completed', duration: 45 },
        { days: 5, status: 'completed', duration: 40 },
        { days: 8, status: 'completed', duration: 50 },
        // Older meetings (last month)
        { days: 15, status: 'completed', duration: 40 },
        { days: 22, status: 'completed', duration: 35 },
        { days: 28, status: 'completed', duration: 40 },
        // Older meetings (2-3 months ago)
        { days: 45, status: 'completed', duration: 40 },
        { days: 60, status: 'completed', duration: 45 },
        { days: 75, status: 'completed', duration: 40 },
        // One cancelled meeting for variety
        { days: 10, status: 'cancelled', duration: 0 }
      ];
      
      meetingTemplates.forEach((template, index) => {
        meetings.push({
          room_id: `room_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
          volunteer_id: volunteerId,
          student_id: students[index % students.length].id,
          scheduled_time: new Date(Date.now() - template.days * 24 * 60 * 60 * 1000),
          status: template.status
        });
      });
    }
    
    // Insert meetings
    for (const meeting of meetings) {
      const insertQuery = `
        INSERT INTO meetings (room_id, volunteer_id, student_id, scheduled_time, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id
      `;
      
      const result = await pool.query(insertQuery, [
        meeting.room_id,
        meeting.volunteer_id,
        meeting.student_id,
        meeting.scheduled_time,
        meeting.status
      ]);
      
      console.log(`Created meeting ${result.rows[0].id} - ${meeting.status} with student ID ${meeting.student_id}`);
    }
    
    console.log('✅ Community Service Credits dummy data added successfully!');
    console.log(`Added ${meetings.length} meetings for volunteer ${volunteerId}`);
    
  } catch (error) {
    console.error('Error adding community credits data:', error);
  } finally {
    await pool.end();
  }
}

addCommunityCreditsData();
