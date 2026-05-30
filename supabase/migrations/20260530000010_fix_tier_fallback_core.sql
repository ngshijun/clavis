-- ============================================================
-- Fix get_tier_from_stripe_price fallback enum value
--
-- The function returned COALESCE(v_tier, 'basic'), but the
-- subscription_tier enum has members ('core','plus','pro','max') with no
-- 'basic'. An unknown price_id would coerce the literal 'basic' to
-- subscription_tier and raise invalid_text_representation. Change the
-- fallback to 'core', matching the codebase's default-tier convention
-- (student_profiles.subscription_tier and child_subscriptions.tier both
-- default to 'core').
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_tier_from_stripe_price(p_price_id text)
RETURNS public.subscription_tier
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tier subscription_tier;
BEGIN
  SELECT id INTO v_tier
  FROM subscription_plans
  WHERE stripe_price_id = p_price_id;

  RETURN COALESCE(v_tier, 'core'::subscription_tier);
END;
$$;

ALTER FUNCTION public.get_tier_from_stripe_price(text) OWNER TO postgres;
