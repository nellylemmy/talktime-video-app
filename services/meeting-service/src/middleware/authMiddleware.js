import dotenv from 'dotenv';

dotenv.config();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3002';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

/**
 * Introspect token with auth service
 * @param {string} token
 * @returns {Promise<Object>}
 */
const introspectToken = async (token) => {
    const response = await fetch(`${AUTH_SERVICE_URL}/internal/token/introspect`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': INTERNAL_API_KEY
        },
        body: JSON.stringify({ token })
    });

    if (!response.ok) {
        throw new Error(`Auth service returned ${response.status}`);
    }

    return response.json();
};

/**
 * Extract token from Authorization header
 */
const extractToken = (authHeader) => {
    if (!authHeader) return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
    return parts[1];
};

/**
 * JWT authentication middleware using auth service
 * @param {Array} allowedRoles - Roles allowed to access
 */
export const createAuthMiddleware = (allowedRoles = []) => {
    return async (req, res, next) => {
        try {
            const token = extractToken(req.headers.authorization);

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    message: 'No token provided'
                });
            }

            try {
                const result = await introspectToken(token);

                if (!result.active) {
                    return res.status(401).json({
                        success: false,
                        error: 'Invalid token',
                        message: result.error || 'Token validation failed'
                    });
                }

                // Check role authorization
                if (allowedRoles.length > 0 && !allowedRoles.includes(result.user.role)) {
                    return res.status(403).json({
                        success: false,
                        error: 'Access denied',
                        message: `Role '${result.user.role}' is not authorized`
                    });
                }

                req.user = result.user;
                req.token = token;
                next();
            } catch (authError) {
                console.error('[Meeting Service] Auth service error:', authError.message);
                return res.status(503).json({
                    success: false,
                    error: 'Auth service unavailable',
                    message: 'Please try again later'
                });
            }
        } catch (error) {
            console.error('[Meeting Service] Auth middleware error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal error'
            });
        }
    };
};

// Pre-configured middleware instances
export const jwtAuth = createAuthMiddleware();
export const volunteerAuth = createAuthMiddleware(['volunteer']);
export const studentAuth = createAuthMiddleware(['student']);
export const adminAuth = createAuthMiddleware(['admin']);
export const adminOrVolunteerAuth = createAuthMiddleware(['admin', 'volunteer']);
export const adminOrStudentAuth = createAuthMiddleware(['admin', 'student']);

export default {
    createAuthMiddleware,
    jwtAuth,
    volunteerAuth,
    studentAuth,
    adminAuth,
    adminOrVolunteerAuth,
    adminOrStudentAuth
};
