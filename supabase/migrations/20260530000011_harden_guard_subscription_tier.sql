-- ============================================================
-- Harden guard_subscription_tier defense-in-depth signal
--
-- The actual security boundary for subscription_tier is the column-level
-- grant: authenticated holds UPDATE only on (grade_level_id,
-- selected_pet_id, preferred_language, school_id) — never
-- subscription_tier. guard_subscription_tier is defense-in-depth.
--
-- Its old context check keyed off current_setting('request.jwt.claim.role')
-- — a legacy GUC that is empty under the project's ECC (P-256) asymmetric
-- JWT setup. When empty, the trigger took the "allow" branch and did NOT
-- revert a client tier change, defeating the safeguard.
--
-- Fix: key the check off auth.uid(). A logged-in PostgREST request always
-- resolves a non-null auth.uid(); SECURITY DEFINER / service-role paths
-- that legitimately change the tier (sync_subscription_tier_to_profile)
-- run without a user uid, so they are correctly allowed through.
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_subscription_tier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- No authenticated user in context => service role / SECURITY DEFINER
  -- (e.g. sync_subscription_tier_to_profile). Allow the change.
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  -- In an authenticated user session, silently revert any tier change.
  IF OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier THEN
    NEW.subscription_tier := OLD.subscription_tier;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.guard_subscription_tier() OWNER TO postgres;
