-- Add is_premium column to live_application_queue
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

-- Create index for premium filtering
CREATE INDEX IF NOT EXISTS idx_live_queue_is_premium ON live_application_queue(is_premium);
