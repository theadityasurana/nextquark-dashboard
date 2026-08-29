-- Domain skills: institutional memory about SITES, not about candidates.
--
-- The answer bank runs this flywheel for what a candidate says. Nothing ran it
-- for how a site behaves, so everything learned about ATS quirks lived as
-- constants and comments only a human could update — that Lever wants /apply
-- appended, that Workday needs a longer DOM-settle, that Ashby flags a submit
-- landing too soon after the last keystroke. When a site changed, that
-- knowledge silently became wrong and nothing noticed.
--
-- A skill is one durable fact about one domain, distilled from a run, PII-gated
-- before storage, versioned, scored by outcomes, and auto-retired once it stops
-- predicting the site correctly. See lib/domain-skills.ts.

CREATE TABLE IF NOT EXISTS domain_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Registrable host, or the full host for ATS subdomains where the tenant is
  -- the identity: acme.wd5.myworkdayjobs.com behaves differently from
  -- beta.wd5.myworkdayjobs.com, so they must not share skills.
  domain TEXT NOT NULL,

  -- One or two sentences of durable site knowledge. NEVER anything about a
  -- person: these rows are shared across every candidate, which is exactly why
  -- the PII gate runs before insert and again at the write boundary.
  content TEXT NOT NULL,

  -- Monotonic per domain. A newer version supersedes rather than overwrites, so
  -- what we used to believe about a site stays auditable.
  version INTEGER NOT NULL DEFAULT 1,

  -- +1 when a run that used this skill succeeded, -1 when it failed. Successes
  -- cap at 10 (a success is weak evidence the skill helped); failures do not,
  -- so a skill the site has outgrown falls to the retire threshold quickly.
  score INTEGER NOT NULL DEFAULT 0,

  -- Retired at score <= -3. Retired skills are never injected into a run but
  -- are kept, because "we used to think this" is useful when a site regresses.
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),

  times_used INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (domain, version)
);

-- The load path: active skills for one domain, best score first.
CREATE INDEX IF NOT EXISTS idx_domain_skills_lookup
  ON domain_skills (domain, status, score DESC);

ALTER TABLE domain_skills ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'domain_skills' AND policyname = 'Allow full access to domain_skills'
  ) THEN
    CREATE POLICY "Allow full access to domain_skills" ON domain_skills
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
