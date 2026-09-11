-- Run this in Supabase SQL editor to fix anon read access on sync_sessions.
-- The table already exists from 075_sync_sessions.sql.

ALTER TABLE sync_sessions ENABLE ROW LEVEL SECURITY;

-- Allow anyone (anon + authenticated) to read rows — this is a dashboard-only
-- internal table with no sensitive data, just sync progress counters.
CREATE POLICY "anon can read sync_sessions"
  ON sync_sessions FOR SELECT
  USING (true);

-- Service role bypasses RLS for writes, so no INSERT/UPDATE policy needed.
