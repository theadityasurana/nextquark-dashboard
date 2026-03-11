-- Create trigger function to auto-populate fields from profiles and jobs tables
CREATE OR REPLACE FUNCTION populate_live_queue_from_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Fetch all missing fields from profiles table
  SELECT 
    COALESCE(NEW.email, p.email),
    COALESCE(NEW.cover_letter, p.cover_letter),
    COALESCE(NEW.work_authorization_status, p.work_authorization_status),
    COALESCE(NEW.ethnicity, p.ethnicity),
    COALESCE(NEW.gender, p.gender),
    COALESCE(NEW.disability_status, p.disability_status),
    COALESCE(NEW.veteran_status, p.veteran_status)
  INTO 
    NEW.email,
    NEW.cover_letter,
    NEW.work_authorization_status,
    NEW.ethnicity,
    NEW.gender,
    NEW.disability_status,
    NEW.veteran_status
  FROM profiles p
  WHERE p.id = NEW.user_id;
  
  -- Fetch job_url from jobs table
  SELECT 
    COALESCE(NEW.job_url, j.job_url)
  INTO 
    NEW.job_url
  FROM jobs j
  WHERE j.id = NEW.job_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that runs before insert on live_application_queue
DROP TRIGGER IF EXISTS trigger_populate_live_queue ON live_application_queue;
CREATE TRIGGER trigger_populate_live_queue
  BEFORE INSERT ON live_application_queue
  FOR EACH ROW
  EXECUTE FUNCTION populate_live_queue_from_profile();
