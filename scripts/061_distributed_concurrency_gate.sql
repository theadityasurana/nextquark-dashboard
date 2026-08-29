-- Migration: distributed concurrency gate
-- Replaces the in-process semaphore (which breaks across serverless instances)
-- with a Postgres-backed distributed lock using SELECT FOR UPDATE.
--
-- The try_acquire / release functions are atomic — no race condition possible.

CREATE TABLE IF NOT EXISTS kernel_concurrency_gate (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  active_count INTEGER NOT NULL DEFAULT 0,
  max_count INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO kernel_concurrency_gate (id, active_count, max_count)
VALUES ('singleton', 0, 2)
ON CONFLICT DO NOTHING;

-- Atomically increment active_count if below max_count.
-- Returns { acquired: bool, active_count: int, max_count: int }
CREATE OR REPLACE FUNCTION try_acquire_concurrency_slot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  row kernel_concurrency_gate%ROWTYPE;
BEGIN
  -- Lock the row so concurrent calls queue up rather than racing
  SELECT * INTO row FROM kernel_concurrency_gate WHERE id = 'singleton' FOR UPDATE;

  IF row.active_count < row.max_count THEN
    UPDATE kernel_concurrency_gate
    SET active_count = active_count + 1, updated_at = now()
    WHERE id = 'singleton';
    RETURN jsonb_build_object('acquired', true, 'active_count', row.active_count + 1, 'max_count', row.max_count);
  ELSE
    RETURN jsonb_build_object('acquired', false, 'active_count', row.active_count, 'max_count', row.max_count);
  END IF;
END;
$$;

-- Atomically decrement active_count, floor at 0.
CREATE OR REPLACE FUNCTION release_concurrency_slot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE kernel_concurrency_gate
  SET active_count = GREATEST(0, active_count - 1), updated_at = now()
  WHERE id = 'singleton';
END;
$$;

-- Update max_count when Kernel plan changes (call manually or from settings)
CREATE OR REPLACE FUNCTION set_concurrency_limit(new_limit INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE kernel_concurrency_gate SET max_count = new_limit, updated_at = now() WHERE id = 'singleton';
END;
$$;
