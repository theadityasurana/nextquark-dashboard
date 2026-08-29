-- Fix trigger to populate is_premium from profiles.subscription_type on insert
CREATE OR REPLACE FUNCTION populate_live_queue_from_profile()
RETURNS TRIGGER AS $$
BEGIN
  SELECT 
    COALESCE(NEW.email, p.email),
    COALESCE(NEW.cover_letter, p.cover_letter),
    COALESCE(NEW.work_authorization_status, p.work_authorization_status),
    COALESCE(NEW.ethnicity, p.ethnicity),
    COALESCE(NEW.gender, p.gender),
    COALESCE(NEW.disability_status, p.disability_status),
    COALESCE(NEW.veteran_status, p.veteran_status),
    (p.subscription_type IN ('premium', 'pro'))
  INTO 
    NEW.email,
    NEW.cover_letter,
    NEW.work_authorization_status,
    NEW.ethnicity,
    NEW.gender,
    NEW.disability_status,
    NEW.veteran_status,
    NEW.is_premium
  FROM profiles p
  WHERE p.id = NEW.user_id;

  SELECT 
    COALESCE(NEW.job_url, j.job_url)
  INTO 
    NEW.job_url
  FROM jobs j
  WHERE j.id = NEW.job_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill existing rows that have is_premium = false but the user is actually premium
UPDATE live_application_queue laq
SET is_premium = true
FROM profiles p
WHERE laq.user_id = p.id
  AND p.subscription_type IN ('premium', 'pro')
  AND laq.is_premium = false;
