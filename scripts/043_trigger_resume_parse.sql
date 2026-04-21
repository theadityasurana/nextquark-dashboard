-- Migration: Trigger resume parsing when resume_url is added/updated on profiles
-- Run this in your Supabase SQL Editor
-- Requires pg_net extension (already enabled from 030_create_email_triggers.sql)

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to trigger resume parsing webhook
CREATE OR REPLACE FUNCTION trigger_resume_parse_webhook()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url TEXT := 'https://admin.nextquark.in/api/webhooks/resume-uploaded';
  payload JSON;
BEGIN
  -- Only fire if resume_url changed from NULL/empty to a value
  IF (
    (OLD.resume_url IS NULL OR OLD.resume_url = '') 
    AND NEW.resume_url IS NOT NULL 
    AND NEW.resume_url != ''
  ) OR (
    OLD.resume_url IS DISTINCT FROM NEW.resume_url 
    AND NEW.resume_url IS NOT NULL 
    AND NEW.resume_url != ''
  ) THEN
    payload := json_build_object(
      'type', 'UPDATE',
      'table', 'profiles',
      'record', row_to_json(NEW),
      'old_record', row_to_json(OLD)
    );

    PERFORM net.http_post(
      url := webhook_url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := payload::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on profiles table for resume_url updates
DROP TRIGGER IF EXISTS on_resume_uploaded ON profiles;
CREATE TRIGGER on_resume_uploaded
  AFTER UPDATE OF resume_url ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_resume_parse_webhook();

-- Also fire on INSERT if resume_url is provided at creation time
CREATE OR REPLACE FUNCTION trigger_resume_parse_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url TEXT := 'https://admin.nextquark.in/api/webhooks/resume-uploaded';
  payload JSON;
BEGIN
  IF NEW.resume_url IS NOT NULL AND NEW.resume_url != '' THEN
    payload := json_build_object(
      'type', 'INSERT',
      'table', 'profiles',
      'record', row_to_json(NEW),
      'old_record', json_build_object('resume_url', NULL)
    );

    PERFORM net.http_post(
      url := webhook_url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := payload::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_resume_uploaded_insert ON profiles;
CREATE TRIGGER on_resume_uploaded_insert
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_resume_parse_on_insert();
