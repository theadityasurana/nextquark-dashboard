-- Migration: UI preferences column on the settings table
-- Stores operator UI preferences (toggle states, chart ranges) so they
-- persist across devices and page refreshes via Supabase instead of localStorage.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{}'::jsonb;
