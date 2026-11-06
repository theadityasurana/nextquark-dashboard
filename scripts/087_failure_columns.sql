-- Migration: the failure diagnosis columns the run finaliser writes.
-- Without them PostgREST rejected the whole update, so a failed run's row stayed
-- `processing` and was restarted at once, ignoring its backoff and retry rules.

ALTER TABLE live_application_queue
  ADD COLUMN IF NOT EXISTS failure_class        TEXT,
  ADD COLUMN IF NOT EXISTS failure_cause        TEXT,
  ADD COLUMN IF NOT EXISTS failure_action       TEXT,
  ADD COLUMN IF NOT EXISTS failure_permanent    BOOLEAN,
  ADD COLUMN IF NOT EXISTS failure_portal_fault BOOLEAN;
