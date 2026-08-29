-- Answer states, reuse scope, and the separate remember-consent.
--
-- The bank previously stored an answer as simply "an answer". Two problems
-- followed, and both reach real employers:
--
--  1. It could not tell a value a HUMAN approved from one we derived or a model
--     wrote. So it reused all of them identically, and an inferred answer
--     looked exactly as authoritative as a confirmed one.
--
--  2. Recall was global. "Why do you want to work at Acme?" and "Why do you
--     want to join Globex?" share almost every content token, so fuzzy matching
--     happily answered the second with the first — a mistake no threshold
--     tuning fixes, because the questions really are that similar.
--
-- See lib/application-answers.ts.

ALTER TABLE application_answers
  -- confirmed — a human gave or approved this exact answer. The only state that
  --             may be reused without asking (non-sensitive, matching scope).
  -- inferred  — derived from the profile or written by a model. Usable, but
  --             surfaced for review rather than silently trusted.
  -- missing   — the question exists and we have no answer. A gap marker, so it
  --             is visible on the queue card BEFORE the next run rather than
  --             rediscovered mid-fill every time.
  -- sensitive — reconfirmed every time, regardless of how it was stored.
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'inferred'
    CHECK (state IN ('confirmed', 'inferred', 'missing', 'sensitive')),

  -- How widely this answer may be reused.
  --   global   — true regardless of who is asking (work auth, notice period)
  --   ats      — specific to one ATS's phrasing or option set
  --   employer — valid for exactly one company (why this company, why this role)
  ADD COLUMN IF NOT EXISTS scope_kind TEXT NOT NULL DEFAULT 'global'
    CHECK (scope_kind IN ('global', 'ats', 'employer')),
  -- The employer or ATS name for a narrowed scope. NULL for global.
  -- Stored flat rather than as JSON so "everything scoped to this employer" is
  -- answerable with an index instead of a scan.
  ADD COLUMN IF NOT EXISTS scope_value TEXT,

  -- When the candidate explicitly consented to this sensitive answer being
  -- RETAINED — which is a different decision from consenting to use it once.
  -- Permission to put a disability disclosure on one form was never permission
  -- to keep it on file, and conflating the two is how a bank quietly
  -- accumulates the most consequential data a person has. NULL means the answer
  -- may be used for a single form but must not persist.
  ADD COLUMN IF NOT EXISTS remember_consent_at TIMESTAMPTZ;

-- A model-written answer is a distinct provenance from a human-captured one.
ALTER TABLE application_answers
  DROP CONSTRAINT IF EXISTS application_answers_source_check;
ALTER TABLE application_answers
  ADD CONSTRAINT application_answers_source_check
  CHECK (source IN ('derived', 'captured', 'operator', 'llm'));

-- Scope-aware recall is the hot path: every lookup filters to global plus the
-- current employer/ATS.
CREATE INDEX IF NOT EXISTS idx_application_answers_scope
  ON application_answers (user_id, scope_kind, scope_value);

-- The review queue ("what did we fill that nobody approved?") and the gap list
-- ("what does this candidate still need to answer?").
CREATE INDEX IF NOT EXISTS idx_application_answers_state
  ON application_answers (user_id, state)
  WHERE state <> 'confirmed';

-- Backfill: rows written before states existed. Only an explicit human source
-- counts as confirmed — derived rows stay inferred, which is the safe reading.
UPDATE application_answers
   SET state = CASE
                 WHEN is_sensitive THEN 'sensitive'
                 WHEN source IN ('captured', 'operator') THEN 'confirmed'
                 ELSE 'inferred'
               END
 WHERE state = 'inferred';

-- Existing sensitive rows predate the consent split. They were stored under the
-- old rule where using an answer implied keeping it, so mark them as consented
-- rather than deleting answers a candidate may well have intended to keep —
-- but stamp them at migration time so their provenance is honest.
UPDATE application_answers
   SET remember_consent_at = NOW()
 WHERE is_sensitive AND remember_consent_at IS NULL;
