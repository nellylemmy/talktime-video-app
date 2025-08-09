import pool from '../config/database.js';

class Meeting {
    /**
     * Creates a new meeting.
     * @param {object} meetingData - The data for the new meeting.
     * @returns {Promise<object>} The newly created meeting.
     */
    static async create({ volunteerId, studentId, scheduledTime, roomId }) {
        const query = `
            INSERT INTO meetings (volunteer_id, student_id, scheduled_time, room_id, status)
            VALUES ($1, $2, $3, $4, 'scheduled')
            RETURNING *;
        `;
        try {
            const { rows } = await pool.query(query, [volunteerId, studentId, scheduledTime, roomId]);
            return rows[0];
        } catch (error) {
            console.error('Error creating meeting:', error);
            throw error;
        }
    }
    
    /**
     * Creates a new instant meeting.
     * @param {object} meetingData - The data for the new instant meeting.
     * @returns {Promise<object>} The newly created instant meeting.
     */
    static async createInstant({ volunteerId, studentId, roomId }) {
        const query = `
            INSERT INTO meetings (volunteer_id, student_id, scheduled_time, room_id, status, is_instant)
            VALUES ($1, $2, NOW(), $3, 'pending', TRUE)
            RETURNING *;
        `;
        try {
            const { rows } = await pool.query(query, [volunteerId, studentId, roomId]);
            return rows[0];
        } catch (error) {
            console.error('Error creating instant meeting:', error);
            throw error;
        }
    }

    // Method to find upcoming meetings for a specific volunteer
    static async findUpcomingByVolunteerId(volunteerId) {
        const query = `
            SELECT 
                m.id, 
                m.student_id as studentId, 
                su.full_name as name, 
                su.username as admissionNumber,
                COALESCE(su.profile_image, '/images/placeholder-student.jpg') as "profileImage",
                m.scheduled_time as time, 
                m.room_id as roomId,
                m.status
            FROM meetings m
            JOIN users su ON m.student_id = su.id AND su.role = 'student'
            WHERE m.volunteer_id = $1 AND m.scheduled_time >= NOW() AND m.status = 'scheduled'
            ORDER BY m.scheduled_time ASC;
        `;
        try {
            const { rows } = await pool.query(query, [volunteerId]);
            console.log('Upcoming meetings found:', rows.length, 'meetings for volunteer ID:', volunteerId);
            if (rows.length > 0) {
                console.log('Sample meeting data:', JSON.stringify(rows[0]));
            }
            return rows;
        } catch (error) {
            console.error('Error fetching upcoming meetings:', error);
            throw error;
        }
    }

    // Method to find past meetings for a specific volunteer
    static async findPastByVolunteerId(volunteerId) {
        const query = `
            SELECT 
                m.id, 
                m.student_id as studentId, 
                su.full_name as name, 
                COALESCE(su.profile_image, '/images/placeholder-student.jpg') as "profileImage",
                m.scheduled_time as time, 
                m.room_id as roomId,
                m.status
            FROM meetings m
            JOIN users su ON m.student_id = su.id AND su.role = 'student'
            WHERE m.volunteer_id = $1 AND m.scheduled_time < NOW()
            ORDER BY m.scheduled_time DESC;
        `;
        try {
            const { rows } = await pool.query(query, [volunteerId]);
            console.log('Past meetings found:', rows.length, 'meetings for volunteer ID:', volunteerId);
            if (rows.length > 0) {
                console.log('Sample past meeting data:', JSON.stringify(rows[0]));
            }
            return rows;
        } catch (error) {
            console.error('Error fetching past meetings:', error);
            throw error;
        }
    }

