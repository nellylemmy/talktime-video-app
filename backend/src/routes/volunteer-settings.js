import express from 'express';
import { Pool } from 'pg';
import { createJWTMiddleware } from '../utils/jwt.js';

const router = express.Router();
const volunteerJWTMiddleware = createJWTMiddleware(['volunteer']);

// Database connection
const pool = new Pool({
    user: process.env.DB_USER || 'user',
    host: process.env.DB_HOST || 'db',
    database: process.env.DB_DATABASE || 'talktimedb_dev',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

/**
 * GET /api/v1/volunteer/settings
 * Get volunteer's current settings
 */
router.get('/settings', volunteerJWTMiddleware, async (req, res) => {
    try {
        const volunteerId = req.user.id;
        
        const settingsQuery = `
            SELECT * FROM volunteer_settings 
            WHERE volunteer_id = $1
        `;
        
        const availabilityQuery = `
            SELECT * FROM volunteer_availability 
            WHERE volunteer_id = $1 AND is_active = true
            ORDER BY day_of_week, start_time
        `;
        
        const [settingsResult, availabilityResult] = await Promise.all([
            pool.query(settingsQuery, [volunteerId]),
            pool.query(availabilityQuery, [volunteerId])
        ]);
        
        let settings = {};
        if (settingsResult.rows.length > 0) {
            settings = settingsResult.rows[0];
        } else {
            // Create default settings if none exist
            const createDefaultQuery = `
                INSERT INTO volunteer_settings (volunteer_id) 
                VALUES ($1) 
                RETURNING *
            `;
            const defaultResult = await pool.query(createDefaultQuery, [volunteerId]);
            settings = defaultResult.rows[0];
        }
        
        // Add availability windows to response
        settings.availability_windows = availabilityResult.rows;
        
        res.json(settings);
        
    } catch (error) {
        console.error('Error fetching volunteer settings:', error);
        res.status(500).json({
            error: 'Failed to fetch settings',
            details: error.message
        });
    }
});

/**
 * PUT /api/v1/volunteer/settings
 * Update volunteer settings
 */
router.put('/settings', volunteerJWTMiddleware, async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const {
            theme_mode,
            font_size,
            zoom_level,
            max_meetings_per_day,
            max_meetings_per_week,
            advance_notice_hours,
            auto_accept_meetings,
            primary_timezone,
            display_timezone_preference,
            dst_handling,
            email_notifications,
            sms_notifications,
            browser_notifications,
            reminder_timings
        } = req.body;
        
        const updateFields = [];
        const updateValues = [];
        let parameterIndex = 2; // Starting from 2 because volunteerId is $1
        
        if (max_meetings_per_day !== undefined) {
            updateFields.push(`max_meetings_per_day = $${parameterIndex}`);
            updateValues.push(max_meetings_per_day);
            parameterIndex++;
        }
        
        if (max_meetings_per_week !== undefined) {
            updateFields.push(`max_meetings_per_week = $${parameterIndex}`);
            updateValues.push(max_meetings_per_week);
            parameterIndex++;
        }
        
        if (advance_notice_hours !== undefined) {
            updateFields.push(`advance_notice_hours = $${parameterIndex}`);
            updateValues.push(advance_notice_hours);
            parameterIndex++;
        }
        
        if (auto_accept_meetings !== undefined) {
            updateFields.push(`auto_accept_meetings = $${parameterIndex}`);
            updateValues.push(auto_accept_meetings);
            parameterIndex++;
        }
        
        if (primary_timezone !== undefined) {
            updateFields.push(`primary_timezone = $${parameterIndex}`);
            updateValues.push(primary_timezone);
            parameterIndex++;
        }
        
        if (display_timezone_preference !== undefined) {
            updateFields.push(`display_timezone_preference = $${parameterIndex}`);
            updateValues.push(display_timezone_preference);
            parameterIndex++;
        }
        
        if (dst_handling !== undefined) {
            updateFields.push(`dst_handling = $${parameterIndex}`);
            updateValues.push(dst_handling);
            parameterIndex++;
        }
        
        if (email_notifications !== undefined) {
            updateFields.push(`email_notifications = $${parameterIndex}`);
            updateValues.push(JSON.stringify(email_notifications));
            parameterIndex++;
        }
        
        if (browser_notifications !== undefined) {
            updateFields.push(`browser_notifications = $${parameterIndex}`);
            updateValues.push(JSON.stringify(browser_notifications));
            parameterIndex++;
        }
        
        if (reminder_timings !== undefined) {
            updateFields.push(`reminder_timings = $${parameterIndex}`);
            updateValues.push(JSON.stringify(reminder_timings));
            parameterIndex++;
        }
        
        // Add SMS notifications support
        if (req.body.sms_notifications !== undefined) {
            updateFields.push(`sms_notifications = $${parameterIndex}`);
            updateValues.push(JSON.stringify(req.body.sms_notifications));
            parameterIndex++;
        }
        
        // Add push notifications support
        if (req.body.push_notifications !== undefined) {
            updateFields.push(`push_notifications = $${parameterIndex}`);
            updateValues.push(JSON.stringify(req.body.push_notifications));
            parameterIndex++;
        }
        
        // Add theme management support
        if (theme_mode !== undefined) {
            updateFields.push(`theme_mode = $${parameterIndex}`);
            updateValues.push(theme_mode);
            parameterIndex++;
        }
        
        if (font_size !== undefined) {
            updateFields.push(`font_size = $${parameterIndex}`);
            updateValues.push(font_size);
            parameterIndex++;
        }
        
        if (zoom_level !== undefined) {
            updateFields.push(`zoom_level = $${parameterIndex}`);
            updateValues.push(zoom_level);
            parameterIndex++;
        }
        
        const updateQuery = `
            UPDATE volunteer_settings SET
                ${updateFields.join(', ')}
            WHERE volunteer_id = $1
            RETURNING *
        `;
        
        const result = await pool.query(updateQuery, [volunteerId, ...updateValues]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Volunteer settings not found'
            });
        }
        
        // Clear notification preferences cache when settings are updated
        if (email_notifications !== undefined || sms_notifications !== undefined || req.body.push_notifications !== undefined) {
            try {
                const { clearNotificationPrefsCache } = await import('../services/notificationService.js');
                clearNotificationPrefsCache(volunteerId);
            } catch (error) {
                console.warn('Failed to clear notification preferences cache:', error);
            }
        }
        
        res.json({
            message: 'Settings updated successfully',
            settings: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error updating volunteer settings:', error);
        res.status(500).json({
            error: 'Failed to update settings',
            details: error.message
        });
    }
});

