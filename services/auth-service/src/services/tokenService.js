import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Generate JWT access token
 * @param {Object} payload - User data to include in token
 * @returns {string} JWT token
 */
export const generateAccessToken = (payload) => {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: 'talktime-api',
        audience: 'talktime-clients'
    });
};

/**
 * Generate JWT refresh token
 * @param {Object} payload - User data to include in token
 * @returns {string} JWT refresh token
 */
export const generateRefreshToken = (payload) => {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_REFRESH_EXPIRES_IN,
        issuer: 'talktime-api',
        audience: 'talktime-clients'
    });
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
export const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET, {
            issuer: 'talktime-api',
            audience: 'talktime-clients'
        });
    } catch (error) {
        throw new Error(`Invalid token: ${error.message}`);
    }
};

/**
 * Generate tokens for user authentication
 * @param {Object} user - User object from database
 * @returns {Object} Access and refresh tokens with metadata
 */
export const generateTokens = (user) => {
    const payload = {
        id: user.id,
        email: user.email || null,
        role: user.role,
        fullName: user.full_name || user.fullName,
        full_name: user.full_name || user.fullName,
        username: user.username || null,
        // Role-specific data
        ...(user.role === 'student' && {
            admissionNumber: user.admission_number || user.username,
            studentId: user.id
        }),
        ...(user.role === 'volunteer' && {
            volunteerId: user.id,
            volunteer_type: user.volunteer_type || null,
            isStudentVolunteer: user.is_student_volunteer || false,
            is_approved: user.is_approved !== undefined ? user.is_approved : true
        }),
        ...(user.role === 'admin' && {
            adminId: user.id,
            permissions: ['all']
        })
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken({ id: user.id, role: user.role });

    return {
        accessToken,
        refreshToken,
        expiresIn: JWT_EXPIRES_IN,
        tokenType: 'Bearer'
    };
};

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null if not found
 */
export const extractTokenFromHeader = (authHeader) => {
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null;
    }

    return parts[1];
};

/**
 * Decode token payload without verification (for introspection)
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null
 */
export const decodeToken = (token) => {
    try {
        return jwt.decode(token);
    } catch {
        return null;
    }
};

/**
 * Generate a password reset token
 * @param {Object} user - User object
 * @returns {string} Reset token (15 min expiry)
 */
export const generateResetToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            purpose: 'password_reset'
        },
        JWT_SECRET,
        { expiresIn: '15m' }
    );
};

/**
 * Verify password reset token
 * @param {string} token - Reset token
 * @returns {Object} Decoded token
 * @throws {Error} If token is invalid or not a reset token
 */
export const verifyResetToken = (token) => {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.purpose !== 'password_reset') {
        throw new Error('Invalid token purpose');
    }

    return decoded;
};

export default {
    generateAccessToken,
    generateRefreshToken,
    generateTokens,
    verifyToken,
    extractTokenFromHeader,
    decodeToken,
    generateResetToken,
    verifyResetToken
};
