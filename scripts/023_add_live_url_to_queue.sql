-- Add live_url column to live_application_queue table
ALTER TABLE live_application_queue
ADD COLUMN live_url TEXT;