/**
 * POST /api/v1/volunteer/availability
 * Create availability window
 */
router.post('/availability', volunteerJWTMiddleware, async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const {
            day_of_week,
            start_time,
            end_time,
            timezone = 'UTC'
        } = req.body;
        
        // Validate required fields
        if (day_of_week === undefined || !start_time || !end_time) {
            return res.status(400).json({
                error: 'Missing required fields: day_of_week, start_time, end_time'
            });
        }
        
        // Validate day_of_week range
        if (day_of_week < 0 || day_of_week > 6) {
            return res.status(400).json({
                error: 'day_of_week must be between 0 (Sunday) and 6 (Saturday)'
            });
        }
        
        // Validate time format and logic
        if (start_time >= end_time) {
            return res.status(400).json({
                error: 'start_time must be before end_time'
            });
        }
        
        const insertQuery = `
            INSERT INTO volunteer_availability 
            (volunteer_id, day_of_week, start_time, end_time, timezone)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        
        const result = await pool.query(insertQuery, [
            volunteerId,
            day_of_week,
            start_time,
            end_time,
            timezone
        ]);
        
        res.status(201).json({
            message: 'Availability window created successfully',
            availability: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error creating availability window:', error);
        
        // Handle unique constraint violation
        if (error.code === '23505') {
            return res.status(409).json({
                error: 'Availability window already exists for this time slot'
            });
        }
        
        res.status(500).json({
            error: 'Failed to create availability window',
            details: error.message
        });
    }
});

/**
 * PUT /api/v1/volunteer/availability/:id
 * Update availability window
 */
router.put('/availability/:id', volunteerJWTMiddleware, async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const availabilityId = req.params.id;
        const {
            day_of_week,
            start_time,
            end_time,
            timezone,
            is_active
        } = req.body;
        
        // Validate time logic if both times are provided
        if (start_time && end_time && start_time >= end_time) {
            return res.status(400).json({
                error: 'start_time must be before end_time'
            });
        }
        
        const updateQuery = `
            UPDATE volunteer_availability SET
                day_of_week = COALESCE($3, day_of_week),
                start_time = COALESCE($4, start_time),
                end_time = COALESCE($5, end_time),
                timezone = COALESCE($6, timezone),
                is_active = COALESCE($7, is_active)
            WHERE id = $1 AND volunteer_id = $2
            RETURNING *
        `;
        
        const result = await pool.query(updateQuery, [
            availabilityId,
            volunteerId,
            day_of_week,
            start_time,
            end_time,
            timezone,
            is_active
        ]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Availability window not found or unauthorized'
            });
        }
        
        res.json({
            message: 'Availability window updated successfully',
            availability: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error updating availability window:', error);
        res.status(500).json({
            error: 'Failed to update availability window',
            details: error.message
        });
    }
});

/**
 * DELETE /api/v1/volunteer/availability/:id
 * Delete availability window
 */
router.delete('/availability/:id', volunteerJWTMiddleware, async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const availabilityId = req.params.id;
        
        const deleteQuery = `
            DELETE FROM volunteer_availability 
            WHERE id = $1 AND volunteer_id = $2
            RETURNING *
        `;
        
        const result = await pool.query(deleteQuery, [availabilityId, volunteerId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Availability window not found or unauthorized'
            });
        }
        
        res.json({
            message: 'Availability window deleted successfully',
            availability: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error deleting availability window:', error);
        res.status(500).json({
            error: 'Failed to delete availability window',
            details: error.message
        });
    }
});

/**
 * GET /api/v1/volunteer/availability
 * Get volunteer's availability windows
 */
router.get('/availability', volunteerJWTMiddleware, async (req, res) => {
    try {
        const volunteerId = req.user.id;
        
        const query = `
            SELECT * FROM volunteer_availability 
            WHERE volunteer_id = $1 AND is_active = true
            ORDER BY day_of_week, start_time
        `;
        
        const result = await pool.query(query, [volunteerId]);
        
        res.json({
            availability_windows: result.rows
        });
        
    } catch (error) {
        console.error('Error fetching availability windows:', error);
        res.status(500).json({
            error: 'Failed to fetch availability windows',
            details: error.message
        });
    }
});

/**
 * POST /api/v1/volunteer/settings/timezone/detect
 * Auto-detect timezone from browser
 */
router.post('/settings/timezone/detect', volunteerJWTMiddleware, async (req, res) => {
    try {
        const volunteerId = req.user.id;
        const { timezone, utc_offset } = req.body;
        
        if (!timezone) {
            return res.status(400).json({
                error: 'Timezone is required'
            });
        }
        
        // Update the volunteer's timezone
        const updateQuery = `
            UPDATE volunteer_settings SET
                primary_timezone = $2,
                updated_at = NOW()
            WHERE volunteer_id = $1
            RETURNING primary_timezone
        `;
        
        const result = await pool.query(updateQuery, [volunteerId, timezone]);
        
        res.json({
            message: 'Timezone updated successfully',
            timezone: result.rows[0]?.primary_timezone || timezone,
            utc_offset
        });
        
    } catch (error) {
        console.error('Error updating timezone:', error);
        res.status(500).json({
            error: 'Failed to update timezone',
            details: error.message
        });
    }
});

/**
 * GET /api/v1/volunteer/settings/validation
 * Validate current settings for meeting scheduling
 */
router.get('/settings/validation', volunteerJWTMiddleware, async (req, res) => {
    try {
        const volunteerId = req.user.id;
        
        const query = `
            SELECT 
                max_meetings_per_day,
                max_meetings_per_week,
                advance_notice_hours,
                auto_accept_meetings,
                primary_timezone,
                (SELECT COUNT(*) FROM volunteer_availability 
                 WHERE volunteer_id = $1 AND is_active = true) as availability_windows_count
            FROM volunteer_settings 
            WHERE volunteer_id = $1
        `;
        
        const result = await pool.query(query, [volunteerId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Volunteer settings not found'
            });
        }
        
        const settings = result.rows[0];
        const validation = {
            is_valid: true,
            issues: []
        };
        
        // Check if volunteer has availability windows
        if (settings.availability_windows_count === 0) {
            validation.is_valid = false;
            validation.issues.push({
                field: 'availability_windows',
                message: 'No availability windows set. Please add your available times.'
            });
        }
        
        // Check reasonable meeting limits
        if (settings.max_meetings_per_day > 8) {
            validation.issues.push({
                field: 'max_meetings_per_day',
                message: 'Consider reducing daily meeting limit for better work-life balance'
            });
        }
        
        res.json({
            settings,
            validation
        });
        
    } catch (error) {
        console.error('Error validating settings:', error);
        res.status(500).json({
            error: 'Failed to validate settings',
            details: error.message
        });
    }
});

export default router;
