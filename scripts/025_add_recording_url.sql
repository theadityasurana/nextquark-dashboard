-- Add recording_url column to live_application_queue table
ALTER TABLE live_application_queue 
ADD COLUMN IF NOT EXISTS recording_url TEXT;

-- Add comment
COMMENT ON COLUMN live_application_queue.recording_url IS 'URL to the recorded video of the application session';
