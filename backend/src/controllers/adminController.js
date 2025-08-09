/**
 * Admin Controller
 * Handles all admin-related API endpoints
 */
import bcrypt from 'bcrypt';
import pool from '../config/database.js';

/**
 * Admin login handler
 */
export const login = async (req, res) => {
  try {
    const { email, password, remember_me } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find admin user by email
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND role = $2',
      [email, 'admin']
    );

    // Check if admin exists
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = result.rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if admin is approved
    if (!admin.is_approved) {
      return res.status(403).json({ error: 'Account not approved' });
    }

    // Generate JWT token for admin authentication
    const jwt = require('jsonwebtoken');
    const tokenPayload = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      fullName: admin.full_name
    };
    
    // Set token expiry based on remember_me option
    const tokenOptions = {
      expiresIn: remember_me ? '30d' : '24h'
    };
    
    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, tokenOptions);

    // Return success with JWT token
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      accessToken: accessToken,
      user: {
        id: admin.id,
        name: admin.full_name,
        email: admin.email,
        role: admin.role,
        fullName: admin.full_name
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Admin signup handler
 */
export const signup = async (req, res) => {
  try {
    const { full_name, email, password, secret_code } = req.body;

    // Validate input
    if (!full_name || !email || !password || !secret_code) {
      return res.status(400).json({ 
        error: 'Full name, email, password, and secret code are required' 
      });
    }

    // Check if the secret code is valid
    const adminSecretCode = process.env.ADMIN_SECRET_CODE;
    if (!adminSecretCode || secret_code !== adminSecretCode) {
      return res.status(401).json({ error: 'Invalid admin secret code' });
    }

    // Check if email already exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create admin user
    const result = await pool.query(
      `INSERT INTO users (username, full_name, email, password_hash, role, is_approved)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, email, role, is_approved`,
      [email, full_name, email, hashedPassword, 'admin', true]
    );

    const newAdmin = result.rows[0];

    // Generate JWT token for new admin
    const tokenPayload = {
      id: newAdmin.id,
      email: newAdmin.email,
      role: newAdmin.role,
      fullName: newAdmin.full_name
    };
    
    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });

    // Return success with JWT token
    return res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      accessToken: accessToken,
      user: {
        id: newAdmin.id,
        name: newAdmin.full_name,
        email: newAdmin.email,
        role: newAdmin.role,
        fullName: newAdmin.full_name
      }
    });
  } catch (error) {
    console.error('Admin signup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get admin authentication status (JWT-based)
 */
export const getjwt_authStatus = async (req, res) => {
  try {
    // JWT middleware ensures req.user exists and is authenticated
    // Check if user is an admin (additional role validation)
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Return user data from JWT token
    return res.status(200).json({
      isAuthenticated: true,
      authenticated: true,
      user: {
        id: req.user.id,
        name: req.user.fullName,
        email: req.user.email,
        role: req.user.role,
        fullName: req.user.fullName
      }
    });
  } catch (error) {
    console.error('Admin jwt_auth status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Admin logout handler (JWT-based)
 */
export const logout = (req, res) => {
  // With JWT authentication, logout is handled client-side by removing the token
  // The server doesn't need to maintain any jwt_auth state
  // Optionally, we could implement a token blacklist for enhanced security
  
  return res.status(200).json({ 
    success: true,
    message: 'Logged out successfully. Please remove the JWT token from client storage.' 
  });
};

/**
 * Admin dashboard data
 */
export const getDashboardData = async (req, res) => {
  try {
    // JWT middleware ensures req.user exists and is authenticated
    // Check if user is an admin (additional role validation)
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get counts from database
    const studentsResult = await pool.query('SELECT COUNT(*) FROM users WHERE role = \'student\';');
    const volunteersResult = await pool.query(
      'SELECT COUNT(*) FROM users WHERE role = $1',
      ['volunteer']
    );
    const meetingsResult = await pool.query('SELECT COUNT(*) FROM meetings');
    const completedMeetingsResult = await pool.query(
      'SELECT COUNT(*) FROM meetings WHERE status = $1',
      ['completed']
    );

    // Return dashboard data
    return res.status(200).json({
      students: parseInt(studentsResult.rows[0].count),
      volunteers: parseInt(volunteersResult.rows[0].count),
      meetings: parseInt(meetingsResult.rows[0].count),
      completedMeetings: parseInt(completedMeetingsResult.rows[0].count)
    });
  } catch (error) {
    console.error('Admin dashboard data error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
