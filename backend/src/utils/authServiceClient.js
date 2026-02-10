import dotenv from 'dotenv';
import {
    verifyToken,
    extractTokenFromHeader,
    generateTokens,
    createJWTMiddleware
} from './jwt.js';

dotenv.config();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3002';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';
const USE_AUTH_SERVICE = process.env.USE_AUTH_SERVICE === 'true';

/**
 * Introspect token with auth service
 * @param {string} token - JWT token to validate
 * @returns {Promise<Object>} Introspection result
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
 * Create middleware that validates tokens via auth service with local fallback
 * @param {Array} allowedRoles - Roles allowed to access the route
 * @returns {Function} Express middleware
 */
export const createAuthServiceMiddleware = (allowedRoles = []) => {
    // If auth service is disabled, use local JWT middleware
    if (!USE_AUTH_SERVICE) {
        console.log('[Auth Client] Using local JWT middleware (USE_AUTH_SERVICE=false)');
        return createJWTMiddleware(allowedRoles);
    }

    return async (req, res, next) => {
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

            let decoded;
            let useLocalFallback = false;

            try {
                // Try auth service first
                const result = await introspectToken(token);

                if (!result.active) {
                    return res.status(401).json({
                        success: false,
                        error: 'Invalid token',
                        message: result.error || 'Token validation failed'
                    });
                }

                decoded = result.user;
            } catch (authServiceError) {
                // Auth service unavailable, fall back to local validation
                console.warn('[Auth Client] Auth service unavailable, using local fallback:', authServiceError.message);
                useLocalFallback = true;

                try {
                    decoded = verifyToken(token);
                } catch (localError) {
                    return res.status(401).json({
                        success: false,
                        error: 'Invalid token',
                        message: localError.message
                    });
                }
            }

            // Check role authorization
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
            req.authServiceUsed = !useLocalFallback;

            next();
        } catch (error) {
            console.error('[Auth Client] Middleware error:', error);
            return res.status(401).json({
                success: false,
                error: 'Authentication error',
                message: error.message
            });
        }
    };
};

/**
 * Create admin superuser middleware with auth service support
 * @param {Array} allowedRoles - Roles normally allowed
 * @returns {Function} Express middleware
 */
export const createAdminSuperuserAuthServiceMiddleware = (allowedRoles = []) => {
    if (!USE_AUTH_SERVICE) {
        // Import and use local middleware
        const { createAdminSuperuserMiddleware } = require('./jwt.js');
        return createAdminSuperuserMiddleware(allowedRoles);
    }

    return async (req, res, next) => {
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

            let decoded;

            try {
                const result = await introspectToken(token);

                if (!result.active) {
                    return res.status(401).json({
                        success: false,
                        error: 'Invalid token',
                        message: result.error || 'Token validation failed'
                    });
                }

                decoded = result.user;
            } catch (authServiceError) {
                console.warn('[Auth Client] Auth service unavailable, using local fallback');
                decoded = verifyToken(token);
            }

            // Admin has superuser access
            if (decoded.role === 'admin') {
                req.user = decoded;
                req.token = token;
                req.isSuperuser = true;
                return next();
            }

            // Check role authorization for non-admin users
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
            console.error('[Auth Client] Admin middleware error:', error);
            return res.status(401).json({
                success: false,
                error: 'Authentication error',
                message: error.message
            });
        }
    };
};

/**
 * Proxy authentication request to auth service
 * @param {string} endpoint - Auth endpoint (e.g., '/volunteer/login')
 * @param {Object} body - Request body
 * @returns {Promise<Object>} Auth response
 */
export const proxyAuthRequest = async (endpoint, body) => {
    const response = await fetch(`${AUTH_SERVICE_URL}/api/v1/auth${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    return response.json();
};

/**
 * Check auth service health
 * @returns {Promise<boolean>}
 */
export const checkAuthServiceHealth = async () => {
    try {
        const response = await fetch(`${AUTH_SERVICE_URL}/health`, {
            method: 'GET',
            timeout: 5000
        });
        return response.ok;
    } catch {
        return false;
    }
};

export default {
    createAuthServiceMiddleware,
    createAdminSuperuserAuthServiceMiddleware,
    proxyAuthRequest,
    checkAuthServiceHealth,
    introspectToken
};
