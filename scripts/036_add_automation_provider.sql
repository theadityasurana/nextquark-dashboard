-- Add automation provider toggle to settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "automationProvider" TEXT DEFAULT 'skyvern';
-- Add browser-use API key column
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "browserUseApiKey" TEXT;
