-- Add browser_use_profile_id to profiles table for persistent browser profiles per user
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS browser_use_profile_id TEXT;
