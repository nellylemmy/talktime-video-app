import pool from '../../../config/database.js';

const VALID_CATEGORIES = ['general', 'video_quality', 'scheduling', 'ui_ux', 'suggestion', 'bug_report'];
const VALID_STATUSES = ['new', 'reviewed', 'archived'];

/**
 * Submit feedback from authenticated user
 */
export const submitFeedback = async (req, res) => {
    try {
        const userId = req.user.id;
        const { category, rating, message } = req.body;

        if (!category || !VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({
                success: false,
                message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`
            });
        }

        if (rating !== undefined && rating !== null) {
            const ratingNum = Number(rating);
            if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
                return res.status(400).json({
                    success: false,
                    message: 'Rating must be an integer between 1 and 5'
                });
            }
        }

        if (!message || typeof message !== 'string' || message.trim().length < 10 || message.trim().length > 5000) {
            return res.status(400).json({
                success: false,
                message: 'Message must be a string between 10 and 5000 characters'
            });
        }

        const result = await pool.query(
            `INSERT INTO feedback (user_id, category, rating, message, status)
             VALUES ($1, $2, $3, $4, 'new')
             RETURNING id, category, rating, message, status, created_at`,
            [userId, category, rating || null, message.trim()]
        );

        res.status(201).json({
            success: true,
            message: 'Feedback submitted successfully',
            feedback: result.rows[0]
        });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit feedback'
        });
    }
};

/**
 * Get current user's feedback history (paginated)
 */
export const getMyFeedback = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const offset = (page - 1) * limit;

        const countResult = await pool.query(
            'SELECT COUNT(*) FROM feedback WHERE user_id = $1',
            [userId]
        );
        const total = parseInt(countResult.rows[0].count);

        const result = await pool.query(
            `SELECT id, category, rating, message, status, created_at
             FROM feedback
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        res.json({
            success: true,
            feedback: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching user feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch feedback'
        });
    }
};

/**
 * Get all feedback (admin only) with filters and search
 */
export const getAllFeedback = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;
        const { status, category, search } = req.query;

        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramCount = 0;

        if (status) {
            whereClause += ` AND f.status = $${++paramCount}`;
            params.push(status);
        }

        if (category) {
            whereClause += ` AND f.category = $${++paramCount}`;
            params.push(category);
        }

        if (search) {
            whereClause += ` AND f.message ILIKE $${++paramCount}`;
            params.push(`%${search}%`);
        }

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM feedback f ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        const result = await pool.query(
            `SELECT f.id, f.user_id, u.full_name AS user_name, u.email AS user_email,
                    f.category, f.rating, f.message, f.status, f.admin_notes, f.created_at
             FROM feedback f
             JOIN users u ON f.user_id = u.id
             ${whereClause}
             ORDER BY f.created_at DESC
             LIMIT $${++paramCount} OFFSET $${++paramCount}`,
            [...params, limit, offset]
        );

        res.json({
            success: true,
            feedback: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching all feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch feedback'
        });
    }
};

/**
 * Update feedback status and admin notes (admin only)
 */
export const updateFeedbackStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_notes } = req.body;

        if (!status || !VALID_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
            });
        }

        const result = await pool.query(
            `UPDATE feedback
             SET status = $1, admin_notes = $2
             WHERE id = $3
             RETURNING id, user_id, category, rating, message, status, admin_notes, created_at`,
            [status, admin_notes || null, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Feedback not found'
            });
        }

        res.json({
            success: true,
            message: 'Feedback updated successfully',
            feedback: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update feedback'
        });
    }
};
