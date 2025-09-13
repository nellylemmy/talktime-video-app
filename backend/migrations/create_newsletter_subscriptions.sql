-- Create newsletter_subscriptions table for lead capture
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'visitor', -- visitor, volunteer, student, admin
    interests JSONB, -- Array of interest categories
    source VARCHAR(100) DEFAULT 'widget', -- widget, footer, inline, manual
    placement VARCHAR(50) DEFAULT 'floating', -- floating, footer, inline
    page VARCHAR(255), -- Page where subscription occurred
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255),
    verification_sent_at TIMESTAMP WITH TIME ZONE,
    verified_at TIMESTAMP WITH TIME ZONE,
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    unsubscribe_token VARCHAR(255),
    subscriber_metadata JSONB, -- Additional data like name, preferences, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_role ON newsletter_subscriptions(role);
CREATE INDEX IF NOT EXISTS idx_newsletter_active ON newsletter_subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_newsletter_created ON newsletter_subscriptions(created_at);
CREATE INDEX IF NOT EXISTS idx_newsletter_source ON newsletter_subscriptions(source);

-- Create newsletter_campaigns table for tracking email campaigns
CREATE TABLE IF NOT EXISTS newsletter_campaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    content TEXT,
    target_role VARCHAR(50), -- Filter by role
    target_interests JSONB, -- Filter by interests
    status VARCHAR(50) DEFAULT 'draft', -- draft, scheduled, sending, sent, cancelled
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    total_recipients INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    unsubscribed_count INTEGER DEFAULT 0,
    bounced_count INTEGER DEFAULT 0,
    campaign_metadata JSONB,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create newsletter_analytics table for tracking engagement
CREATE TABLE IF NOT EXISTS newsletter_analytics (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER REFERENCES newsletter_subscriptions(id) ON DELETE CASCADE,
    campaign_id INTEGER REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- subscribed, verified, opened, clicked, unsubscribed, bounced
    event_data JSONB, -- Additional event data
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for analytics
CREATE INDEX IF NOT EXISTS idx_analytics_subscription ON newsletter_analytics(subscription_id);
CREATE INDEX IF NOT EXISTS idx_analytics_campaign ON newsletter_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON newsletter_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON newsletter_analytics(created_at);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables
DROP TRIGGER IF EXISTS update_newsletter_subscriptions_updated_at ON newsletter_subscriptions;
CREATE TRIGGER update_newsletter_subscriptions_updated_at
    BEFORE UPDATE ON newsletter_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_newsletter_campaigns_updated_at ON newsletter_campaigns;
CREATE TRIGGER update_newsletter_campaigns_updated_at
    BEFORE UPDATE ON newsletter_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