    // Method to find upcoming meetings for a specific student
    static async findUpcomingByStudentId(studentId) {
        const query = `
            SELECT 
                m.id, 
                m.volunteer_id as volunteerId, 
                u.full_name as volunteerName, 
                u.username as volunteerUsername,
                m.scheduled_time as time, 
                m.room_id as roomId,
                m.status
            FROM meetings m
            JOIN users u ON m.volunteer_id = u.id
            WHERE m.student_id = $1 AND m.scheduled_time >= NOW() AND m.status = 'scheduled'
            ORDER BY m.scheduled_time ASC;
        `;
        try {
            const { rows } = await pool.query(query, [studentId]);
            console.log('Upcoming meetings found:', rows.length, 'meetings for student ID:', studentId);
            if (rows.length > 0) {
                console.log('Sample student meeting data:', JSON.stringify(rows[0]));
            }
            return rows;
        } catch (error) {
            console.error('Error fetching upcoming meetings for student:', error);
            throw error;
        }
    }

    /**
     * Finds all booked time slots for a specific student for a given month and year.
     * @param {number} studentId - The ID of the student.
     * @param {number} year - The full year.
     * @param {number} month - The month index (0-11).
     * @returns {Promise<Array<Date>>} A promise that resolves to an array of Date objects for booked slots.
     */
    static async findBookedSlotsByStudent(studentId, year, month) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59);

        try {
            const res = await pool.query(
                'SELECT scheduled_time FROM meetings WHERE student_id = $1 AND scheduled_time >= $2 AND scheduled_time <= $3',
                [studentId, startDate, endDate]
            );
            return res.rows.map(row => new Date(row.scheduled_time));
        } catch (error) {
            console.error('Error fetching booked slots:', error);
            throw error;
        }
    }
    
    /**
     * Updates a meeting by ID.
     * @param {number} id - The meeting ID to update.
     * @param {object} updateData - The data to update (status, scheduledTime, etc).
     * @returns {Promise<object>} The updated meeting.
     */
    static async update(id, updateData) {
        // Build the SET part of the query dynamically based on updateData
        const updates = [];
        const values = [id]; // First parameter is always the ID
        let paramIndex = 2; // Start from $2 since $1 is the ID
        
        // Map JavaScript camelCase to database snake_case
        const fieldMapping = {
            status: 'status',
            scheduledTime: 'scheduled_time',
            duration: 'duration',
            roomId: 'room_id',
            original_scheduled_time: 'original_scheduled_time',
            is_rescheduled: 'is_rescheduled',
            reschedule_count: 'reschedule_count',
            last_rescheduled_at: 'last_rescheduled_at',
            rescheduled_by: 'rescheduled_by',
            updated_at: 'updated_at'
        };
        
        // Add each field to the updates array
        for (const [key, value] of Object.entries(updateData)) {
            if (value !== undefined && fieldMapping[key]) {
                updates.push(`${fieldMapping[key]} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }
        
        // If no valid fields to update, return early
        if (updates.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        const query = `
            UPDATE meetings
            SET ${updates.join(', ')}
            WHERE id = $1
            RETURNING *;
        `;
        
        try {
            const { rows } = await pool.query(query, values);
            if (rows.length === 0) {
                throw new Error('Meeting not found');
            }
            return rows[0];
        } catch (error) {
            console.error('Error updating meeting:', error);
            throw error;
        }
    }
    
    /**
     * Find a meeting by ID.
     * @param {number} id - The meeting ID.
     * @returns {Promise<object|null>} The meeting or null if not found.
     */
    static async findById(id) {
        // Simplified query that doesn't rely on joins
        const query = `
            SELECT * FROM meetings WHERE id = $1;
        `;
        
        try {
            const { rows } = await pool.query(query, [id]);
            console.log('Meeting findById result:', rows[0]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error finding meeting by ID:', error);
            throw error;
        }
    }

    /**
     * Find the latest FUTURE meeting for a specific student.
     * This method only returns meetings that are scheduled for the future,
     * ensuring that students with only past meetings show "Schedule Meeting" button.
     * @param {number} studentId - The student ID.
     * @returns {Promise<object|null>} The future meeting or null if not found.
     */
    static async findLatestByStudentId(studentId) {
        const query = `
            SELECT * FROM meetings 
            WHERE student_id = $1 
            AND status != 'canceled'
            AND scheduled_time > NOW()
            ORDER BY scheduled_time ASC
            LIMIT 1;
        `;
        
        try {
            const { rows } = await pool.query(query, [studentId]);
            console.log(`[Meeting Model] Found ${rows.length} future meetings for student ${studentId}`);
            if (rows.length > 0) {
                console.log(`[Meeting Model] Next meeting: ${rows[0].scheduled_time}`);
            }
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error finding future meeting by student ID:', error);
            throw error;
        }
    }
    /**
     * Find pending instant meetings for a student
     * Only returns pending calls that are recent (within 3 minutes) to prevent stale calls from blocking new ones
     * @param {number} studentId - The student ID
     * @returns {Promise<object|null>} The pending instant meeting or null if not found
     */
    static async findPendingInstantByStudentId(studentId) {
        // First, clean up any stale pending instant calls (older than 3 minutes)
        const cleanupQuery = `
            UPDATE meetings 
            SET status = 'canceled'
            WHERE student_id = $1 
            AND is_instant = TRUE 
            AND status = 'pending'
            AND scheduled_time < NOW() - INTERVAL '3 minutes'
            RETURNING id;
        `;
        
        try {
            const { rows: expiredCalls } = await pool.query(cleanupQuery, [studentId]);
            if (expiredCalls.length > 0) {
                console.log(`[Meeting Model] Cleaned up ${expiredCalls.length} expired instant calls for student ${studentId}`);
            }
        } catch (cleanupError) {
            console.error('Error cleaning up expired instant calls:', cleanupError);
            // Continue with the main query even if cleanup fails
        }
        
        // Now find any remaining valid pending instant calls (within last 3 minutes)
        const query = `
            SELECT 
                m.*,
                u.full_name as volunteer_name,
                u.username as volunteer_username
            FROM meetings m
            JOIN users u ON m.volunteer_id = u.id
            WHERE m.student_id = $1 
            AND m.is_instant = TRUE 
            AND m.status = 'pending'
            AND m.scheduled_time >= NOW() - INTERVAL '3 minutes'
            ORDER BY m.scheduled_time DESC
            LIMIT 1;
        `;
        
        try {
            const { rows } = await pool.query(query, [studentId]);
            if (rows.length > 0) {
                console.log(`[Meeting Model] Found valid pending instant call for student ${studentId}, created at ${rows[0].scheduled_time}`);
            }
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error finding pending instant meeting:', error);
            throw error;
        }
    }
    
    /**
     * Update the status of an instant meeting
     * @param {number} id - The meeting ID
     * @param {string} status - The new status ('active', 'declined', etc.)
     * @returns {Promise<object>} The updated meeting
     */
    static async updateInstantMeetingStatus(id, status) {
        const query = `
            UPDATE meetings
            SET status = $2
            WHERE id = $1 AND is_instant = TRUE
            RETURNING *;
        `;
        
        try {
            const { rows } = await pool.query(query, [id, status]);
            if (rows.length === 0) {
                throw new Error('Instant meeting not found or not an instant meeting');
            }
            return rows[0];
        } catch (error) {
            console.error('Error updating instant meeting status:', error);
            throw error;
        }
    }
    
    /**
     * Find active instant meeting by room ID
     * @param {string} roomId - The room ID
     * @returns {Promise<object|null>} The active meeting or null if not found
     */
    static async findActiveByRoomId(roomId) {
        const query = `
            SELECT * FROM meetings
            WHERE room_id = $1 AND status = 'active'
            LIMIT 1;
        `;
        
        try {
            const { rows } = await pool.query(query, [roomId]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error finding active meeting by room ID:', error);
            throw error;
        }
    }
    
    /**
     * Count meetings for a specific volunteer
     * @param {number} volunteerId - The volunteer ID
     * @returns {Promise<number>} The count of meetings
     */
    static async countByVolunteerId(volunteerId) {
        const query = `
            SELECT COUNT(*) as count
            FROM meetings
            WHERE volunteer_id = $1;
        `;
        
        try {
            const { rows } = await pool.query(query, [volunteerId]);
            return parseInt(rows[0].count, 10);
        } catch (error) {
            console.error('Error counting meetings by volunteer ID:', error);
            throw error;
        }
    }
}

export default Meeting;
