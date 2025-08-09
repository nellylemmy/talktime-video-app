import express from 'express';
import ParentalApprovalService from '../utils/parentalApproval.js';
import { sendParentalApprovalRequest, sendParentalApprovalConfirmation } from '../services/notificationService.js';

const router = express.Router();

/**
 * POST /api/v1/auth/request-parental-approval
 * Request parental approval for under-18 user
 */
router.post('/request-parental-approval', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID is required' 
            });
        }
        
        // Get approval status first
        const approvalStatus = await ParentalApprovalService.getApprovalStatus(userId);
        
        if (!approvalStatus.needsApproval) {
            return res.status(400).json({ 
                success: false, 
                error: 'User does not require parental approval' 
            });
        }
        
        if (approvalStatus.isApproved) {
            return res.status(400).json({ 
                success: false, 
                error: 'Parental approval already granted' 
            });
        }
        
        // Create or resend approval request
        const { token, user } = await ParentalApprovalService.resendApprovalRequest(userId);
        
        // Send notification to parent
        await sendParentalApprovalRequest(user, token);
        
        res.json({
            success: true,
            message: 'Parental approval request sent successfully',
            sentTo: {
                email: approvalStatus.parentContact.email,
                phone: approvalStatus.parentContact.phone
            }
        });
        
    } catch (error) {
        console.error('Error requesting parental approval:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to send parental approval request' 
        });
    }
});

/**
 * GET /api/v1/auth/approve-parent/:token
 * Handle parental approval via email/SMS link
 */
router.get('/approve-parent/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        if (!token) {
            return res.status(400).send(`
                <html>
                    <head><title>Invalid Link</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h1 style="color: #ef4444;">Invalid Approval Link</h1>
                        <p>The approval link is missing or invalid.</p>
                    </body>
                </html>
            `);
        }
        
        // Approve parental consent
        const approvedUser = await ParentalApprovalService.approveParentalConsent(token);
        
        // Send confirmation notification to the user
        await sendParentalApprovalConfirmation(approvedUser);
        
        // Return success page
        res.send(`
            <html>
                <head>
                    <title>Approval Successful - TalkTime</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            font-family: 'Arial', sans-serif;
                            background: linear-gradient(to bottom right, #c7d2fe, #d8b4fe);
                            margin: 0;
                            padding: 20px;
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .container {
                            background: rgba(255, 255, 255, 0.9);
                            backdrop-filter: blur(15px);
                            border-radius: 16px;
                            padding: 40px;
                            text-align: center;
                            max-width: 500px;
                            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                        }
                        .logo {
                            color: #4f46e5;
                            font-size: 32px;
                            font-weight: bold;
                            margin-bottom: 10px;
                        }
                        .tagline {
                            color: #6b7280;
                            margin-bottom: 30px;
                        }
                        .success-icon {
                            font-size: 64px;
                            color: #10b981;
                            margin-bottom: 20px;
                        }
                        h1 {
                            color: #374151;
                            margin-bottom: 20px;
                        }
                        p {
                            color: #4b5563;
                            line-height: 1.6;
                            margin-bottom: 20px;
                        }
                        .highlight {
                            background-color: #f3f4f6;
                            padding: 20px;
                            border-radius: 8px;
                            margin: 20px 0;
                        }
                        .btn {
                            background-color: #4f46e5;
                            color: white;
                            padding: 12px 30px;
                            text-decoration: none;
                            border-radius: 6px;
                            font-weight: bold;
                            display: inline-block;
                            margin-top: 20px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="logo">TALKTIME</div>
                        <div class="tagline">Connecting Hearts, Building Futures</div>
                        
                        <div class="success-icon">✅</div>
                        <h1>Approval Successful!</h1>
                        
                        <p>
                            Thank you for approving <strong>${approvedUser.full_name}</strong>'s participation in TalkTime.
                        </p>
                        
                        <div class="highlight">
                            <p><strong>What happens next:</strong></p>
                            <p>
                                ${approvedUser.full_name} has been notified via email and can now start scheduling 
                                conversations with Maasai students. They will receive community service documentation 
                                for their volunteer work.
                            </p>
                        </div>
                        
                        <p>
                            If you have any questions about TalkTime or your child's participation, 
                            please contact us at <strong>support@talktime.org</strong>
                        </p>
                        
                        <a href="${process.env.BASE_URL || 'http://localhost:3000'}" class="btn">
                            Visit TalkTime
                        </a>
                    </div>
                </body>
            </html>
        `);
        
    } catch (error) {
        console.error('Error approving parental consent:', error);
        
        // Return error page
        res.status(400).send(`
            <html>
                <head>
                    <title>Approval Failed - TalkTime</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            font-family: 'Arial', sans-serif;
                            background: linear-gradient(to bottom right, #c7d2fe, #d8b4fe);
                            margin: 0;
                            padding: 20px;
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .container {
                            background: rgba(255, 255, 255, 0.9);
                            backdrop-filter: blur(15px);
                            border-radius: 16px;
                            padding: 40px;
                            text-align: center;
                            max-width: 500px;
                            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                        }
                        .logo {
                            color: #4f46e5;
                            font-size: 32px;
                            font-weight: bold;
                            margin-bottom: 10px;
                        }
                        .error-icon {
                            font-size: 64px;
                            color: #ef4444;
                            margin-bottom: 20px;
                        }
                        h1 {
                            color: #374151;
                            margin-bottom: 20px;
                        }
                        p {
                            color: #4b5563;
                            line-height: 1.6;
                            margin-bottom: 20px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="logo">TALKTIME</div>
                        
                        <div class="error-icon">❌</div>
                        <h1>Approval Link Invalid</h1>
                        
                        <p>
                            This approval link is either invalid, expired, or has already been used.
                        </p>
                        
                        <p>
                            Approval links expire after 7 days for security reasons. If you need a new link, 
                            please contact us at <strong>support@talktime.org</strong>
                        </p>
                    </div>
                </body>
            </html>
        `);
    }
});

/**
 * GET /api/v1/auth/approval-status/:userId
 * Get parental approval status for a user
 */
router.get('/approval-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID is required' 
            });
        }
        
        const approvalStatus = await ParentalApprovalService.getApprovalStatus(userId);
        
        res.json({
            success: true,
            ...approvalStatus
        });
        
    } catch (error) {
        console.error('Error getting approval status:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get approval status' 
        });
    }
});

export default router;
