-- Failure classification, job leasing, and the CAPTCHA solver key.
--
-- Three unrelated additions that all land on dispatch.

-- ─── 1. Failure taxonomy on the queue row ───
--
-- A failure used to be a string. Two decisions could not be made from a string,
-- and both were being made wrongly:
--
--   * Every failure re-entered the retry queue. A posting that closed last week
--     was retried until the attempt budget ran out, each attempt paying for a
--     browser session to reach the identical outcome.
--   * Every failure counted against the portal's circuit breaker. Three expired
--     postings in a row tripped Greenhouse open for every candidate, even
--     though Greenhouse worked perfectly each time.
--
-- See lib/diagnose.ts.
ALTER TABLE live_application_queue
  -- expired | captcha | login_required | not_application | anti_bot |
  -- form_incomplete | validation | stuck | timeout | portal_error | infra | unknown
  ADD COLUMN IF NOT EXISTS failure_class TEXT,
  -- One line an operator can act on.
  ADD COLUMN IF NOT EXISTS failure_cause TEXT,
  ADD COLUMN IF NOT EXISTS failure_action TEXT,
  -- Terminal for this posting: never re-queue it.
  ADD COLUMN IF NOT EXISTS failure_permanent BOOLEAN,
  -- Evidence the PORTAL is broken. Only these move the circuit breaker.
  ADD COLUMN IF NOT EXISTS failure_portal_fault BOOLEAN;

-- The queue view groups by class to show what is actually going wrong.
CREATE INDEX IF NOT EXISTS idx_live_queue_failure_class
  ON live_application_queue (failure_class)
  WHERE failure_class IS NOT NULL;

-- ─── 2. Job leases ───
--
-- Nothing stopped two workers picking up the same queue row: the read and the
-- status update were separate statements, so both could see 'pending'. Two
-- sessions then applied to the same posting, which the employer sees as a
-- duplicate application.
--
-- The lease closes that with a conditional update — the write itself is the
-- lock. A lease also expires, so a worker that dies mid-run no longer strands
-- its row in 'processing' forever. See lib/job-lease.ts.
ALTER TABLE live_application_queue
  -- Which worker owns this row right now.
  ADD COLUMN IF NOT EXISTS lease_worker_id TEXT,
  -- When ownership lapses and the row may be reclaimed. Must exceed the longest
  -- legitimate run: reclaiming a LIVE run would hand the posting to a second
  -- worker, which is the exact failure the lease exists to prevent.
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

-- The reclaim sweep: processing rows whose lease has lapsed.
CREATE INDEX IF NOT EXISTS idx_live_queue_expired_leases
  ON live_application_queue (lease_expires_at)
  WHERE lease_expires_at IS NOT NULL;

-- ─── 3. Independent CAPTCHA solver ───
--
-- Optional. Without it we still fall back to the browser vendor's auto-solve
-- and then to a human — but the vendor solver is weakest on exactly the
-- invisible challenges (reCAPTCHA v3, Turnstile) that block a submit silently,
-- and having only one solver is a single point of failure.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS "captchaSolverApiKey" TEXT;
