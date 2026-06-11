import pool from '../../../config/database.js';
import * as notificationService from '../../../services/notificationService.js';

const MIN_MEETINGS_FOR_RESTRICTION = 5;
const CANCEL_COUNT_THRESHOLD = 5;
const MISSED_COUNT_THRESHOLD = 4;

/**
 * Submit an appeal (restricted volunteers only)
 */
export const submitAppeal = async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const { message } = req.body;

        if (req.user.role !== 'volunteer') {
            return res.status(403).json({ success: false, message: 'Only volunteers can submit appeals' });
        }

        if (!message || typeof message !== 'string' || message.trim().length < 20 || message.trim().length > 2000) {
            return res.status(400).json({
                success: false,
                message: 'Appeal message must be between 20 and 2000 characters'
            });
        }

        // Check volunteer IS currently restricted
        const perfResult = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status IN ('canceled', 'cancelled') AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)) as cancelled_calls,
                COUNT(*) FILTER (WHERE status = 'missed' AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)) as missed_calls,
                COUNT(*) FILTER (WHERE status IN ('completed', 'canceled', 'cancelled', 'missed') AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)) as total_scheduled
            FROM meetings
            WHERE volunteer_id = $1 AND scheduled_time < NOW()
        `, [volunteerId]);

        const metrics = perfResult.rows[0];
        const cancelledCalls = parseInt(metrics.cancelled_calls);
        const missedCalls = parseInt(metrics.missed_calls);
        const totalScheduled = parseInt(metrics.total_scheduled);

        const isRestricted = totalScheduled >= MIN_MEETINGS_FOR_RESTRICTION &&
            (cancelledCalls >= CANCEL_COUNT_THRESHOLD || missedCalls >= MISSED_COUNT_THRESHOLD);

        if (!isRestricted) {
            return res.status(400).json({
                success: false,
                message: 'Your account is not currently restricted. Appeals can only be submitted when restricted.'
            });
        }

        // Check no pending appeal exists
        const pendingCheck = await pool.query(
            `SELECT id FROM appeals WHERE volunteer_id = $1 AND status = 'pending'`,
            [volunteerId]
        );

        if (pendingCheck.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'You already have a pending appeal. Please wait for admin review.'
            });
        }

        // Calculate reputation score for snapshot
        const cancelledRate = totalScheduled > 0 ? Math.round((cancelledCalls / totalScheduled) * 100) : 0;
        const missedRate = totalScheduled > 0 ? Math.round((missedCalls / totalScheduled) * 100) : 0;
        const reputationScore = Math.max(0, Math.round(100 - (cancelledRate * 1.5) - (missedRate * 2)));

        // Insert appeal with performance snapshot
        const result = await pool.query(
            `INSERT INTO appeals (volunteer_id, message, status, cancelled_count, missed_count, total_scheduled, reputation_score)
             VALUES ($1, $2, 'pending', $3, $4, $5, $6)
             RETURNING id, status, created_at`,
            [volunteerId, message.trim(), cancelledCalls, missedCalls, totalScheduled, reputationScore]
        );

        // Notify admin(s)
        try {
            const admins = await pool.query(`SELECT id FROM users WHERE role = 'admin'`);
            for (const admin of admins.rows) {
                await notificationService.sendNotification({
                    recipient_id: admin.id,
                    recipient_role: 'admin',
                    title: 'New Restriction Appeal',
                    message: `Volunteer ${req.user.full_name || 'Unknown'} has submitted a restriction appeal.`,
                    type: 'appeal_submitted',
                    priority: 'high',
                    metadata: { appealId: result.rows[0].id, volunteerId, volunteerName: req.user.full_name }
                }, ['in-app'], { persistent: true });
            }
        } catch (notifErr) {
            console.error('Failed to notify admins about appeal:', notifErr);
        }

        res.status(201).json({
            success: true,
            message: 'Appeal submitted successfully. An admin will review it shortly.',
            appeal: result.rows[0]
        });
    } catch (error) {
        console.error('Error submitting appeal:', error);
        res.status(500).json({ success: false, message: 'Failed to submit appeal' });
    }
};

/**
 * Get current volunteer's appeals
 */
export const getMyAppeals = async (req, res) => {
    try {
        const volunteerId = req.user.id;

        const result = await pool.query(
            `SELECT id, message, status, admin_response, cancelled_count, missed_count,
                    total_scheduled, reputation_score, resolved_at, created_at
             FROM appeals
             WHERE volunteer_id = $1
             ORDER BY created_at DESC`,
            [volunteerId]
        );

        res.json({ success: true, appeals: result.rows });
    } catch (error) {
        console.error('Error fetching appeals:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch appeals' });
    }
};

/**
 * Get all appeals (admin only)
 */
export const getAllAppeals = async (req, res) => {
    try {
        const { status } = req.query;

        let whereClause = '';
        const params = [];

        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            whereClause = 'WHERE a.status = $1';
            params.push(status);
        }

        const result = await pool.query(
            `SELECT a.id, a.volunteer_id, u.full_name AS volunteer_name, u.email AS volunteer_email,
                    a.message, a.status, a.admin_response, a.cancelled_count, a.missed_count,
                    a.total_scheduled, a.reputation_score, a.resolved_at, a.created_at
             FROM appeals a
             JOIN users u ON a.volunteer_id = u.id
             ${whereClause}
             ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.created_at DESC`,
            params
        );

        res.json({ success: true, appeals: result.rows });
    } catch (error) {
        console.error('Error fetching all appeals:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch appeals' });
    }
};

/**
 * Resolve an appeal (admin only)
 */
export const resolveAppeal = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { status, admin_response } = req.body;
        const adminId = req.user.id;

        if (!status || !['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Status must be approved or rejected' });
        }

        if (status === 'rejected' && (!admin_response || admin_response.trim().length < 5)) {
            return res.status(400).json({ success: false, message: 'A response message is required when rejecting an appeal' });
        }

        await client.query('BEGIN');

        // Get the appeal
        const appealResult = await client.query(
            `SELECT id, volunteer_id, status FROM appeals WHERE id = $1`,
            [id]
        );

        if (appealResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Appeal not found' });
        }

        const appeal = appealResult.rows[0];

        if (appeal.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'This appeal has already been resolved' });
        }

        // Update appeal status
        await client.query(
            `UPDATE appeals SET status = $1, admin_response = $2, admin_id = $3, resolved_at = NOW()
             WHERE id = $4`,
            [status, admin_response ? admin_response.trim() : null, adminId, id]
        );

        // If approved, clear the volunteer's record
        if (status === 'approved') {
            await client.query(`
                UPDATE meetings
                SET cleared_by_admin = TRUE, cleared_by_admin_at = NOW()
                WHERE volunteer_id = $1
                AND status IN ('canceled', 'cancelled', 'missed')
                AND (cleared_by_admin IS NULL OR cleared_by_admin = FALSE)
                AND scheduled_time < NOW()
            `, [appeal.volunteer_id]);
        }

        await client.query('COMMIT');

        // Notify the volunteer
        try {
            const notifMessage = status === 'approved'
                ? 'Your restriction appeal has been approved. Your record has been cleared and you can schedule meetings again.'
                : `Your restriction appeal has been rejected. ${admin_response || ''}`;

            await notificationService.sendNotification({
                recipient_id: appeal.volunteer_id,
                recipient_role: 'volunteer',
                title: status === 'approved' ? 'Appeal Approved' : 'Appeal Rejected',
                message: notifMessage,
                type: 'appeal_resolved',
                priority: 'high',
                metadata: { appealId: parseInt(id), status, adminResponse: admin_response }
            }, ['in-app', 'push'], { persistent: true });
        } catch (notifErr) {
            console.error('Failed to notify volunteer about appeal resolution:', notifErr);
        }

        res.json({
            success: true,
            message: `Appeal ${status} successfully`,
            status
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error resolving appeal:', error);
        res.status(500).json({ success: false, message: 'Failed to resolve appeal' });
    } finally {
        client.release();
    }
};
