import User from '../models/User.js';
import { generateTokens } from '../services/tokenService.js';

/**
 * Student login
 * POST /api/v1/auth/student/login
 */
export const login = async (req, res) => {
    try {
        const { name, admission_number } = req.body;

        console.log('[Auth Service] Student login attempt:', { name, admission_number });

        if (!name || !admission_number) {
            return res.status(400).json({
                success: false,
                error: 'Full name and admission number are required'
            });
        }

        const student = await User.findStudentByCredentials(name, admission_number);

        if (!student) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials. Please check your name and admission number.'
            });
        }

        // Create user object for token generation
        const userForToken = {
            id: student.id,
            role: 'student',
            full_name: student.full_name,
            admission_number: student.username
        };

        const tokens = generateTokens(userForToken);

        console.log('[Auth Service] Student login successful:', student.full_name);

        res.json({
            success: true,
            message: 'Login successful',
            student: {
                id: student.id,
                fullName: student.full_name,
                admissionNumber: student.username
            },
            user: {
                id: student.id,
                fullName: student.full_name,
                role: 'student'
            },
            ...tokens
        });
    } catch (error) {
        console.error('[Auth Service] Student login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during login'
        });
    }
};

/**
 * Student logout (client-side token removal)
 * POST /api/v1/auth/student/logout
 */
export const logout = async (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
};

export default {
    login,
    logout
};
