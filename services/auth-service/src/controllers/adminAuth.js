import User from '../models/User.js';
import { generateTokens } from '../services/tokenService.js';
import bcrypt from 'bcrypt';

/**
 * Admin login
 * POST /api/v1/auth/admin/login
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('[Auth Service] Admin login attempt:', { email });

        if (!email || !password) {
            console.log('[Auth Service] Admin login failed: Missing email or password');
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        const user = await User.findByEmail(email);

        console.log('[Auth Service] Admin login - User lookup result:',
            user ? { id: user.id, email: user.email, role: user.role } : 'User not found'
        );

        if (!user) {
            console.log('[Auth Service] Admin login failed: User not found for email:', email);
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        if (user.role !== 'admin') {
            console.log('[Auth Service] Admin login failed: User role is not admin. Role:', user.role);
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        console.log('[Auth Service] Admin login - Attempting password verification');
        const isValidPassword = await User.comparePassword(password, user.password_hash);
        console.log('[Auth Service] Admin login - Password verification result:', isValidPassword);

        if (!isValidPassword) {
            console.log('[Auth Service] Admin login failed: Invalid password for user:', user.email);
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        const tokens = generateTokens(user);

        console.log('[Auth Service] Admin login successful:', user.email);

        res.json({
            success: true,
            message: 'Admin login successful',
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                role: user.role
            },
            ...tokens
        });
    } catch (error) {
        console.error('[Auth Service] Admin login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during admin login'
        });
    }
};

/**
 * Admin signup (requires secret code)
 * POST /api/v1/auth/admin/signup
 */
export const signup = async (req, res) => {
    try {
        const { full_name, email, password, secret_code } = req.body;

        console.log('[Auth Service] Admin signup attempt:', { full_name, email });

        if (!full_name || !email || !password || !secret_code) {
            return res.status(400).json({
                success: false,
                error: 'Full name, email, password, and secret code are required'
            });
        }

        // Verify secret code - support both single code and array of codes
        let validCodes = [];

        if (process.env.ADMIN_SECRET_CODE) {
            validCodes.push(process.env.ADMIN_SECRET_CODE);
        }

        if (process.env.ADMIN_SECRET_CODES) {
            try {
                const codes = JSON.parse(process.env.ADMIN_SECRET_CODES);
                validCodes = validCodes.concat(codes);
            } catch (e) {
                console.error('[Auth Service] Failed to parse ADMIN_SECRET_CODES:', e);
            }
        }

        if (validCodes.length === 0) {
            console.error('[Auth Service] No admin secret codes configured in environment');
            return res.status(401).json({
                success: false,
                error: 'Admin signup is not configured'
            });
        }

        if (!validCodes.includes(secret_code)) {
            console.log('[Auth Service] Invalid secret code attempt:', secret_code);
            return res.status(401).json({
                success: false,
                error: 'Invalid secret code'
            });
        }

        // Check if admin exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'User with this email already exists'
            });
        }

        // Create admin user
        const passwordHash = await bcrypt.hash(password, 10);
        const username = email.split('@')[0] + '_admin';

        const newAdmin = await User.create({
            username,
            full_name,
            email,
            password,
            role: 'admin'
        });

        const tokens = generateTokens(newAdmin);

        console.log('[Auth Service] Admin signup successful:', newAdmin.email);

        res.status(201).json({
            success: true,
            message: 'Admin registration successful',
            user: {
                id: newAdmin.id,
                email: newAdmin.email,
                fullName: newAdmin.full_name,
                role: newAdmin.role
            },
            ...tokens
        });
    } catch (error) {
        console.error('[Auth Service] Admin signup error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during admin registration'
        });
    }
};

export default {
    login,
    signup
};
