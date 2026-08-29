-- Add Kernel API key to settings table
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "kernelApiKey" text;
