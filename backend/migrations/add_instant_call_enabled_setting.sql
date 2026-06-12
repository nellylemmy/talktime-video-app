-- Platform-wide instant call kill switch. Admin-controlled, default OFF.
-- is_public = true so unauthenticated/volunteer frontends can read the flag.
INSERT INTO app_settings (key, value, data_type, category, description, is_public)
VALUES ('instant_call.enabled', 'false', 'boolean', 'instant_calls', 'Master switch for the instant call feature across the platform', true)
ON CONFLICT (key) DO NOTHING;
