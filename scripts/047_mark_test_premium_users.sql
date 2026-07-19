-- Mark some existing queue entries as premium for testing
-- Update the first 2 entries to be premium (adjust as needed)
UPDATE live_application_queue
SET is_premium = true
WHERE id IN (
  SELECT id FROM live_application_queue ORDER BY created_at ASC LIMIT 2
);
