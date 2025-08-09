/**
 * Script to update student data with new fields
 */
import pool from './config/database.js';

const updateStudents = async () => {
  try {
    // First, delete any existing meetings to avoid foreign key constraints
    await pool.query('DELETE FROM meetings');
    console.log('Deleted all meetings');
    
    // Then delete existing students
    await pool.query('DELETE FROM students');
    console.log('Deleted all students');
    
    // Now add new students with all required fields
    const insertStudentQuery = `
      INSERT INTO students (
        full_name, 
        admission_number, 
        age, 
        gender, 
        bio, 
        story, 
        photo_url, 
        gallery,
        is_available
      ) VALUES 
      (
        'James Lekishon', 
        'ADM001', 
        16, 
        'Male', 
        'James is a bright student who loves mathematics and science. He aspires to be an engineer.',
        'James comes from a Maasai community in Narok. He walks 5km to school every day and is the first in his family to receive formal education.',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&auto=format&fit=crop&w=634&q=80',
        ARRAY['https://images.unsplash.com/photo-1542190891-2093d38760f2?ixlib=rb-1.2.1&auto=format&fit=crop&w=634&q=80', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?ixlib=rb-1.2.1&auto=format&fit=crop&w=634&q=80'],
        true
      ),
      (
        'Sarah Nkatha', 
        'ADM002', 
        15, 
        'Female', 
        'Sarah loves literature and writing stories. She dreams of becoming a journalist.',
        'Sarah is from a small village near Mount Kenya. She is passionate about storytelling and preserving her cultural heritage through writing.',
        'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?ixlib=rb-1.2.1&auto=format&fit=crop&w=634&q=80',
        ARRAY['https://images.unsplash.com/photo-1544005313-94ddf0286df2?ixlib=rb-1.2.1&auto=format&fit=crop&w=634&q=80'],
        true
      ),
      (
        'Daniel Omondi', 
        'ADM003', 
        17, 
        'Male', 
        'Daniel is a talented artist and musician. He hopes to study fine arts.',
        'Daniel discovered his passion for art when he was 10. He uses locally available materials to create beautiful artwork that reflects his community''s traditions.',
        'https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?ixlib=rb-1.2.1&auto=format&fit=crop&w=634&q=80',
        ARRAY['https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?ixlib=rb-1.2.1&auto=format&fit=crop&w=634&q=80', 'https://images.unsplash.com/photo-1541647376583-8934aaf3448a?ixlib=rb-1.2.1&auto=format&fit=crop&w=634&q=80'],
        true
      ),
      (
        'Grace Wanjiku', 
        'ADM004', 
        14, 
        'Female', 
        'Grace excels in languages and has a natural aptitude for learning new ones. She speaks Swahili, English, and Kikuyu fluently.',
        'Grace helps translate for her community and dreams of becoming a language teacher to help bridge cultural gaps.',
        'https://images.unsplash.com/photo-1531251445707-1f000e1e87d0?ixlib=rb-1.2.1&auto=format&fit=crop&w=634&q=80',
        ARRAY['https://images.unsplash.com/photo-1548142813-c348350df52b?ixlib=rb-1.2.1&auto=format&fit=crop&w=634&q=80'],
        true
      )
    `;
    
    await pool.query(insertStudentQuery);
    console.log('Added 4 students with complete details');
    
    console.log('Student data update complete');
  } catch (err) {
    console.error('Error updating student data:', err);
  }
};

updateStudents().finally(() => pool.end());
