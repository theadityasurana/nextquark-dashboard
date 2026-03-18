-- Add proxy_email column to profiles table for CC email on notifications
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS proxy_email TEXT;
