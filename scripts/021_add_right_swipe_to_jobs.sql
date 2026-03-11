-- Add right_swipe column to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS right_swipe INTEGER DEFAULT 0;
