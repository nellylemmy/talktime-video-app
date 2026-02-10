import express from 'express';
import MailchimpService from '../../../services/mailchimpService.js';
import { createJWTMiddleware } from '../../../utils/jwt.js';

const router = express.Router();
const jwtAuthMiddleware = createJWTMiddleware();

const mailchimp = new MailchimpService();

// Make this endpoint public for newsletter display
router.get('/campaigns/recent', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status || 'sent';

        const campaigns = await mailchimp.getRecentCampaigns(limit, status);

        res.json({
            success: true,
            count: campaigns.length,
            campaigns: campaigns.length > 0 ? campaigns : [],
            message: campaigns.length === 0 ? 'No campaigns available or Mailchimp API not configured' : undefined
        });
    } catch (error) {
        console.error('Error fetching recent campaigns:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch campaigns',
            message: error.message
        });
    }
});

router.get('/campaigns/:campaignId/content', jwtAuthMiddleware,async (req, res) => {
    try {
        const { campaignId } = req.params;
        const content = await mailchimp.getCampaignContent(campaignId);

        res.json({
            success: true,
            content
        });
    } catch (error) {
        console.error('Error fetching campaign content:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch campaign content',
            message: error.message
        });
    }
});

router.get('/campaigns/:campaignId/report', jwtAuthMiddleware,async (req, res) => {
    try {
        const { campaignId } = req.params;
        const report = await mailchimp.getCampaignReport(campaignId);

        res.json({
            success: true,
            report
        });
    } catch (error) {
        console.error('Error fetching campaign report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch campaign report',
            message: error.message
        });
    }
});

export default router;