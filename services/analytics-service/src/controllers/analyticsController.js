import pool from '../config/database.js';
import redisClient from '../config/redis.js';

// Cache duration: 5 minutes
const CACHE_TTL = 300;

/**
 * Get dashboard overview stats
 */
export const getDashboardStats = async (req, res) => {
    try {
        // Check cache first
        const cached = await redisClient.get('analytics:dashboard');
        if (cached) {
            return res.json(JSON.parse(cached));
        }

        // Get user counts
        const usersResult = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE role = 'volunteer' AND is_approved = true) as verified_volunteers,
                COUNT(*) FILTER (WHERE role = 'volunteer' AND is_approved = false) as pending_volunteers,
                COUNT(*) FILTER (WHERE role = 'student') as total_students,
                COUNT(*) FILTER (WHERE role = 'admin') as total_admins
            FROM users
        `);

        // Get meeting counts
        const meetingsResult = await pool.query(`
            SELECT
                COUNT(*) as total_meetings,
                COUNT(*) FILTER (WHERE status = 'completed') as completed_meetings,
                COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled_meetings,
                COUNT(*) FILTER (WHERE status = 'in_progress') as active_meetings,
                COUNT(*) FILTER (WHERE status = 'missed') as missed_meetings,
                COUNT(*) FILTER (WHERE status = 'canceled') as canceled_meetings
            FROM meetings
        `);

        // Get meetings this week
        const weeklyResult = await pool.query(`
            SELECT COUNT(*) as meetings_this_week
            FROM meetings
            WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)
        `);

        // Get meetings this month
        const monthlyResult = await pool.query(`
            SELECT COUNT(*) as meetings_this_month
            FROM meetings
            WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
        `);

        const users = usersResult.rows[0];
        const meetings = meetingsResult.rows[0];

        const stats = {
            success: true,
            timestamp: new Date().toISOString(),
            users: {
                verifiedVolunteers: parseInt(users.verified_volunteers) || 0,
                pendingVolunteers: parseInt(users.pending_volunteers) || 0,
                totalStudents: parseInt(users.total_students) || 0,
                totalAdmins: parseInt(users.total_admins) || 0,
                total: parseInt(users.verified_volunteers) + parseInt(users.pending_volunteers) +
                       parseInt(users.total_students) + parseInt(users.total_admins)
            },
            meetings: {
                total: parseInt(meetings.total_meetings) || 0,
                completed: parseInt(meetings.completed_meetings) || 0,
                scheduled: parseInt(meetings.scheduled_meetings) || 0,
                active: parseInt(meetings.active_meetings) || 0,
                missed: parseInt(meetings.missed_meetings) || 0,
                canceled: parseInt(meetings.canceled_meetings) || 0,
                thisWeek: parseInt(weeklyResult.rows[0].meetings_this_week) || 0,
                thisMonth: parseInt(monthlyResult.rows[0].meetings_this_month) || 0
            }
        };

        // Calculate completion rate
        const totalEnded = stats.meetings.completed + stats.meetings.missed + stats.meetings.canceled;
        stats.meetings.completionRate = totalEnded > 0
            ? Math.round((stats.meetings.completed / totalEnded) * 100)
            : 0;

        // Cache the result
        await redisClient.setex('analytics:dashboard', CACHE_TTL, JSON.stringify(stats));

        res.json(stats);
    } catch (error) {
        console.error('[Analytics Service] Dashboard stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to get dashboard stats' });
    }
};

/**
 * Get volunteer performance metrics
 */
export const getVolunteerMetrics = async (req, res) => {
    try {
        const { volunteerId } = req.params;

        // Check cache
        const cacheKey = `analytics:volunteer:${volunteerId}`;
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            return res.json(JSON.parse(cached));
        }

        // Get volunteer stats
        const statsResult = await pool.query(`
            SELECT
                COUNT(*) as total_meetings,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'missed') as missed,
                COUNT(*) FILTER (WHERE status = 'canceled') as canceled,
                COUNT(DISTINCT student_id) as unique_students
            FROM meetings
            WHERE volunteer_id = $1
        `, [volunteerId]);

        const stats = statsResult.rows[0];
        const total = parseInt(stats.total_meetings) || 0;
        const completed = parseInt(stats.completed) || 0;
        const missed = parseInt(stats.missed) || 0;
        const canceled = parseInt(stats.canceled) || 0;

        // Calculate rates
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const missedRate = total > 0 ? Math.round((missed / total) * 100) : 0;
        const canceledRate = total > 0 ? Math.round((canceled / total) * 100) : 0;

        // Calculate reputation score
        const reputationScore = Math.max(0, 100 - (canceledRate * 1.5) - (missedRate * 2));

        // Get recent meetings
        const recentResult = await pool.query(`
            SELECT id, student_id, scheduled_time, status
            FROM meetings
            WHERE volunteer_id = $1
            ORDER BY scheduled_time DESC
            LIMIT 10
        `, [volunteerId]);

        const metrics = {
            success: true,
            volunteerId: parseInt(volunteerId),
            timestamp: new Date().toISOString(),
            summary: {
                totalMeetings: total,
                completedMeetings: completed,
                missedMeetings: missed,
                canceledMeetings: canceled,
                uniqueStudents: parseInt(stats.unique_students) || 0
            },
            rates: {
                completionRate,
                missedRate,
                canceledRate
            },
            reputationScore: Math.round(reputationScore),
            isRestricted: canceledRate >= 40 || missedRate >= 30 || reputationScore < 30,
            recentMeetings: recentResult.rows
        };

        // Cache
        await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(metrics));

        res.json(metrics);
    } catch (error) {
        console.error('[Analytics Service] Volunteer metrics error:', error);
        res.status(500).json({ success: false, error: 'Failed to get volunteer metrics' });
    }
};

/**
 * Get meeting trends over time
 */
export const getMeetingTrends = async (req, res) => {
    try {
        const { period = 'daily', days = 30 } = req.query;

        // Check cache
        const cacheKey = `analytics:trends:${period}:${days}`;
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            return res.json(JSON.parse(cached));
        }

        let groupBy, dateFormat;
        switch (period) {
            case 'weekly':
                groupBy = "DATE_TRUNC('week', scheduled_time)";
                dateFormat = 'YYYY-WW';
                break;
            case 'monthly':
                groupBy = "DATE_TRUNC('month', scheduled_time)";
                dateFormat = 'YYYY-MM';
                break;
            default: // daily
                groupBy = "DATE_TRUNC('day', scheduled_time)";
                dateFormat = 'YYYY-MM-DD';
        }

        const result = await pool.query(`
            SELECT
                ${groupBy} as period,
                TO_CHAR(${groupBy}, '${dateFormat}') as label,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'missed') as missed,
                COUNT(*) FILTER (WHERE status = 'canceled') as canceled
            FROM meetings
            WHERE scheduled_time >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            GROUP BY ${groupBy}
            ORDER BY ${groupBy} ASC
        `);

        const trends = {
            success: true,
            period,
            days: parseInt(days),
            timestamp: new Date().toISOString(),
            data: result.rows.map(row => ({
                period: row.period,
                label: row.label,
                total: parseInt(row.total),
                completed: parseInt(row.completed),
                missed: parseInt(row.missed),
                canceled: parseInt(row.canceled)
            }))
        };

        // Cache
        await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(trends));

        res.json(trends);
    } catch (error) {
        console.error('[Analytics Service] Meeting trends error:', error);
        res.status(500).json({ success: false, error: 'Failed to get meeting trends' });
    }
};

/**
 * Get top volunteers by completed meetings
 */
export const getTopVolunteers = async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        // Check cache
        const cacheKey = `analytics:top_volunteers:${limit}`;
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            return res.json(JSON.parse(cached));
        }

        const result = await pool.query(`
            SELECT
                u.id,
                u.full_name,
                COUNT(*) FILTER (WHERE m.status = 'completed') as completed_meetings,
                COUNT(*) as total_meetings,
                COUNT(DISTINCT m.student_id) as unique_students
            FROM users u
            JOIN meetings m ON u.id = m.volunteer_id
            WHERE u.role = 'volunteer'
            GROUP BY u.id, u.full_name
            HAVING COUNT(*) FILTER (WHERE m.status = 'completed') > 0
            ORDER BY completed_meetings DESC
            LIMIT $1
        `, [parseInt(limit)]);

        const data = {
            success: true,
            timestamp: new Date().toISOString(),
            volunteers: result.rows.map(row => ({
                id: row.id,
                name: row.full_name || 'Unknown',
                completedMeetings: parseInt(row.completed_meetings),
                totalMeetings: parseInt(row.total_meetings),
                uniqueStudents: parseInt(row.unique_students)
            }))
        };

        // Cache
        await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(data));

        res.json(data);
    } catch (error) {
        console.error('[Analytics Service] Top volunteers error:', error);
        res.status(500).json({ success: false, error: 'Failed to get top volunteers' });
    }
};

/**
 * Get student engagement metrics
 */
export const getStudentEngagement = async (req, res) => {
    try {
        // Check cache
        const cached = await redisClient.get('analytics:student_engagement');
        if (cached) {
            return res.json(JSON.parse(cached));
        }

        // Students with most meetings
        const activeResult = await pool.query(`
            SELECT
                u.id,
                u.full_name,
                u.username,
                COUNT(*) FILTER (WHERE m.status = 'completed') as completed_meetings,
                COUNT(*) as total_meetings,
                MAX(m.scheduled_time) as last_meeting
            FROM users u
            JOIN meetings m ON u.id = m.student_id
            WHERE u.role = 'student'
            GROUP BY u.id, u.full_name, u.username
            ORDER BY completed_meetings DESC
            LIMIT 10
        `);

        // Students with no meetings in 30 days
        const inactiveResult = await pool.query(`
            SELECT
                u.id,
                u.full_name,
                u.username,
                MAX(m.scheduled_time) as last_meeting
            FROM users u
            LEFT JOIN meetings m ON u.id = m.student_id
            WHERE u.role = 'student'
            GROUP BY u.id, u.full_name, u.username
            HAVING MAX(m.scheduled_time) IS NULL
                OR MAX(m.scheduled_time) < CURRENT_DATE - INTERVAL '30 days'
            ORDER BY last_meeting ASC NULLS FIRST
            LIMIT 10
        `);

        const data = {
            success: true,
            timestamp: new Date().toISOString(),
            mostActive: activeResult.rows.map(row => ({
                id: row.id,
                name: row.full_name || 'Unknown',
                username: row.username,
                completedMeetings: parseInt(row.completed_meetings),
                totalMeetings: parseInt(row.total_meetings),
                lastMeeting: row.last_meeting
            })),
            needsEngagement: inactiveResult.rows.map(row => ({
                id: row.id,
                name: row.full_name || 'Unknown',
                username: row.username,
                lastMeeting: row.last_meeting
            }))
        };

        // Cache
        await redisClient.setex('analytics:student_engagement', CACHE_TTL, JSON.stringify(data));

        res.json(data);
    } catch (error) {
        console.error('[Analytics Service] Student engagement error:', error);
        res.status(500).json({ success: false, error: 'Failed to get student engagement' });
    }
};

export default {
    getDashboardStats,
    getVolunteerMetrics,
    getMeetingTrends,
    getTopVolunteers,
    getStudentEngagement
};
