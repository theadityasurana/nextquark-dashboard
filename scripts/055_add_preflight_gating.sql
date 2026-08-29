-- Cost-saving pack: pre-flight gating and per-portal circuit breaking.
--
-- Every dispatched run costs a browser session, a proxy, and LLM calls. These
-- structures let us refuse a run we already know will fail — an explicit
-- work-authorization mismatch, a profile missing its résumé, or a portal that is
-- currently failing every application — before any of that is spent.

-- ─── Knockout + coverage results on the queue row ───
-- Written at dispatch time by the pre-flight gate. All nullable: rows that have
-- never been evaluated render as "not screened" rather than as passing.
ALTER TABLE live_application_queue
  -- True only when something EXPLICITLY stated disqualifies this application.
  -- Inferred mismatches are warnings and never set this. See lib/knockouts.ts.
  ADD COLUMN IF NOT EXISTS knockout_blocked BOOLEAN DEFAULT NULL,
  -- Operator-facing one-liner for the "Won't apply" card.
  ADD COLUMN IF NOT EXISTS knockout_reason TEXT,
  -- Full Knockout[] report: every check with its status and detail.
  ADD COLUMN IF NOT EXISTS knockout_checks JSONB,
  -- Estimated share of the form fillable from this profile (0..100).
  ADD COLUMN IF NOT EXISTS coverage_percent INTEGER,
  -- Blocking fields the profile is missing — these stall the submit gate.
  ADD COLUMN IF NOT EXISTS coverage_blocking_missing TEXT[],
  -- Portal detection confidence (0..100) at dispatch time.
  ADD COLUMN IF NOT EXISTS portal_confidence INTEGER,
  ADD COLUMN IF NOT EXISTS portal_name TEXT,
  -- When the pre-flight gate last evaluated this row.
  ADD COLUMN IF NOT EXISTS screened_at TIMESTAMPTZ;

-- The "Won't apply" bucket query.
CREATE INDEX IF NOT EXISTS idx_live_queue_knockout_blocked
  ON live_application_queue (knockout_blocked)
  WHERE knockout_blocked IS TRUE;

-- ─── Per-portal circuit breaker ───
-- One row per ATS portal. State machine lives in lib/circuit-breaker.ts; this
-- table is only its persistence, so the breaker survives serverless cold starts
-- and is shared across every concurrent dispatcher.
--
-- NOT to be confused with `portal_health` from 026_enhanced_metrics.sql. That
-- table is per-portal-URL latency telemetry (response_time_ms, success/failure
-- counts) keyed on `portal_type` + `portal_url`. This one is a dispatch control
-- keyed on the portal name, with its own state machine and lifecycle. Merging
-- them would force one row grain onto two unrelated jobs, so they stay separate.
CREATE TABLE IF NOT EXISTS portal_breakers (
  portal TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'halfOpen')),
  -- Consecutive failures since the last success; reset to 0 on any success.
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  -- When the breaker last opened — the clock the cooldown runs against.
  opened_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE portal_breakers ENABLE ROW LEVEL SECURITY;

-- Admin dashboard: same open policy as the other tables in this project.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'portal_breakers' AND policyname = 'Allow full access to portal_breakers'
  ) THEN
    CREATE POLICY "Allow full access to portal_breakers" ON portal_breakers
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed a healthy row per portal we know about, so the health strip renders
-- something before the first run rather than an empty panel.
INSERT INTO portal_breakers (portal) VALUES
  ('Greenhouse'), ('Lever'), ('Ashby'), ('Workday'),
  ('SmartRecruiters'), ('iCIMS'), ('BambooHR'), ('Jobvite'), ('LinkedIn')
ON CONFLICT (portal) DO NOTHING;
