-- Trust & Proof pack: structured run telemetry on the live queue.
--
-- Before this, the only record of a run was the flat `application_logs` stream,
-- so "which step did this die on?" meant reading prose. These columns hold the
-- structured timeline the driver emits (lib/run-timeline.ts) plus the two
-- receipt-grade fields we can now capture at submit time.
--
-- All additive and nullable — existing rows keep working and render as "no
-- timeline recorded" in the UI.

ALTER TABLE live_application_queue
  -- Full RunTimeline document: steps[], durations, per-step screenshots.
  ADD COLUMN IF NOT EXISTS run_timeline JSONB,
  -- The ATS-issued reference, when the confirmation page printed one.
  ADD COLUMN IF NOT EXISTS confirmation_id TEXT,
  -- How the ID was introduced ("confirmation number", "requisition ID") — shown
  -- as context so an operator can tell a real receipt from a scraped requisition.
  ADD COLUMN IF NOT EXISTS confirmation_label TEXT,
  -- confirmSubmission's verdict strength: high | medium | low.
  ADD COLUMN IF NOT EXISTS confirmation_confidence TEXT,
  -- Canonical id of the step that failed first, for at-a-glance triage.
  ADD COLUMN IF NOT EXISTS failed_step TEXT,
  -- Validation messages the form itself reported after a submit attempt.
  ADD COLUMN IF NOT EXISTS validation_errors TEXT[];

-- Triage query: "show me everything that died in the submit step".
CREATE INDEX IF NOT EXISTS idx_live_queue_failed_step
  ON live_application_queue (failed_step)
  WHERE failed_step IS NOT NULL;

-- Proof lookup: find a run by the reference a candidate quotes back.
CREATE INDEX IF NOT EXISTS idx_live_queue_confirmation_id
  ON live_application_queue (confirmation_id)
  WHERE confirmation_id IS NOT NULL;
