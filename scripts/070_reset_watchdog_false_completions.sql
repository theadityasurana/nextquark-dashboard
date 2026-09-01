-- One-time migration: reset applications that were incorrectly force-completed
-- by the watchdog cron (which moved any non-completed row to 'completed' after
-- 15 minutes). Only touches rows from the last 7 days that have no recording_url
-- (i.e. were never genuinely completed by the automation).
UPDATE live_application_queue
SET
  status       = 'pending',
  completed_at = NULL,
  error_message = NULL,
  last_error    = NULL
WHERE
  status        = 'completed'
  AND recording_url IS NULL
  AND completed_at >= NOW() - INTERVAL '7 days';
