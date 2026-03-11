-- Add profile fields to live_application_queue table
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS cover_letter TEXT;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS work_authorization_status TEXT;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS resume_url TEXT;
