import crypto from 'crypto';
import pool from '../config/database.js';

/**
 * Parental Approval Utility Module
 * Handles token generation, validation, and approval workflow for under-18 volunteers
 */

export class ParentalApprovalService {
    /**
     * Generate a secure approval token
     * @returns {string} Secure random token
     */
    static generateApprovalToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Create parental approval request
     * @param {number} userId - User ID requiring approval
     * @param {string} parentEmail - Parent's email address
     * @param {string} parentPhone - Parent's phone number
     * @returns {Promise<string>} Approval token
     */
    static async createApprovalRequest(userId, parentEmail, parentPhone) {
        const token = this.generateApprovalToken();
        
        const query = `
            UPDATE users 
            SET parent_approval_token = $1,
                parent_approval_sent_at = CURRENT_TIMESTAMP,
                parent_email = $2,
                parent_phone = $3,
                parent_approved = false
            WHERE id = $4
            RETURNING id, full_name, email
        `;
        
        const result = await pool.query(query, [token, parentEmail, parentPhone, userId]);
        
        if (result.rows.length === 0) {
            throw new Error('User not found');
        }
        
        return {
            token,
            user: result.rows[0]
        };
    }

    /**
     * Validate and approve parental consent
     * @param {string} token - Approval token from email/SMS link
     * @returns {Promise<Object>} Approval result
     */
    static async approveParentalConsent(token) {
        const query = `
            UPDATE users 
            SET parent_approved = true,
                parent_approved_at = CURRENT_TIMESTAMP
            WHERE parent_approval_token = $1 
                AND parent_approved IS NOT TRUE
                AND parent_approval_sent_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
            RETURNING id, full_name, email, volunteer_type, is_under_18
        `;
        
        const result = await pool.query(query, [token]);
        
        if (result.rows.length === 0) {
            throw new Error('Invalid or expired approval token');
        }
        
        // Clear the token after successful approval
        await pool.query(
            'UPDATE users SET parent_approval_token = NULL WHERE id = $1',
            [result.rows[0].id]
        );
        
        return result.rows[0];
    }

    /**
     * Check if user needs parental approval
     * @param {Object} user - User object
     * @returns {boolean} True if approval is needed
     */
    static needsParentalApproval(user) {
        // Require approval for all student volunteers, regardless of age
        return user.volunteer_type === 'student_volunteer' || (user.is_under_18 && user.parent_approved !== true);
    }

    /**
     * Get approval status for user
     * @param {number} userId - User ID
     * @returns {Promise<Object>} Approval status details
     */
    static async getApprovalStatus(userId) {
        const query = `
            SELECT 
                id,
                full_name,
                email,
                volunteer_type,
                is_under_18,
                parent_approved,
                parent_approval_sent_at,
                parent_approved_at,
                parent_email,
                parent_phone
            FROM users 
            WHERE id = $1
        `;
        
        const result = await pool.query(query, [userId]);
        
        if (result.rows.length === 0) {
            throw new Error('User not found');
        }
        
        const user = result.rows[0];
        
        return {
            needsApproval: this.needsParentalApproval(user),
            isApproved: user.parent_approved === true,
            isPending: user.is_under_18 && user.parent_approved === false && user.parent_approval_sent_at,
            sentAt: user.parent_approval_sent_at,
            approvedAt: user.parent_approved_at,
            parentContact: {
                email: user.parent_email,
                phone: user.parent_phone
            }
        };
    }

    /**
     * Resend parental approval request
     * @param {number} userId - User ID
     * @returns {Promise<string>} New approval token
     */
    static async resendApprovalRequest(userId) {
        const user = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        
        if (user.rows.length === 0) {
            throw new Error('User not found');
        }
        
        const userData = user.rows[0];
        
        if (!userData.is_under_18) {
            throw new Error('User does not require parental approval');
        }
        
        if (userData.parent_approved === true) {
            throw new Error('Parental approval already granted');
        }
        
        return await this.createApprovalRequest(
            userId, 
            userData.parent_email, 
            userData.parent_phone
        );
    }
}

export default ParentalApprovalService;
