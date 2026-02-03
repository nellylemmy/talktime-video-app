import pool from '../config/database.js';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

class User {
    /**
     * Create a new user with a hashed password
     * @param {Object} userData - User data
     * @returns {Promise<Object>} Created user
     */
    static async create(userData) {
        const {
            username,
            full_name,
            fullName = full_name,
            email,
            password,
            age,
            gender,
            phone,
            timezone,
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
            is_under_18 = false,
            security_questions = []
        } = userData;

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // All users can use the app
        const isApproved = true;
        // Under 18 users need parental approval
        const parentApproved = is_under_18 ? false : null;

        // Hash security answers if provided
        let hashedAnswers = [null, null, null];
        if (security_questions && security_questions.length === 3) {
            hashedAnswers = await Promise.all(
                security_questions.map(sq =>
                    sq && sq.answer ? bcrypt.hash(sq.answer.toLowerCase().trim(), SALT_ROUNDS) : null
                )
            );
        }

        const result = await pool.query(
            `INSERT INTO users (
                username, full_name, email, password_hash, role, volunteer_type,
                age, gender, phone, timezone, school_name, parent_email, parent_phone,
                is_under_18, is_approved, parent_approved,
                security_question_1, security_answer_1_hash,
                security_question_2, security_answer_2_hash,
                security_question_3, security_answer_3_hash,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW())
            RETURNING *`,
            [
                username || email,
                fullName,
                email,
                passwordHash,
                role,
                volunteer_type,
                age,
                gender,
                phone,
                timezone || 'Africa/Nairobi',
                school_name,
                parent_email,
                parent_phone,
                is_under_18,
                isApproved,
                parentApproved,
                security_questions[0]?.question || null,
                hashedAnswers[0],
                security_questions[1]?.question || null,
                hashedAnswers[1],
                security_questions[2]?.question || null,
                hashedAnswers[2]
            ]
        );
        return result.rows[0];
    }

    /**
     * Find user by email
     * @param {string} email
     * @returns {Promise<Object|null>}
     */
    static async findByEmail(email) {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0] || null;
    }

    /**
     * Find user by email and role
     * @param {string} email
     * @param {string} role
     * @returns {Promise<Object|null>}
     */
    static async findByEmailAndRole(email, role) {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 AND role = $2',
            [email, role]
        );
        return result.rows[0] || null;
    }

    /**
     * Find user by ID
     * @param {number} id
     * @returns {Promise<Object|null>}
     */
    static async findById(id) {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    /**
     * Find user by username or email
     * @param {string} identifier
     * @returns {Promise<Object|null>}
     */
    static async findByUsernameOrEmail(identifier) {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 OR email = $1',
            [identifier]
        );
        return result.rows[0] || null;
    }

    /**
     * Find student by name and admission number
     * @param {string} name - Full name
     * @param {string} admissionNumber - Admission number (handles ADM prefix)
     * @returns {Promise<Object|null>}
     */
    static async findStudentByCredentials(name, admissionNumber) {
        const trimmed = admissionNumber.trim();
        const normalized = trimmed.startsWith('ADM') ? trimmed : `ADM${trimmed}`;

        const result = await pool.query(
            'SELECT * FROM users WHERE full_name = $1 AND username LIKE $2 AND role = $3',
            [name.trim(), `${normalized}%`, 'student']
        );
        return result.rows[0] || null;
    }

    /**
     * Compare password with hash
     * @param {string} plainTextPassword
     * @param {string} hashedPassword
     * @returns {Promise<boolean>}
     */
    static async comparePassword(plainTextPassword, hashedPassword) {
        return bcrypt.compare(plainTextPassword, hashedPassword);
    }

    /**
     * Update user fields
     * @param {number} id
     * @param {Object} updateData
     * @returns {Promise<Object>}
     */
    static async update(id, updateData) {
        const fields = [];
        const values = [];
        let index = 1;

        for (const [key, value] of Object.entries(updateData)) {
            fields.push(`${key} = $${index}`);
            values.push(value);
            index++;
        }

        if (fields.length === 0) {
            throw new Error('No fields to update');
        }

        values.push(id);

        const query = `
            UPDATE users
            SET ${fields.join(', ')}, updated_at = NOW()
            WHERE id = $${index}
            RETURNING *;
        `;

        const result = await pool.query(query, values);
        return result.rows[0];
    }

    /**
     * Update user password
     * @param {number} id
     * @param {string} newPassword
     * @returns {Promise<Object>}
     */
    static async updatePassword(id, newPassword) {
        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        const result = await pool.query(
            `UPDATE users
             SET password_hash = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING id, email, full_name`,
            [passwordHash, id]
        );

        return result.rows[0];
    }

    /**
     * Get security questions for a user
     * @param {string} email
     * @param {string} role
     * @returns {Promise<Object|null>}
     */
    static async getSecurityQuestions(email, role) {
        const result = await pool.query(
            `SELECT id, email, full_name,
                    security_question_1, security_question_2, security_question_3
             FROM users WHERE email = $1 AND role = $2`,
            [email, role]
        );
        return result.rows[0] || null;
    }

    /**
     * Verify security answers
     * @param {string} email
     * @param {string} role
     * @param {string[]} answers - Array of 3 answers
     * @returns {Promise<Object|null>} User if verified, null otherwise
     */
    static async verifySecurityAnswers(email, role, answers) {
        const result = await pool.query(
            `SELECT id, email, full_name,
                    security_answer_1_hash, security_answer_2_hash, security_answer_3_hash
             FROM users WHERE email = $1 AND role = $2`,
            [email, role]
        );

        const user = result.rows[0];
        if (!user) return null;

        const answer1Valid = await bcrypt.compare(
            answers[0].toLowerCase().trim(),
            user.security_answer_1_hash
        );
        const answer2Valid = await bcrypt.compare(
            answers[1].toLowerCase().trim(),
            user.security_answer_2_hash
        );
        const answer3Valid = await bcrypt.compare(
            answers[2].toLowerCase().trim(),
            user.security_answer_3_hash
        );

        if (answer1Valid && answer2Valid && answer3Valid) {
            return { id: user.id, email: user.email, full_name: user.full_name };
        }

        return null;
    }
}

export default User;
