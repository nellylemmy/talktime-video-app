/**
 * Authentication API Controller
 * Handles all authentication-related API endpoints
 */
import User from '../../../models/User.js';
import bcrypt from 'bcrypt';

/**
 * Login user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} User info and JWT token
 */
export const login = async (req, res) => {
    try {
        console.log('Login attempt:', req.body);
        const { email, password } = req.body;
        
        if (!email || !password) {
            console.log('Missing email or password');
            return res.status(400).json({ 
                success: false,
                error: 'Email and password are required' 
            });
        }
        
        console.log('Finding user by email:', email);
        const user = await User.findByEmail(email);
        console.log('User found:', user ? 'Yes' : 'No');
        
        if (!user) {
            console.log('User not found');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid credentials' 
            });
        }
        
        console.log('Comparing password with hash');
        const isMatch = await bcrypt.compare(password, user.password_hash);
        console.log('Password match:', isMatch ? 'Yes' : 'No');
        
        if (!isMatch) {
            console.log('Password does not match');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid credentials' 
            });
        }
        
        // Check if user is approved
        if (user.role !== 'admin' && !user.is_approved) {
            return res.status(403).json({
                success: false,
                error: 'Your account is pending approval. Please wait for an administrator to approve your account.'
            });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                fullName: user.full_name || user.fullName,
                email: user.email,
                role: user.role,
                isApproved: user.is_approved || false
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        console.log(`🔑 Generated JWT token for ${user.role}:`, user.email);
        
        // Return success response with JWT token
        return res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                fullName: user.full_name || user.fullName,
                email: user.email,
                role: user.role,
                isApproved: user.is_approved || false
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

/**
 * Register new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} User info and jwt_auth token
 */
export const register = async (req, res) => {
    try {
        const {
            fullName,
            email,
            password,
            role = 'volunteer',
            age,
            parentEmail,
            parentPhone
        } = req.body;
        
        // Validate required fields
        if (!fullName || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }
        
        // Check if user already exists
        const existingUser = await User.findByEmail(email);
        
        if (existingUser) {
            return res.status(409).json({ error: 'Email already in use' });
        }
        
        // Create user - User.create will handle password hashing
        const user = await User.create({
            fullName,
            email,
            password,
            role,
            age: parseInt(age) || null,
            parentEmail: parentEmail || null,
            parentPhone: parentPhone || null,
            isApproved: age && parseInt(age) < 18 ? false : true
        });
        
        // Generate JWT token for new user
        const token = jwt.sign(
            {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        // Return user info with JWT token (excluding password)
        res.status(201).json({
            user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                isApproved: user.isApproved
            },
            token,
            message: 'Registration successful'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
};

/**
 * Get current user info
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} User info
 */
export const getCurrentUser = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Return user info (excluding password)
        res.json({
            user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                isApproved: user.isApproved
            }
        });
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
};

/**
 * Logout user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Success message
 */
export const logout = (req, res) => {
    req.jwt_auth.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ error: 'Failed to logout' });
        }
        
        res.clearCookie('connect.sid');
        res.json({ message: 'Logout successful' });
    });
};

/**
 * Check if user is authenticated as admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Success message or error
 */
export const checkAdminAuth = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        // Handle legacy admin JWT tokens
        if (req.user.id === 'admin' && req.user.role === 'admin') {
            console.log('👑 Legacy admin JWT detected - granting access');
            return res.json({
                isAdmin: true,
                user: {
                    id: req.user.id,
                    fullName: req.user.fullName || 'Administrator',
                    email: req.user.email || 'admin@talktime.com',
                    role: req.user.role
                }
            });
        }
        
        // Handle database-based admin users
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }
        
        res.json({
            isAdmin: true,
            user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Admin auth check error:', error);
        res.status(500).json({ error: 'Failed to verify admin status' });
    }
};
