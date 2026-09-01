-- Increase default retry ceiling from 2 to 3.
-- Existing rows that still have the old default (2) are updated so they get
-- the extra retry too. Rows where an operator explicitly set a custom value
-- are left alone.
ALTER TABLE live_application_queue
  ALTER COLUMN max_attempts SET DEFAULT 3;

UPDATE live_application_queue
  SET max_attempts = 3
  WHERE max_attempts = 2;
