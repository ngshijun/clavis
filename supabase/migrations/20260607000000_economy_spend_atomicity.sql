-- ============================================================
-- Economy follow-ups (from the negative-balance hotfix #19)
--
-- 1. gacha_pull / gacha_multi_pull: same non-atomic read-check-then-update
--    TOCTOU as feed/exchange. The CHECK (coins >= 0) constraint already makes
--    them SAFE (a racing spend rolls back), but it surfaces as a raw constraint
--    error instead of a graceful "Insufficient coins". Rewrite the coin spend to
--    check-and-deduct atomically (balance re-checked in the UPDATE's WHERE).
--
-- 2. feed_pet_for_evolution authorization: unlike the other spend RPCs (which use
--    auth.uid()), feed trusts the client-supplied p_student_id, so a caller could
--    deduct another student's food (the CHECK only stops it going negative).
--    Require p_student_id = auth.uid(), and revoke EXECUTE from anon.
--
-- All signatures unchanged → no type regen. Bodies preserved from
-- 20260413055844_badges_schema.sql (gacha) and 20260601000000 (feed); only the
-- coin spend / authz guard change.
-- ============================================================

-- 1a. gacha_pull (single, 100 coins) — atomic coin check-and-deduct.
CREATE OR REPLACE FUNCTION public.gacha_pull()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_cost constant integer := 100;
  v_random_value float;
  v_selected_pet_id uuid;
  v_rarity pet_rarity;
  v_new_badges jsonb;
BEGIN
  v_student_id := (SELECT auth.uid());
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Atomic check-and-deduct: the balance is re-checked in the WHERE at write
  -- time, so concurrent spends cannot both pass a stale read and go negative.
  UPDATE student_profiles SET coins = coins - v_cost
  WHERE id = v_student_id AND coins >= v_cost;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient coins';
  END IF;

  -- Determine rarity (60% common, 30% rare, 9% epic, 1% legendary)
  v_random_value := random();
  IF v_random_value < 0.01 THEN
    v_rarity := 'legendary';
  ELSIF v_random_value < 0.10 THEN
    v_rarity := 'epic';
  ELSIF v_random_value < 0.40 THEN
    v_rarity := 'rare';
  ELSE
    v_rarity := 'common';
  END IF;

  SELECT id INTO v_selected_pet_id FROM pets WHERE rarity = v_rarity ORDER BY random() LIMIT 1;

  INSERT INTO owned_pets (student_id, pet_id, count)
  VALUES (v_student_id, v_selected_pet_id, 1)
  ON CONFLICT (student_id, pet_id) DO UPDATE SET
    count = owned_pets.count + 1,
    updated_at = now();

  BEGIN
    SELECT coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO v_new_badges
    FROM public.check_and_award_badges(v_student_id) b;
  EXCEPTION WHEN others THEN
    RAISE warning 'badge check failed for student %: %', v_student_id, sqlerrm;
    v_new_badges := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'pet_id', v_selected_pet_id,
    'newly_unlocked_badges', v_new_badges
  );
END;
$$;

-- 1b. gacha_multi_pull (10x, 900 coins) — atomic coin check-and-deduct.
CREATE OR REPLACE FUNCTION public.gacha_multi_pull()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_cost constant integer := 900;
  v_result uuid[] := '{}';
  v_pet_id uuid;
  v_random_value float;
  v_rarity pet_rarity;
  i integer;
  v_new_badges jsonb;
BEGIN
  v_student_id := (SELECT auth.uid());
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Atomic check-and-deduct (900 for 10x = 10% discount). Re-checked in the
  -- WHERE so concurrent spends cannot both pass a stale read and go negative.
  UPDATE student_profiles SET coins = coins - v_cost
  WHERE id = v_student_id AND coins >= v_cost;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient coins';
  END IF;

  -- Pull 10 pets
  FOR i IN 1..10 LOOP
    v_random_value := random();
    IF v_random_value < 0.01 THEN
      v_rarity := 'legendary';
    ELSIF v_random_value < 0.10 THEN
      v_rarity := 'epic';
    ELSIF v_random_value < 0.40 THEN
      v_rarity := 'rare';
    ELSE
      v_rarity := 'common';
    END IF;

    SELECT id INTO v_pet_id FROM pets WHERE rarity = v_rarity ORDER BY random() LIMIT 1;
    v_result := v_result || v_pet_id;

    INSERT INTO owned_pets (student_id, pet_id, count)
    VALUES (v_student_id, v_pet_id, 1)
    ON CONFLICT (student_id, pet_id) DO UPDATE SET
      count = owned_pets.count + 1,
      updated_at = now();
  END LOOP;

  BEGIN
    SELECT coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO v_new_badges
    FROM public.check_and_award_badges(v_student_id) b;
  EXCEPTION WHEN others THEN
    RAISE warning 'badge check failed for student %: %', v_student_id, sqlerrm;
    v_new_badges := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'pet_ids', to_jsonb(v_result),
    'newly_unlocked_badges', v_new_badges
  );
END;
$$;

-- 2. feed_pet_for_evolution: require the caller to be the student being charged.
--    (Body preserved from 20260601000000; only the authz guard is added.)
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
  -- Authorization: a caller may only feed (and be charged for) their own pets.
  IF p_student_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

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

  -- Atomic check-and-deduct (re-checked in the WHERE; concurrent feeds can't go negative).
  UPDATE public.student_profiles
  SET food = food - p_food_amount
  WHERE id = p_student_id
    AND food >= p_food_amount;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough food');
  END IF;

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

-- anon never legitimately feeds a pet; the auth.uid() guard already blocks it,
-- but revoke EXECUTE to drop the attack surface entirely (no-op if not granted).
REVOKE EXECUTE ON FUNCTION public.feed_pet_for_evolution(uuid, uuid, integer) FROM anon;
