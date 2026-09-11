-- Add deleted count to sync_sessions so cleanup runs can report deletions.
ALTER TABLE sync_sessions ADD COLUMN IF NOT EXISTS deleted int NOT NULL DEFAULT 0;
