-- Answer bank: the candidate's reusable application answers.
--
-- Replaces asking an LLM the same question afresh on every run. Answers are
-- either derived from the structured profile (free, deterministic) or captured
-- once from a human and reused forever. See lib/application-answers.ts.

CREATE TABLE IF NOT EXISTS application_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,

  -- The question as the form actually phrased it, kept verbatim for display.
  question TEXT NOT NULL,
  -- normalizeQuestion(question): lowercased, punctuation collapsed. The lookup
  -- key, so "Why us?" and "why us??" are one row rather than two.
  normalized_question TEXT NOT NULL,
  -- Canonical intent when recognized ('sponsorship', 'salary_expectation', …),
  -- which is how paraphrases resolve to the same answer.
  intent TEXT,

  answer TEXT NOT NULL,

  -- 'derived'  — computed from the structured profile
  -- 'captured' — answered by a human at review
  -- 'operator' — entered directly in the Answer Bank screen
  source TEXT NOT NULL DEFAULT 'captured' CHECK (source IN ('derived', 'captured', 'operator')),

  -- Legally/personally consequential questions (citizenship, criminal history,
  -- clearance, health, salary history). These are NEVER answered from a fuzzy
  -- match or an LLM — only from an explicit candidate-provided answer.
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,

  -- Flywheel telemetry: how much this answer is actually earning its place.
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One answer per question per candidate. Re-answering updates in place.
  UNIQUE (user_id, normalized_question)
);

CREATE INDEX IF NOT EXISTS idx_application_answers_user
  ON application_answers (user_id);

-- Intent lookup is the paraphrase-matching path, so it needs its own index.
CREATE INDEX IF NOT EXISTS idx_application_answers_intent
  ON application_answers (user_id, intent)
  WHERE intent IS NOT NULL;

ALTER TABLE application_answers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'application_answers' AND policyname = 'Allow full access to application_answers'
  ) THEN
    CREATE POLICY "Allow full access to application_answers" ON application_answers
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── Per-run answer telemetry on the queue row ───
-- Records what the bank could and couldn't cover for this application, so the
-- saving is visible and the gaps are actionable.
ALTER TABLE live_application_queue
  -- Share of the form's custom questions answered from the bank (0..100).
  ADD COLUMN IF NOT EXISTS answer_coverage_percent INTEGER,
  -- Questions the bank could not answer — candidates for capture.
  ADD COLUMN IF NOT EXISTS unanswered_questions TEXT[],
  -- Unanswered AND sensitive: these must go to a human, never to the model.
  ADD COLUMN IF NOT EXISTS questions_needing_human TEXT[],
  -- How many questions still had to fall through to the LLM this run.
  ADD COLUMN IF NOT EXISTS llm_answered_count INTEGER;
