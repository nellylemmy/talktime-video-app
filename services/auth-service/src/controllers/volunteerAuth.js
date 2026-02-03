import User from '../models/User.js';
import { generateTokens, generateResetToken, verifyResetToken } from '../services/tokenService.js';

/**
 * Volunteer login
 * POST /api/v1/auth/volunteer/login
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('[Auth Service] Volunteer login attempt:', email);

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        const user = await User.findByEmailAndRole(email, 'volunteer');

        if (!user || !(await User.comparePassword(password, user.password_hash))) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        const tokens = generateTokens(user);

        console.log('[Auth Service] Volunteer login successful:', user.email);

        res.json({
            success: true,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                full_name: user.full_name,
                role: user.role,
                volunteer_type: user.volunteer_type,
                is_approved: user.is_approved
            }
        });
    } catch (error) {
        console.error('[Auth Service] Volunteer login error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

/**
 * Volunteer signup
 * POST /api/v1/auth/volunteer/signup
 */
export const signup = async (req, res) => {
    try {
        const {
            username,
            full_name,
            email,
            password,
            parent_email,
            parent_phone,
            volunteer_type,
            school_name,
            age,
            gender,
            phone,
            timezone,
            security_questions
        } = req.body;

        console.log('[Auth Service] Volunteer signup attempt:', { username, email, volunteer_type, age });

        // Validate required fields
        if (!username || !full_name || !email || !password || !age || !gender || !phone || !timezone) {
            return res.status(400).json({
                success: false,
                error: 'Username, full name, email, password, age, gender, phone, and timezone are required'
            });
        }

        // Validate timezone format (IANA identifier)
        if (timezone && typeof timezone === 'string') {
            const validTimezonePattern = /^[A-Za-z_]+\/[A-Za-z_]+$/;
            if (!validTimezonePattern.test(timezone)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid timezone format. Please use IANA timezone identifier (e.g., America/New_York)'
                });
            }
        }

        // Validate security questions
        if (!security_questions || !Array.isArray(security_questions) || security_questions.length !== 3) {
            return res.status(400).json({
                success: false,
                error: 'Three security questions are required for password recovery'
            });
        }

        for (let i = 0; i < security_questions.length; i++) {
            const sq = security_questions[i];
            if (!sq.question || !sq.answer || !sq.question.trim() || !sq.answer.trim()) {
                return res.status(400).json({
                    success: false,
                    error: `Security question ${i + 1} must have both question and answer`
                });
            }
        }

        // Check if user exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'User with this email already exists'
            });
        }

        // Determine parental approval requirements
        const isStudentVolunteer = volunteer_type === 'student_volunteer';
        const parsedAge = parseInt(age, 10);
        const actuallyUnder18 = !isNaN(parsedAge) && parsedAge >= 10 && parsedAge < 18;
        const needsParentalApproval = isStudentVolunteer || actuallyUnder18;

        console.log('[Auth Service] Parental approval check:', {
            volunteer_type,
            isStudentVolunteer,
            age: parsedAge,
            actuallyUnder18,
            needsParentalApproval
        });

        if (needsParentalApproval && (!parent_email || !parent_phone)) {
            return res.status(400).json({
                success: false,
                error: 'Parent email and phone are required for parental approval'
            });
        }

        if (isStudentVolunteer && !school_name) {
            return res.status(400).json({
                success: false,
                error: 'School name is required for student volunteers'
            });
        }

        // Create user
        const newUser = await User.create({
            username,
            full_name,
            email,
            password,
            age: parsedAge,
            gender,
            phone,
            timezone,
            volunteer_type: volunteer_type || 'standard',
            school_name: isStudentVolunteer ? school_name : null,
            parent_email: needsParentalApproval ? parent_email : null,
            parent_phone: needsParentalApproval ? parent_phone : null,
            is_under_18: actuallyUnder18,
            role: 'volunteer',
            security_questions
        });

        // Generate tokens
        const tokens = generateTokens(newUser);

        console.log('[Auth Service] Volunteer signup successful:', newUser.email);

        // Return response with parental approval flag
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            needsParentalApproval,
            user: {
                id: newUser.id,
                email: newUser.email,
                fullName: newUser.full_name,
                role: newUser.role,
                parent_email: needsParentalApproval ? parent_email : null
            },
            ...tokens
        });
    } catch (error) {
        console.error('[Auth Service] Volunteer signup error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during registration'
        });
    }
};

/**
 * Get security questions for password recovery
 * POST /api/v1/auth/volunteer/forgot-password
 */
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        console.log('[Auth Service] Password recovery request for:', email);

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        const user = await User.getSecurityQuestions(email, 'volunteer');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'No account found with this email address'
            });
        }

        if (!user.security_question_1 || !user.security_question_2 || !user.security_question_3) {
            return res.status(400).json({
                success: false,
                error: 'This account does not have security questions set up. Please contact support.'
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name
            },
            security_questions: [
                user.security_question_1,
                user.security_question_2,
                user.security_question_3
            ]
        });
    } catch (error) {
        console.error('[Auth Service] Password recovery error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

/**
 * Verify security answers
 * POST /api/v1/auth/volunteer/verify-security-answers
 */
export const verifySecurityAnswers = async (req, res) => {
    try {
        const { email, security_answers } = req.body;

        console.log('[Auth Service] Security answers verification for:', email);

        if (!email || !security_answers || !Array.isArray(security_answers) || security_answers.length !== 3) {
            return res.status(400).json({
                success: false,
                error: 'Email and three security answers are required'
            });
        }

        const user = await User.verifySecurityAnswers(email, 'volunteer', security_answers);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'One or more security answers are incorrect'
            });
        }

        const resetToken = generateResetToken(user);

        console.log('[Auth Service] Security answers verified successfully for:', user.email);

        res.json({
            success: true,
            message: 'Security answers verified successfully',
            reset_token: resetToken,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name
            }
        });
    } catch (error) {
        console.error('[Auth Service] Security answers verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

/**
 * Reset password
 * POST /api/v1/auth/volunteer/reset-password
 */
export const resetPassword = async (req, res) => {
    try {
        const { reset_token, new_password } = req.body;

        console.log('[Auth Service] Password reset attempt with token');

        if (!reset_token || !new_password) {
            return res.status(400).json({
                success: false,
                error: 'Reset token and new password are required'
            });
        }

        let decoded;
        try {
            decoded = verifyResetToken(reset_token);
        } catch (tokenError) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired reset token'
            });
        }

        const user = await User.updatePassword(decoded.id, new_password);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        console.log('[Auth Service] Password reset successful for:', user.email);

        res.json({
            success: true,
            message: 'Password reset successfully',
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name
            }
        });
    } catch (error) {
        console.error('[Auth Service] Password reset error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

export default {
    login,
    signup,
    forgotPassword,
    verifySecurityAnswers,
    resetPassword
};
