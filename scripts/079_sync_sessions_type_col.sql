ALTER TABLE sync_sessions ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'sync' CHECK (type IN ('sync', 'cleanup'));
