/**
 * Admin Secret Code Model
 * Handles database operations for admin secret codes
 */
import pool from '../config/database.js';

class AdminSecretCode {
    /**
     * Create a new admin secret code
     * @param {String} code - 6-digit secret code
     * @returns {Object} Created code object
     */
    static async create(code) {
        try {
            const query = 'INSERT INTO admin_secret_codes (code) VALUES ($1) RETURNING *';
            const values = [code];
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('Error creating admin secret code:', error);
            throw error;
        }
    }

    /**
     * Find an admin secret code
     * @param {String} code - 6-digit secret code to find
     * @returns {Object|null} Found code object or null
     */
    static async findByCode(code) {
        try {
            const query = 'SELECT * FROM admin_secret_codes WHERE code = $1';
            const values = [code];
            const result = await pool.query(query, values);
            return result.rows[0] || null;
        } catch (error) {
            console.error('Error finding admin secret code:', error);
            throw error;
        }
    }

    /**
     * Get all admin secret codes
     * @returns {Array} List of all admin secret codes
     */
    static async findAll() {
        try {
            const query = 'SELECT * FROM admin_secret_codes';
            const result = await pool.query(query);
            return result.rows;
        } catch (error) {
            console.error('Error fetching admin secret codes:', error);
            throw error;
        }
    }

    /**
     * Delete all admin secret codes
     * @returns {Number} Number of deleted codes
     */
    static async deleteAll() {
        try {
            const query = 'DELETE FROM admin_secret_codes RETURNING *';
            const result = await pool.query(query);
            return result.rowCount;
        } catch (error) {
            console.error('Error deleting admin secret codes:', error);
            throw error;
        }
    }
}

export default AdminSecretCode;
