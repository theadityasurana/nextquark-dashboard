-- Migration: Add portal health tracking and enhanced metrics
-- Run this in Supabase SQL Editor

-- 1. Add missing fields to live_application_queue
ALTER TABLE live_application_queue 
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS portal_type TEXT,
ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER;

-- 2. Add stats fields to profiles table (for user activity tracking)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS total_apps INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS successful_apps INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS failed_apps INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS in_progress_apps INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ DEFAULT NOW();

-- 3. Create portal_health table for tracking portal performance
CREATE TABLE IF NOT EXISTS portal_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_type TEXT NOT NULL, -- 'Greenhouse', 'Lever', 'Workday', etc.
  portal_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'slow', 'down')),
  response_time_ms INTEGER,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create portal_metrics table for historical tracking
CREATE TABLE IF NOT EXISTS portal_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_type TEXT NOT NULL,
  application_id UUID REFERENCES live_application_queue(id),
  response_time_ms INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'timeout')),
  error_message TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_live_queue_completed_at ON live_application_queue(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_queue_portal_type ON live_application_queue(portal_type);
CREATE INDEX IF NOT EXISTS idx_portal_metrics_timestamp ON portal_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_portal_metrics_portal_type ON portal_metrics(portal_type);
CREATE INDEX IF NOT EXISTS idx_profiles_last_active ON profiles(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_total_apps ON profiles(total_apps DESC);

-- 6. Enable RLS
ALTER TABLE portal_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_metrics ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies (allow all for admin dashboard)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'portal_health' AND policyname = 'Allow full access to portal_health'
  ) THEN
    CREATE POLICY "Allow full access to portal_health" ON portal_health
      FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'portal_metrics' AND policyname = 'Allow full access to portal_metrics'
  ) THEN
    CREATE POLICY "Allow full access to portal_metrics" ON portal_metrics
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 8. Create function to update profile stats
CREATE OR REPLACE FUNCTION update_profile_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles 
    SET total_apps = total_apps + 1,
        in_progress_apps = in_progress_apps + 1,
        last_active = NOW()
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      IF NEW.status = 'completed' THEN
        UPDATE profiles 
        SET successful_apps = successful_apps + 1,
            in_progress_apps = in_progress_apps - 1,
            last_active = NOW()
        WHERE id = NEW.user_id;
      ELSIF NEW.status = 'failed' THEN
        UPDATE profiles 
        SET failed_apps = failed_apps + 1,
            in_progress_apps = in_progress_apps - 1,
            last_active = NOW()
        WHERE id = NEW.user_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Create trigger for profile stats
DROP TRIGGER IF EXISTS trigger_update_profile_stats ON live_application_queue;
CREATE TRIGGER trigger_update_profile_stats
  AFTER INSERT OR UPDATE ON live_application_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_stats();

-- 10. Create function to update job stats
CREATE OR REPLACE FUNCTION update_job_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE jobs 
    SET total_apps = total_apps + 1
    WHERE id = NEW.job_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    IF NEW.status = 'completed' THEN
      UPDATE jobs 
      SET success_rate = (
        SELECT (COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / NULLIF(COUNT(*), 0) * 100)
        FROM live_application_queue 
        WHERE job_id = NEW.job_id
      )
      WHERE id = NEW.job_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Create trigger for job stats
DROP TRIGGER IF EXISTS trigger_update_job_stats ON live_application_queue;
CREATE TRIGGER trigger_update_job_stats
  AFTER INSERT OR UPDATE ON live_application_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_job_stats();
