-- Migration: rate limiting table + increment function

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Auto-clean expired entries (runs on every insert, cheap because it's indexed)
CREATE INDEX IF NOT EXISTS idx_rate_limit_expires ON rate_limit_counters (expires_at);

-- Atomically increment a counter, creating it if it doesn't exist.
-- Expired rows are replaced. Returns the new count.
CREATE OR REPLACE FUNCTION increment_rate_limit(key_arg TEXT, ttl_seconds INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count INTEGER;
  expiry TIMESTAMPTZ := now() + (ttl_seconds || ' seconds')::INTERVAL;
BEGIN
  -- Delete expired entry for this key so we start fresh after the window
  DELETE FROM rate_limit_counters WHERE key = key_arg AND expires_at < now();

  INSERT INTO rate_limit_counters (key, count, expires_at)
  VALUES (key_arg, 1, expiry)
  ON CONFLICT (key) DO UPDATE
    SET count = rate_limit_counters.count + 1
  RETURNING count INTO new_count;

  -- Periodically clean up all expired rows (1% of requests)
  IF random() < 0.01 THEN
    DELETE FROM rate_limit_counters WHERE expires_at < now();
  END IF;

  RETURN new_count;
END;
$$;
