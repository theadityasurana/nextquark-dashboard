-- Add a toggle to enable/disable automatic application-submitted emails.
-- Stored in the single-row settings table so it is global and persists across
-- all sessions and deployments.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS application_submitted_emails_enabled BOOLEAN NOT NULL DEFAULT TRUE;
