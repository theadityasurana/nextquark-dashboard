ALTER TABLE sync_sessions DROP CONSTRAINT IF EXISTS sync_sessions_type_check;
ALTER TABLE sync_sessions ADD CONSTRAINT sync_sessions_type_check CHECK (type IN ('sync', 'cleanup', 'enrich'));
