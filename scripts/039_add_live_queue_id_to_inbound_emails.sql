-- Add live_application_queue_id column to inbound_emails
ALTER TABLE inbound_emails
ADD COLUMN IF NOT EXISTS live_application_queue_id UUID REFERENCES live_application_queue(id);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_live_queue_id ON inbound_emails(live_application_queue_id);
