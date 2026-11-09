-- live_application_queue.is_premium was stamped once, at insert, from
-- profiles.subscription_type. A user who swipes first and upgrades later
-- (e.g. Pawan Pathak, 29 pending rows added before his Iris web purchase)
-- kept is_premium = false: missing from the Premium tab and not prioritised
-- by claim_applications. Keep unfinished rows in step with the profile.

CREATE OR REPLACE FUNCTION sync_queue_premium_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE live_application_queue
     SET is_premium = (NEW.subscription_type IN ('premium', 'pro'))
   WHERE user_id = NEW.id
     AND status NOT IN ('completed', 'failed')
     AND is_premium IS DISTINCT FROM (NEW.subscription_type IN ('premium', 'pro'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_subscription_type_change_sync_queue ON profiles;
CREATE TRIGGER on_subscription_type_change_sync_queue
  AFTER UPDATE OF subscription_type ON profiles
  FOR EACH ROW
  WHEN (OLD.subscription_type IS DISTINCT FROM NEW.subscription_type)
  EXECUTE FUNCTION sync_queue_premium_from_profile();

-- Backfill: unfinished rows whose flag disagrees with the profile today.
UPDATE live_application_queue q
   SET is_premium = (p.subscription_type IN ('premium', 'pro'))
  FROM profiles p
 WHERE p.id = q.user_id
   AND q.status NOT IN ('completed', 'failed')
   AND q.is_premium IS DISTINCT FROM (p.subscription_type IN ('premium', 'pro'));
