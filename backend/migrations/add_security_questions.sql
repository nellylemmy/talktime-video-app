-- Add security questions columns to users table for password recovery
-- Run this migration to add security question functionality

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS security_question_1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS security_answer_1_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS security_question_2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS security_answer_2_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS security_question_3 VARCHAR(255),
ADD COLUMN IF NOT EXISTS security_answer_3_hash VARCHAR(255);

-- Add comment to document the feature
COMMENT ON COLUMN users.security_question_1 IS 'First security question for password recovery';
COMMENT ON COLUMN users.security_answer_1_hash IS 'Hashed answer to first security question';
COMMENT ON COLUMN users.security_question_2 IS 'Second security question for password recovery';
COMMENT ON COLUMN users.security_answer_2_hash IS 'Hashed answer to second security question';
COMMENT ON COLUMN users.security_question_3 IS 'Third security question for password recovery';
COMMENT ON COLUMN users.security_answer_3_hash IS 'Hashed answer to third security question';
