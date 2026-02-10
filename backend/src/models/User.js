import pool from '../config/database.js';
import bcrypt from 'bcrypt';
import { capitalizeName } from '../utils/nameUtils.js';

const SALT_ROUNDS = 10;

class User {
    /**
     * Create a new user with a hashed password.
     * @param {object} userData - The user's data.
     * @param {string} userData.username - The user's username.
     * @param {string} userData.email - The user's email.
     * @param {string} userData.password - The user's plain text password.
     * @param {string} [userData.role='volunteer'] - The user's role.
     * @param {string} [userData.volunteer_type='standard'] - The volunteer type (standard, student_volunteer).
     * @param {boolean} [userData.is_under_18=false] - If the user is under 18.
     * @param {string} [userData.parent_email] - The parent's email, if required.
     * @param {string} [userData.parent_phone] - The parent's phone, if required.
     * @returns {Promise<object>} The newly created user.
     */
    static async create(userData) {
        const {
            username,
            full_name,
            fullName = full_name, // Support both naming conventions
            email,
            password,
            age,
            gender,
            phone,
            isStudent,
            is_student_volunteer = isStudent || false,
            volunteer_type = is_student_volunteer ? 'student_volunteer' : 'standard',
            schoolName,
            school_name = schoolName,
            parentEmail,
            parent_email = parentEmail,
            parentPhone,
            parent_phone = parentPhone,
            role = 'volunteer',
            is_under_18 = false
        } = userData;

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Capitalize name fields for proper formatting
        const capitalizedFullName = capitalizeName(fullName);

        // Determine approval status based on age
        // Under 18 users start with parent_approved = false and need approval
        // 18+ users are automatically approved
        const isApproved = true; // All users can use the app
        const parentApproved = is_under_18 ? false : null; // null means not applicable

        const result = await pool.query(
            `INSERT INTO users (
                username, full_name, email, password_hash, role, volunteer_type,
                age, gender, phone, school_name, parent_email, parent_phone,
                is_under_18, is_approved, parent_approved
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *`,
            [
                username || email, capitalizedFullName, email, passwordHash, role, volunteer_type,
                age, gender, phone, school_name, parent_email, parent_phone,
                is_under_18, isApproved, parentApproved
            ]
        );
        return result.rows[0];
    }

    static async findByEmail(email) {
        const result = await pool.query(
            'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
            [email]
        );
        return result.rows[0] || null;
    }

    static async findById(id) {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    static async findByUsernameOrEmail(identifier) {
        const result = await pool.query(
            'SELECT * FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)',
            [identifier]
        );
        return result.rows[0] || null;
    }

    /**
     * Compare a plain text password with a user's hashed password.
     * @param {string} plainTextPassword - The password to check.
     * @param {string} hashedPassword - The hash from the database.
     * @returns {Promise<boolean>} True if the passwords match.
     */
    static async comparePassword(plainTextPassword, hashedPassword) {
        return bcrypt.compare(plainTextPassword, hashedPassword);
    }
    
    /**
     * Update user information
     * @param {number} id - The user ID
     * @param {object} updateData - The data to update
     * @returns {Promise<object>} The updated user
     */
    static async update(id, updateData) {
        const fields = [];
        const values = [];
        let index = 1;

        // Fields that should be capitalized
        const nameFields = ['full_name', 'fullName', 'guardian_name'];

        // Build dynamic query based on provided fields
        for (const [key, value] of Object.entries(updateData)) {
            fields.push(`${key} = $${index}`);
            // Capitalize name fields
            if (nameFields.includes(key) && typeof value === 'string') {
                values.push(capitalizeName(value));
            } else {
                values.push(value);
            }
            index++;
        }
        
        if (fields.length === 0) {
            throw new Error('No fields to update');
        }
        
        values.push(id); // Add user ID for WHERE clause
        
        const query = `
            UPDATE users 
            SET ${fields.join(', ')}
            WHERE id = $${index}
            RETURNING *;
        `;
        
        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    }
    
    /**
     * Update user password
     * @param {number} id - The user ID
     * @param {string} newPassword - The new password
     * @returns {Promise<object>} The updated user
     */
    static async updatePassword(id, newPassword) {
        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        
        const query = `
            UPDATE users 
            SET password_hash = $1
            WHERE id = $2
            RETURNING *;
        `;
        
        try {
            const result = await pool.query(query, [passwordHash, id]);
            return result.rows[0];
        } catch (error) {
            console.error('Error updating password:', error);
            throw error;
        }
    }
}

export default User;
