/**
 * Email Sender Utility
 * Handles sending emails using a configurable email service
 */

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - Email HTML content
 * @param {string} [options.text] - Email plain text content
 * @returns {Promise<Object>} Send result
 */
export const sendEmail = async (options) => {
  try {
    // For now, just log the email (development mode)
    console.log('SENDING EMAIL:');
    console.log('To:', options.to);
    console.log('Subject:', options.subject);
    console.log('Content:', options.html || options.text);
    
    // In production, this would use a real email service like SendGrid, Mailgun, etc.
    // Example with SendGrid (commented out):
    /*
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    const msg = {
      to: options.to,
      from: process.env.EMAIL_FROM || 'noreply@talktime.org',
      subject: options.subject,
      text: options.text,
      html: options.html,
    };
    
    return await sgMail.send(msg);
    */
    
    return { success: true, id: `email-${Date.now()}` };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};
