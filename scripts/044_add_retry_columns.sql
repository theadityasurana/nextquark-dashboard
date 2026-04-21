-- Add retry columns to live_application_queue
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 2;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS last_error TEXT;
