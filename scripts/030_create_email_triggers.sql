-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to trigger webhook on profile insert
CREATE OR REPLACE FUNCTION trigger_profile_created_webhook()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url TEXT := 'https://admin.nextquark.in/api/webhooks/profile-created';
  payload JSON;
BEGIN
  payload := json_build_object(
    'record', json_build_object(
      'email', NEW.email,
      'first_name', NEW.first_name
    )
  );
  
  PERFORM net.http_post(
    url := webhook_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := payload::jsonb
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS on_profile_created ON profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_profile_created_webhook();

-- Create function to trigger webhook on application submit
CREATE OR REPLACE FUNCTION trigger_application_submitted_webhook()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url TEXT := 'https://admin.nextquark.in/api/webhooks/application-submitted';
  payload JSON;
BEGIN
  payload := json_build_object(
    'record', json_build_object(
      'user_id', NEW.user_id,
      'email', NEW.email,
      'first_name', NEW.first_name,
      'job_title', NEW.job_title,
      'company_name', NEW.company_name,
      'location', NEW.location
    )
  );
  
  PERFORM net.http_post(
    url := webhook_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := payload::jsonb
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS on_application_submitted ON live_application_queue;
CREATE TRIGGER on_application_submitted
  AFTER INSERT ON live_application_queue
  FOR EACH ROW
  EXECUTE FUNCTION trigger_application_submitted_webhook();
