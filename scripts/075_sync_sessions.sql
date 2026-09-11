-- Tracks a single "Sync Latest Jobs" run triggered from the dashboard.
-- One row per button click; the API route writes progress into it in real-time.
CREATE TABLE IF NOT EXISTS sync_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status      text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  total       int  NOT NULL DEFAULT 0,
  done        int  NOT NULL DEFAULT 0,
  failed      int  NOT NULL DEFAULT 0,
  added       int  NOT NULL DEFAULT 0,
  updated     int  NOT NULL DEFAULT 0,
  results     jsonb NOT NULL DEFAULT '[]',
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- Only the dashboard reads this; no RLS needed (service role only writes).
-- Enable realtime so the client can subscribe.
ALTER PUBLICATION supabase_realtime ADD TABLE sync_sessions;
