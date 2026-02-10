import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

class MailchimpService {
    constructor() {
        this.apiKey = process.env.MAILCHIMP_API_KEY;
        this.serverPrefix = 'us7';
        this.baseUrl = `https://${this.serverPrefix}.api.mailchimp.com/3.0`;
    }

    async getRecentCampaigns(limit = 10, status = 'sent') {
        try {
            // Check if API key is available
            if (!this.apiKey) {
                console.log('No Mailchimp API key configured, returning empty campaigns');
                return [];
            }

            console.log('Mailchimp API Request:', {
                url: `${this.baseUrl}/campaigns`,
                apiKeyLength: this.apiKey?.length,
                apiKeyPrefix: this.apiKey?.substring(0, 10) + '...'
            });

            const response = await axios.get(`${this.baseUrl}/campaigns`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                params: {
                    count: limit,
                    status: status,
                    sort_field: 'send_time',
                    sort_dir: 'DESC'
                }
            });

            // Handle empty campaigns array
            if (!response.data.campaigns || response.data.campaigns.length === 0) {
                return [];
            }

            return response.data.campaigns.map(campaign => ({
                id: campaign.id,
                subject: campaign.settings?.subject_line || 'Untitled Campaign',
                sendTime: campaign.send_time,
                emailsSent: campaign.emails_sent || 0,
                recipientCount: campaign.recipients?.recipient_count || 0,
                listName: campaign.recipients?.list_name || '',
                status: campaign.status,
                openRate: campaign.report_summary?.open_rate || 0,
                clickRate: campaign.report_summary?.click_rate || 0
            }));
        } catch (error) {
            console.error('Mailchimp API Error:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                message: error.message
            });

            // Return empty array instead of throwing for better UX
            return [];
        }
    }

    async getCampaignContent(campaignId) {
        try {
            const response = await axios.get(`${this.baseUrl}/campaigns/${campaignId}/content`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return {
                html: response.data.html,
                plainText: response.data.plain_text,
                archiveHtml: response.data.archive_html
            };
        } catch (error) {
            console.error('Error fetching campaign content:', error.response?.data || error.message);
            throw error;
        }
    }

    async getCampaignReport(campaignId) {
        try {
            const response = await axios.get(`${this.baseUrl}/reports/${campaignId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return response.data;
        } catch (error) {
            console.error('Error fetching campaign report:', error.response?.data || error.message);
            throw error;
        }
    }

    async addSubscriber(listId, email, firstName = '', lastName = '', tags = []) {
        try {
            const response = await axios.post(`${this.baseUrl}/lists/${listId}/members`, {
                email_address: email,
                status: 'subscribed',
                merge_fields: {
                    FNAME: firstName,
                    LNAME: lastName
                },
                tags: tags
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return {
                success: true,
                id: response.data.id,
                email: response.data.email_address,
                status: response.data.status
            };
        } catch (error) {
            console.error('Error adding subscriber:', error.response?.data || error.message);

            if (error.response?.status === 400 && error.response?.data?.title === 'Member Exists') {
                return {
                    success: false,
                    error: 'Subscriber already exists',
                    existing: true
                };
            }

            throw error;
        }
    }

    async getSubscriber(listId, email) {
        try {
            const emailHash = require('crypto').createHash('md5').update(email.toLowerCase()).digest('hex');
            const response = await axios.get(`${this.baseUrl}/lists/${listId}/members/${emailHash}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                return null;
            }
            console.error('Error fetching subscriber:', error.response?.data || error.message);
            throw error;
        }
    }

    async updateSubscriber(listId, email, updates) {
        try {
            const emailHash = require('crypto').createHash('md5').update(email.toLowerCase()).digest('hex');
            const response = await axios.patch(`${this.baseUrl}/lists/${listId}/members/${emailHash}`, updates, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return response.data;
        } catch (error) {
            console.error('Error updating subscriber:', error.response?.data || error.message);
            throw error;
        }
    }

    async getLists() {
        try {
            const response = await axios.get(`${this.baseUrl}/lists`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                params: {
                    count: 100
                }
            });

            return response.data.lists.map(list => ({
                id: list.id,
                name: list.name,
                memberCount: list.stats.member_count,
                unsubscribeCount: list.stats.unsubscribe_count
            }));
        } catch (error) {
            console.error('Error fetching lists:', error.response?.data || error.message);
            return [];
        }
    }
}

export default MailchimpService;