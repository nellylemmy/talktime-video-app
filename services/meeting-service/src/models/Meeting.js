import pool from '../config/database.js';

class Meeting {
    /**
     * Create a new meeting
     */
    static async create({ volunteerId, studentId, scheduledTime, roomId, status = 'scheduled' }) {
        const query = `
            INSERT INTO meetings (volunteer_id, student_id, scheduled_time, room_id, status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            RETURNING *;
        `;
        const result = await pool.query(query, [volunteerId, studentId, scheduledTime, roomId, status]);
        return result.rows[0];
    }

    /**
     * Create instant meeting
     */
    static async createInstant({ volunteerId, studentId, roomId }) {
        const query = `
            INSERT INTO meetings (volunteer_id, student_id, scheduled_time, room_id, status, is_instant, created_at, updated_at)
            VALUES ($1, $2, NOW(), $3, 'pending', TRUE, NOW(), NOW())
            RETURNING *;
        `;
        const result = await pool.query(query, [volunteerId, studentId, roomId]);
        return result.rows[0];
    }

    /**
     * Find meeting by ID
     */
    static async findById(id) {
        const result = await pool.query('SELECT * FROM meetings WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    /**
     * Find meeting by room ID
     */
    static async findByRoomId(roomId) {
        const result = await pool.query('SELECT * FROM meetings WHERE room_id = $1', [roomId]);
        return result.rows[0] || null;
    }

    /**
     * Update meeting
     */
    static async update(id, updateData) {
        const fieldMapping = {
            status: 'status',
            scheduledTime: 'scheduled_time',
            roomId: 'room_id',
            original_scheduled_time: 'original_scheduled_time',
            is_rescheduled: 'is_rescheduled',
            reschedule_count: 'reschedule_count',
            last_rescheduled_at: 'last_rescheduled_at',
            rescheduled_by: 'rescheduled_by',
            end_time: 'end_time',
            ended_by: 'ended_by',
            end_reason: 'end_reason'
        };

        const updates = [];
        const values = [id];
        let paramIndex = 2;

        for (const [key, value] of Object.entries(updateData)) {
            if (value !== undefined && fieldMapping[key]) {
                updates.push(`${fieldMapping[key]} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (updates.length === 0) {
            throw new Error('No valid fields to update');
        }

        updates.push('updated_at = NOW()');

        const query = `
            UPDATE meetings
            SET ${updates.join(', ')}
            WHERE id = $1
            RETURNING *;
        `;

        const result = await pool.query(query, values);
        return result.rows[0];
    }

    /**
     * Find upcoming meetings for volunteer
     */
    static async findUpcomingByVolunteerId(volunteerId) {
        const query = `
            SELECT
                m.id,
                m.student_id as studentId,
                u.full_name as name,
                u.username as admissionNumber,
                COALESCE(u.profile_image, '/images/placeholder-student.jpg') as "profileImage",
                m.scheduled_time as time,
                m.room_id as roomId,
                m.status
            FROM meetings m
            JOIN users u ON m.student_id = u.id AND u.role = 'student'
            WHERE m.volunteer_id = $1 AND m.scheduled_time >= NOW() AND m.status = 'scheduled'
            ORDER BY m.scheduled_time ASC;
        `;
        const result = await pool.query(query, [volunteerId]);
        return result.rows;
    }

    /**
     * Find past meetings for volunteer
     */
    static async findPastByVolunteerId(volunteerId) {
        const query = `
            SELECT
                m.id,
                m.student_id as studentId,
                u.full_name as name,
                COALESCE(u.profile_image, '/images/placeholder-student.jpg') as "profileImage",
                m.scheduled_time as time,
                m.room_id as roomId,
                m.status
            FROM meetings m
            JOIN users u ON m.student_id = u.id AND u.role = 'student'
            WHERE m.volunteer_id = $1 AND m.scheduled_time < NOW()
            ORDER BY m.scheduled_time DESC;
        `;
        const result = await pool.query(query, [volunteerId]);
        return result.rows;
    }

    /**
     * Find upcoming meetings for student
     */
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
        const result = await pool.query(query, [studentId]);
        return result.rows;
    }

    /**
     * Find meetings by student ID (with volunteer info)
     */
    static async findByStudentIdWithVolunteer(studentId, volunteerId) {
        const query = `
            SELECT
                m.*,
                v.full_name as volunteer_name
            FROM meetings m
            LEFT JOIN users v ON m.volunteer_id = v.id
            WHERE m.student_id = $1 AND m.volunteer_id = $2
            ORDER BY m.scheduled_time DESC
        `;
        const result = await pool.query(query, [studentId, volunteerId]);
        return result.rows;
    }

    /**
     * Find active meeting between volunteer and student
     */
    static async findActiveByParticipants(studentId, volunteerId) {
        const query = `
            SELECT m.*, v.full_name as volunteer_name
            FROM meetings m
            LEFT JOIN users v ON m.volunteer_id = v.id
            WHERE m.student_id = $1
            AND m.volunteer_id = $2
            AND (m.status = 'scheduled' OR m.status = 'in_progress')
            ORDER BY m.scheduled_time ASC
            LIMIT 1
        `;
        const result = await pool.query(query, [studentId, volunteerId]);
        return result.rows[0] || null;
    }

    /**
     * Find pending instant meeting for student
     */
    static async findPendingInstantByStudentId(studentId) {
        // Clean up stale pending instant calls (older than 3 minutes)
        await pool.query(`
            UPDATE meetings
            SET status = 'canceled'
            WHERE student_id = $1
            AND is_instant = TRUE
            AND status = 'pending'
            AND scheduled_time < NOW() - INTERVAL '3 minutes'
        `, [studentId]);

        const query = `
            SELECT m.*, u.full_name as volunteer_name, u.username as volunteer_username
            FROM meetings m
            JOIN users u ON m.volunteer_id = u.id
            WHERE m.student_id = $1
            AND m.is_instant = TRUE
            AND m.status = 'pending'
            AND m.scheduled_time >= NOW() - INTERVAL '3 minutes'
            ORDER BY m.scheduled_time DESC
            LIMIT 1;
        `;
        const result = await pool.query(query, [studentId]);
        return result.rows[0] || null;
    }

    /**
     * Get meeting with participant details
     */
    static async findByIdWithParticipants(id) {
        const query = `
            SELECT
                m.*,
                v.full_name as volunteer_name,
                v.id as volunteer_id,
                s.full_name as student_name,
                s.id as student_id
            FROM meetings m
            JOIN users v ON m.volunteer_id = v.id
            JOIN users s ON m.student_id = s.id AND s.role = 'student'
            WHERE m.id = $1
        `;
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * Get meeting by room ID with participant details
     */
    static async findByRoomIdWithParticipants(roomId) {
        const query = `
            SELECT
                m.*,
                v.full_name as volunteer_name,
                v.id as volunteer_id,
                s.full_name as student_name,
                s.id as student_id
            FROM meetings m
            JOIN users v ON m.volunteer_id = v.id
            JOIN users s ON m.student_id = s.id AND s.role = 'student'
            WHERE m.room_id = $1 OR (m.id = $1::integer AND $1 ~ '^[0-9]+$')
        `;
        const result = await pool.query(query, [roomId]);
        return result.rows[0] || null;
    }
}

export default Meeting;
