/**
 * Analytics Controller
 * Provides statistics and metrics for the admin dashboard
 */
import pool from '../../../config/database.js';

/**
 * Get system overview statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} System statistics
 */
export const getSystemStats = async (req, res) => {
    try {
        // Get total counts
        const studentCountQuery = 'SELECT COUNT(*) as count FROM users WHERE role = \'student\';';
        const volunteerCountQuery = 'SELECT COUNT(*) as count FROM users WHERE role = $1';
        const meetingCountQuery = 'SELECT COUNT(*) as count FROM meetings';
        
        // Get meeting statistics
        const meetingStatsQuery = `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'canceled') as canceled
            FROM meetings
        `;
        
        // Get average meetings per student (handle empty datasets)
        const avgMeetingsQuery = `
            SELECT 
                CASE 
                    WHEN COUNT(DISTINCT s.id) = 0 THEN 0
                    ELSE COALESCE(ROUND(COUNT(m.id)::decimal / NULLIF(COUNT(DISTINCT s.id), 0), 1), 0)
                END as avg_per_student
            FROM users s 
            LEFT JOIN meetings m ON s.id = m.student_id
            WHERE s.role = 'student'
        `;
        
        // Get active volunteers today (volunteers with meetings scheduled for today)
        const activeVolunteersQuery = `
            SELECT COUNT(DISTINCT m.volunteer_id) as count
            FROM meetings m
            WHERE DATE(m.scheduled_time) = CURRENT_DATE
            AND m.status = 'scheduled'
        `;
        
        // Get students with upcoming meetings (meetings scheduled for today or future)
        const studentsWithMeetingsQuery = `
            SELECT COUNT(DISTINCT m.student_id) as count
            FROM meetings m
            WHERE m.scheduled_time >= CURRENT_DATE
            AND m.status = 'scheduled'
        `;
        
        // Execute queries in parallel
        const [
            studentCountResult, 
            volunteerCountResult, 
            meetingCountResult,
            meetingStatsResult,
            avgMeetingsResult,
            activeVolunteersResult,
            studentsWithMeetingsResult
        ] = await Promise.all([
            pool.query(studentCountQuery),
            pool.query(volunteerCountQuery, ['volunteer']),
            pool.query(meetingCountQuery),
            pool.query(meetingStatsQuery),
            pool.query(avgMeetingsQuery),
            pool.query(activeVolunteersQuery),
            pool.query(studentsWithMeetingsQuery)
        ]);
        
        // Format the response (handle empty datasets)
        const totalCompleted = parseInt(meetingStatsResult.rows[0].completed || 0);
        const totalMeetings = parseInt(meetingCountResult.rows[0].count || 0);
        const completionRate = totalMeetings > 0 ? Math.round((totalCompleted / totalMeetings) * 100) : 0;
        
        const stats = {
            totalStudents: parseInt(studentCountResult.rows[0].count || 0),
            totalVolunteers: parseInt(volunteerCountResult.rows[0].count || 0),
            totalMeetings: totalMeetings,
            ongoingMeetings: 0, // No ongoing status in current schema
            averagePerStudent: parseFloat(avgMeetingsResult.rows[0].avg_per_student || 0),
            completionRate: completionRate,
            activeVolunteersToday: parseInt(activeVolunteersResult.rows[0].count || 0),
            studentsWithMeetings: parseInt(studentsWithMeetingsResult.rows[0].count || 0),
            meetingStats: {
                scheduled: parseInt(meetingStatsResult.rows[0].scheduled || 0),
                completed: totalCompleted,
                cancelled: parseInt(meetingStatsResult.rows[0].canceled || 0),
                ongoing: 0 // No ongoing status in current schema
            }
        };
        
        res.json({ stats });
    } catch (error) {
        console.error('Error fetching system statistics:', error);
        res.status(500).json({ error: 'Failed to fetch system statistics' });
    }
};

/**
 * Get meeting statistics by time period
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Meeting statistics by time period
 */
export const getMeetingStats = async (req, res) => {
    try {
        const { period = 'week' } = req.query;
        
        let timeFilter;
        switch (period) {
            case 'day':
                timeFilter = "scheduled_time >= CURRENT_DATE";
                break;
            case 'week':
                timeFilter = "scheduled_time >= CURRENT_DATE - INTERVAL '7 days'";
                break;
            case 'month':
                timeFilter = "scheduled_time >= CURRENT_DATE - INTERVAL '30 days'";
                break;
            case 'year':
                timeFilter = "scheduled_time >= CURRENT_DATE - INTERVAL '365 days'";
                break;
            default:
                timeFilter = "scheduled_time >= CURRENT_DATE - INTERVAL '7 days'";
        }
        
        // Get meeting statistics for the specified period
        const query = `
            SELECT 
                DATE(scheduled_time) as date,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
            FROM meetings
            WHERE ${timeFilter}
            GROUP BY DATE(scheduled_time)
            ORDER BY date
        `;
        
        const result = await pool.query(query);
        
        res.json({ 
            period,
            stats: result.rows.map(row => ({
                date: row.date,
                total: parseInt(row.total),
                scheduled: parseInt(row.scheduled),
                completed: parseInt(row.completed),
                cancelled: parseInt(row.cancelled)
            }))
        });
    } catch (error) {
        console.error('Error fetching meeting statistics:', error);
        res.status(500).json({ error: 'Failed to fetch meeting statistics' });
    }
};

/**
 * Get top volunteers by meeting count
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Top volunteers
 */
export const getTopVolunteers = async (req, res) => {
    try {
        const { limit = 5 } = req.query;
        
        const query = `
            SELECT 
                u.id, 
                u.name as full_name, 
                u.email,
                COUNT(m.id) as meeting_count,
                COUNT(*) FILTER (WHERE m.status = 'completed') as completed_count
            FROM 
                users u
            JOIN 
                meetings m ON u.id = m.volunteer_id
            WHERE 
                u.role = 'volunteer'
            GROUP BY 
                u.id, u.name, u.email
            ORDER BY 
                meeting_count DESC
            LIMIT $1
        `;
        
        const result = await pool.query(query, [limit]);
        
        res.json({ 
            volunteers: result.rows.map(row => ({
                id: row.id,
                fullName: row.full_name,
                email: row.email,
                meetingCount: parseInt(row.meeting_count),
                completedCount: parseInt(row.completed_count)
            }))
        });
    } catch (error) {
        console.error('Error fetching top volunteers:', error);
        res.status(500).json({ error: 'Failed to fetch top volunteers' });
    }
};

/**
 * Get student engagement statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Student engagement statistics
 */
export const getStudentEngagement = async (req, res) => {
    try {
        const query = `
            SELECT 
                s.id, 
                s.full_name,
                s.username as admission_number,
                COUNT(m.id) as meeting_count,
                MAX(m.scheduled_time) as last_meeting
            FROM 
                users s
            LEFT JOIN 
                meetings m ON s.id = m.student_id
            WHERE s.role = 'student'
            GROUP BY 
                s.id, s.full_name, s.username
            ORDER BY 
                meeting_count DESC, last_meeting DESC
        `;
        
        const result = await pool.query(query);
        
        res.json({ 
            students: result.rows.map(row => ({
                id: row.id,
                fullName: row.full_name,
                admissionNumber: row.admission_number,
                meetingCount: parseInt(row.meeting_count),
                lastMeeting: row.last_meeting
            }))
        });
    } catch (error) {
        console.error('Error fetching student engagement:', error);
        res.status(500).json({ error: 'Failed to fetch student engagement' });
    }
};
