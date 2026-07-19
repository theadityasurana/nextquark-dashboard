-- Add Browserbase settings columns
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "browserbaseApiKey" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "browserbaseProjectId" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "geminiApiKey" TEXT;
-- Update automationProvider to support 'browser_use' and 'browserbase'
ALTER TABLE settings ALTER COLUMN "automationProvider" SET DEFAULT 'browser_use';
UPDATE settings SET "automationProvider" = 'browser_use' WHERE "automationProvider" IS NULL OR "automationProvider" = 'skyvern';
