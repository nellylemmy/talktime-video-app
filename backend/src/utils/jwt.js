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
 * @param {Object} user - User object
 * @returns {Object} Access and refresh tokens
 */
export const generateTokens = (user) => {
    const payload = {
        id: user.id,
        email: user.email || null,
        role: user.role,
        fullName: user.full_name || user.fullName,
        // Role-specific data
        ...(user.role === 'student' && {
            admissionNumber: user.admission_number,
            studentId: user.id
        }),
        ...(user.role === 'volunteer' && {
            volunteerId: user.id,
            isStudentVolunteer: user.is_student_volunteer || false
        }),
        ...(user.role === 'admin' && {
            adminId: user.id,
            permissions: ['all'] // Admins have all permissions
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
 * Create JWT middleware for route protection
 * @param {Array} allowedRoles - Array of roles allowed to access the route
 * @returns {Function} Express middleware function
 */
export const createJWTMiddleware = (allowedRoles = []) => {
    return (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            const token = extractTokenFromHeader(authHeader);

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    message: 'No token provided'
                });
            }

            const decoded = verifyToken(token);
            
            // Check if user role is allowed
            if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied',
                    message: `Role '${decoded.role}' is not authorized for this resource`
                });
            }

            // Add user info to request
            req.user = decoded;
            req.token = token;
            
            next();
        } catch (error) {
            console.error('JWT Middleware Error:', error);
            return res.status(401).json({
                success: false,
                error: 'Invalid token',
                message: error.message
            });
        }
    };
};

/**
 * Admin superuser middleware - allows admin to access any route
 * @param {Array} allowedRoles - Array of roles normally allowed
 * @returns {Function} Express middleware function
 */
export const createAdminSuperuserMiddleware = (allowedRoles = []) => {
    return (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            const token = extractTokenFromHeader(authHeader);

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    message: 'No token provided'
                });
            }

            const decoded = verifyToken(token);
            
            // Admin has superuser access to everything
            if (decoded.role === 'admin') {
                req.user = decoded;
                req.token = token;
                req.isSuperuser = true;
                return next();
            }
            
            // Check if user role is allowed (non-admin users)
            if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied',
                    message: `Role '${decoded.role}' is not authorized for this resource`
                });
            }

            req.user = decoded;
            req.token = token;
            req.isSuperuser = false;
            
            next();
        } catch (error) {
            console.error('JWT Admin Superuser Middleware Error:', error);
            return res.status(401).json({
                success: false,
                error: 'Invalid token',
                message: error.message
            });
        }
    };
};

export default {
    generateAccessToken,
    generateRefreshToken,
    generateTokens,
    verifyToken,
    extractTokenFromHeader,
    createJWTMiddleware,
    createAdminSuperuserMiddleware
};
