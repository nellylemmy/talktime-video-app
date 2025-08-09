/**
 * Admin Login Controller for API v1
 * Handles admin authentication via API
 */
import bcrypt from 'bcrypt';

/**
 * Admin login controller
 * Handles admin authentication and jwt_auth creation
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Support both email-based and username-based login for testing
        if ((email === 'nelsonlemmy@gmail.com' && password === 'neleki') || 
            (email === 'admin' && password === 'password')) {
            
            // Clear any existing role-specific jwt_auth cookies to ensure complete isolation
            res.clearCookie('talktime.volunteer.sid', { 
                path: '/', 
                httpOnly: true, 
                sameSite: 'lax',
                domain: undefined // Ensure it clears for current domain
            });
            res.clearCookie('talktime.student.sid', { 
                path: '/', 
                httpOnly: true, 
                sameSite: 'lax',
                domain: undefined // Ensure it clears for current domain
            });
            res.clearCookie('talktime.default.sid', { 
                path: '/', 
                httpOnly: true, 
                sameSite: 'lax',
                domain: undefined // Clear any default jwt_auth
            });
            res.clearCookie('talktime.sid', { 
                path: '/', 
                httpOnly: true, 
                sameSite: 'lax',
                domain: undefined // Clear any legacy jwt_auth
            });
            res.clearCookie('connect.sid', { 
                path: '/', 
                httpOnly: true, 
                sameSite: 'lax',
                domain: undefined // Clear any connect jwt_auth
            });
            console.log('🧹 Cleared all conflicting jwt_auth cookies for admin login (adminLoginController)');
            
            // Generate JWT token for legacy admin
            const token = jwt.sign(
                {
                    id: 'admin', // Use a special ID for legacy admin
                    username: email, 
                    role: 'admin',
                    fullName: 'Administrator',
                    email: email === 'admin' ? 'admin@talktime.com' : email
                },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );
            console.log('👑 Generated JWT token for admin (adminLoginController):', email);
            
            // Return success with JWT token
            return res.status(200).json({
                success: true,
                message: 'Admin login successful',
                token,
                user: { 
                    username: email, 
                    role: 'admin' 
                }
            });
        } else {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Server error during admin login' });
    }
};
