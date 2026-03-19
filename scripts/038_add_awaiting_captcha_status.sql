-- Add 'awaiting_captcha' to the status check constraint
ALTER TABLE live_application_queue DROP CONSTRAINT IF EXISTS live_application_queue_status_check;
ALTER TABLE live_application_queue
ADD CONSTRAINT live_application_queue_status_check
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'awaiting_otp', 'awaiting_captcha'));
