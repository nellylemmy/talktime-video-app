import express from 'express';
import User from '../models/User.js';
import { verifyToken, extractTokenFromHeader, decodeToken } from '../services/tokenService.js';

const router = express.Router();

// Internal API key validation middleware
const validateInternalApiKey = (req, res, next) => {
    const apiKey = req.headers['x-internal-api-key'];
    const expectedKey = process.env.INTERNAL_API_KEY;

    if (!expectedKey) {
        console.warn('[Auth Service] INTERNAL_API_KEY not configured, allowing all internal requests');
        return next();
    }

    if (apiKey !== expectedKey) {
        return res.status(401).json({
            success: false,
            error: 'Invalid internal API key'
        });
    }

    next();
};

/**
 * @route   POST /internal/token/introspect
 * @desc    Validate token and return decoded user (service-to-service)
 * @access  Internal (requires API key)
 */
router.post('/token/introspect', validateInternalApiKey, async (req, res) => {
    try {
        const { token } = req.body;

        // Also check Authorization header
        const authToken = token || extractTokenFromHeader(req.headers.authorization);

        if (!authToken) {
            return res.status(400).json({
                success: false,
                active: false,
                error: 'Token is required'
            });
        }

        try {
            const decoded = verifyToken(authToken);

            // Optionally fetch fresh user data
            let user = null;
            if (req.query.fresh === 'true') {
                user = await User.findById(decoded.id);
                if (!user) {
                    return res.json({
                        success: false,
                        active: false,
                        error: 'User not found'
                    });
                }
            }

            res.json({
                success: true,
                active: true,
                user: user ? {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    full_name: user.full_name,
                    role: user.role,
                    volunteer_type: user.volunteer_type,
                    is_approved: user.is_approved
                } : decoded,
                tokenInfo: {
                    id: decoded.id,
                    role: decoded.role,
                    iat: decoded.iat,
                    exp: decoded.exp,
                    iss: decoded.iss,
                    aud: decoded.aud
                }
            });
        } catch (tokenError) {
            return res.json({
                success: false,
                active: false,
                error: tokenError.message
            });
        }
    } catch (error) {
        console.error('[Auth Service] Token introspection error:', error);
        res.status(500).json({
            success: false,
            active: false,
            error: 'Internal server error'
        });
    }
});

/**
 * @route   POST /internal/token/validate
 * @desc    Quick token validation (returns boolean only)
 * @access  Internal (requires API key)
 */
router.post('/token/validate', validateInternalApiKey, (req, res) => {
    try {
        const { token } = req.body;
        const authToken = token || extractTokenFromHeader(req.headers.authorization);

        if (!authToken) {
            return res.json({ valid: false });
        }

        try {
            verifyToken(authToken);
            res.json({ valid: true });
        } catch {
            res.json({ valid: false });
        }
    } catch (error) {
        res.json({ valid: false });
    }
});

/**
 * @route   POST /internal/token/decode
 * @desc    Decode token without verification (for debugging)
 * @access  Internal (requires API key)
 */
router.post('/token/decode', validateInternalApiKey, (req, res) => {
    try {
        const { token } = req.body;
        const authToken = token || extractTokenFromHeader(req.headers.authorization);

        if (!authToken) {
            return res.status(400).json({
                success: false,
                error: 'Token is required'
            });
        }

        const decoded = decodeToken(authToken);

        if (!decoded) {
            return res.status(400).json({
                success: false,
                error: 'Invalid token format'
            });
        }

        res.json({
            success: true,
            decoded
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: 'Failed to decode token'
        });
    }
});

/**
 * @route   GET /internal/user/:id
 * @desc    Get user by ID (for other services)
 * @access  Internal (requires API key)
 */
router.get('/user/:id', validateInternalApiKey, async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Return sanitized user (no password hash)
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                full_name: user.full_name,
                role: user.role,
                volunteer_type: user.volunteer_type,
                is_approved: user.is_approved,
                is_under_18: user.is_under_18,
                parent_approved: user.parent_approved,
                created_at: user.created_at
            }
        });
    } catch (error) {
        console.error('[Auth Service] Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * @route   GET /internal/health
 * @desc    Internal health check
 * @access  Internal
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'auth-service',
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

export default router;
