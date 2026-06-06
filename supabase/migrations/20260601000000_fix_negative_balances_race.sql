-- ============================================================
-- Fix negative student balances (food / coins) — concurrency hotfix
--
-- ROOT CAUSE: the economy spend RPCs use a non-atomic read-check-then-update:
--
--   select food into v_student_food ...;           -- (1) snapshot read
--   if v_student_food < p_food_amount then reject;  -- (2) check
--   update ... set food = food - p_food_amount;     -- (3) deduct (no re-check)
--
-- Under READ COMMITTED, two concurrent feeds for the same student both pass the
-- check on the same stale read (food=1), then both deduct: the first commits
-- food=0, the second's UPDATE re-reads the committed row and computes 0 - 1 = -1.
-- There is no CHECK (food >= 0) backstop, so the negative value persists.
-- (The client guards in MyPetPage are per-tab/best-effort and don't help across
-- tabs, devices, retries, or direct PostgREST calls.) The same TOCTOU pattern
-- exists for coins in every coin-spend RPC.
--
-- FIX (defense in depth):
--   1. One-time clamp of any already-corrupted negative balances.
--   2. CHECK (food >= 0) / CHECK (coins >= 0) backstops so NO write path can ever
--      persist a negative balance again — a racing spend now fails loudly and
--      rolls back instead of silently corrupting. This protects EVERY spend path,
--      including the pet-acquisition RPCs not rewritten here.
--   3. Rewrite the two food/coins spend RPCs to check-and-deduct ATOMICALLY (the
--      balance is re-checked in the UPDATE's WHERE), restoring a graceful
--      "not enough" message instead of a raw constraint error under a race.
--
-- NOTE: the pet-acquisition RPCs (purchase/draw) share the TOCTOU pattern; the
-- CHECK constraints make them SAFE immediately, but they still return a raw
-- constraint error under a race — give them the same atomic treatment in a
-- follow-up for graceful errors.
-- ============================================================

-- 1. One-time cleanup of any balances already driven negative by the race.
--    Each column is clamped independently so NULL balances are left untouched.
UPDATE public.student_profiles SET food = 0 WHERE food < 0;
UPDATE public.student_profiles SET coins = 0 WHERE coins < 0;

-- 2. Non-negative backstops (NULL is still allowed; the app treats NULL as 0).
ALTER TABLE public.student_profiles
  ADD CONSTRAINT student_profiles_food_nonneg CHECK (food >= 0);
ALTER TABLE public.student_profiles
  ADD CONSTRAINT student_profiles_coins_nonneg CHECK (coins >= 0);

-- 3a. feed_pet_for_evolution: atomic check-and-deduct + positive-amount guard.
--     (Body preserved from 20260413055844_badges_schema.sql; only the food
--     read-check-then-update is replaced and a p_food_amount guard added.)
CREATE OR REPLACE FUNCTION public.feed_pet_for_evolution(
  p_owned_pet_id uuid,
  p_student_id uuid,
  p_food_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owned_pet record;
  v_new_food_fed integer;
  v_required_food integer;
  v_can_evolve boolean;
  v_new_badges jsonb;
BEGIN
  IF p_food_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid food amount');
  END IF;

  SELECT * INTO v_owned_pet
  FROM public.owned_pets
  WHERE id = p_owned_pet_id AND student_id = p_student_id;

  IF v_owned_pet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pet not found');
  END IF;

  IF v_owned_pet.tier >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pet is already at max tier');
  END IF;

  -- Atomic check-and-deduct: the balance is re-checked in the WHERE at write
  -- time, so concurrent feeds cannot both pass a stale read and go negative.
  UPDATE public.student_profiles
  SET food = food - p_food_amount
  WHERE id = p_student_id
    AND food >= p_food_amount;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough food');
  END IF;

  -- Add food to pet
  v_new_food_fed := v_owned_pet.food_fed + p_food_amount;

  UPDATE public.owned_pets
  SET food_fed = v_new_food_fed
  WHERE id = p_owned_pet_id;

  IF v_owned_pet.tier = 1 THEN
    v_required_food := 10;
  ELSE
    v_required_food := 25;
  END IF;

  v_can_evolve := v_new_food_fed >= v_required_food;

  -- Defensive badge check (unchanged)
  BEGIN
    SELECT coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO v_new_badges
    FROM public.check_and_award_badges(p_student_id) b;
  EXCEPTION WHEN others THEN
    RAISE warning 'badge check failed for student %: %', p_student_id, sqlerrm;
    v_new_badges := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'food_fed', v_new_food_fed,
    'required_food', v_required_food,
    'can_evolve', v_can_evolve,
    'newly_unlocked_badges', v_new_badges
  );
END;
$$;

-- 3b. exchange_coins_for_food: atomic check-and-deduct for coins.
--     (Body preserved from 20260315152919_remote_schema.sql; only the coins
--     read-check-then-update is replaced.)
CREATE OR REPLACE FUNCTION public.exchange_coins_for_food(p_food_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_coin_cost integer;
  v_food_price CONSTANT integer := 50; -- coins per food
BEGIN
  v_student_id := (SELECT auth.uid());
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_food_amount <= 0 THEN
    RAISE EXCEPTION 'Food amount must be positive';
  END IF;

  v_coin_cost := p_food_amount * v_food_price;

  -- Atomic check-and-deduct: the balance is re-checked in the WHERE at write
  -- time, so concurrent spends cannot both pass a stale read and go negative.
  UPDATE public.student_profiles
  SET coins = coins - v_coin_cost,
      food = coalesce(food, 0) + p_food_amount
  WHERE id = v_student_id
    AND coins >= v_coin_cost;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient coins';
  END IF;
END;
$$;
