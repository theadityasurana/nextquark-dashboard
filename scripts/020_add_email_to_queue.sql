-- Add email column to live_application_queue table (nullable)
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS email TEXT;

-- Update existing records with email from profiles table if needed
-- UPDATE live_application_queue laq
-- SET email = p.email
-- FROM profiles p
-- WHERE laq.user_id = p.id AND laq.email IS NULL;
