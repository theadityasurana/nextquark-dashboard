-- Add verification_otp column to live_application_queue
ALTER TABLE live_application_queue
ADD COLUMN IF NOT EXISTS verification_otp TEXT;

-- Update status check constraint to include 'awaiting_otp'
ALTER TABLE live_application_queue DROP CONSTRAINT IF EXISTS live_application_queue_status_check;
ALTER TABLE live_application_queue
ADD CONSTRAINT live_application_queue_status_check
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'awaiting_otp'));

COMMENT ON COLUMN live_application_queue.verification_otp IS 'OTP received via email for verification during application submission';
