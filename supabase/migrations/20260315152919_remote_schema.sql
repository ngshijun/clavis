


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."announcement_audience" AS ENUM (
    'all',
    'students_only',
    'parents_only'
);


ALTER TYPE "public"."announcement_audience" OWNER TO "postgres";


CREATE TYPE "public"."feedback_category" AS ENUM (
    'question_error',
    'image_error',
    'option_error',
    'answer_error',
    'explanation_error',
    'other'
);


ALTER TYPE "public"."feedback_category" OWNER TO "postgres";


CREATE TYPE "public"."invitation_direction" AS ENUM (
    'parent_to_student',
    'student_to_parent'
);


ALTER TYPE "public"."invitation_direction" OWNER TO "postgres";


CREATE TYPE "public"."invitation_status" AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'cancelled'
);


ALTER TYPE "public"."invitation_status" OWNER TO "postgres";


CREATE TYPE "public"."mood_type" AS ENUM (
    'sad',
    'neutral',
    'happy'
);


ALTER TYPE "public"."mood_type" OWNER TO "postgres";


CREATE TYPE "public"."pet_rarity" AS ENUM (
    'common',
    'rare',
    'epic',
    'legendary'
);


ALTER TYPE "public"."pet_rarity" OWNER TO "postgres";


CREATE TYPE "public"."question_type" AS ENUM (
    'mcq',
    'short_answer',
    'mrq'
);


ALTER TYPE "public"."question_type" OWNER TO "postgres";


COMMENT ON TYPE "public"."question_type" IS 'Question types: mcq (single correct answer), mrq (multiple correct answers), short_answer (text response)';



CREATE TYPE "public"."subscription_tier" AS ENUM (
    'core',
    'plus',
    'pro',
    'max'
);


ALTER TYPE "public"."subscription_tier" OWNER TO "postgres";


CREATE TYPE "public"."user_type" AS ENUM (
    'admin',
    'student',
    'parent'
);


ALTER TYPE "public"."user_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_weekly_leaderboard_data"() RETURNS TABLE("id" "uuid", "name" "text", "avatar_path" "text", "weekly_xp" integer, "total_xp" integer, "grade_level_name" "text", "rank" bigint, "current_streak" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    p.id,
    p.name,
    p.avatar_path,
    COALESCE(SUM(ps.xp_earned), 0)::integer AS weekly_xp,
    sp.xp AS total_xp,
    gl.name AS grade_level_name,
    RANK() OVER (ORDER BY COALESCE(SUM(ps.xp_earned), 0) DESC) AS rank,
    public.calculate_display_streak(p.id) AS current_streak
  FROM profiles p
  JOIN student_profiles sp ON p.id = sp.id
  LEFT JOIN grade_levels gl ON sp.grade_level_id = gl.id
  LEFT JOIN practice_sessions ps
    ON ps.student_id = p.id
    AND ps.completed_at IS NOT NULL
    AND ps.completed_at >= (date_trunc('week', NOW() AT TIME ZONE 'Asia/Kuala_Lumpur') AT TIME ZONE 'Asia/Kuala_Lumpur')
  WHERE p.user_type = 'student'
  GROUP BY p.id, p.name, p.avatar_path, sp.xp, gl.name
  HAVING COALESCE(SUM(ps.xp_earned), 0) > 0
  ORDER BY weekly_xp DESC;
$$;


ALTER FUNCTION "public"."_weekly_leaderboard_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_parent_student_invitation"("p_invitation_id" "uuid", "p_accepting_user_id" "uuid", "p_is_parent" boolean) RETURNS TABLE("link_id" "uuid", "parent_id" "uuid", "student_id" "uuid", "linked_at" timestamp with time zone, "parent_name" "text", "parent_email" "text", "student_name" "text", "student_email" "text", "student_avatar_path" "text", "student_grade_level_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_invitation RECORD;
  v_link_id UUID;
  v_linked_at TIMESTAMPTZ;
  v_parent_id UUID;
  v_student_id UUID;
BEGIN
  -- Get and validate the invitation
  SELECT * INTO v_invitation
  FROM parent_student_invitations
  WHERE id = p_invitation_id;

  IF v_invitation IS NULL THEN
    RAISE EXCEPTION 'Invitation not found: %', p_invitation_id;
  END IF;

  IF v_invitation.status != 'pending' THEN
    RAISE EXCEPTION 'Invitation is not pending: %', v_invitation.status;
  END IF;

  -- Determine parent_id and student_id based on who is accepting
  IF p_is_parent THEN
    v_parent_id := p_accepting_user_id;
    v_student_id := v_invitation.student_id;

    IF v_student_id IS NULL THEN
      RAISE EXCEPTION 'Student ID not found in invitation';
    END IF;
  ELSE
    v_parent_id := v_invitation.parent_id;
    v_student_id := p_accepting_user_id;

    IF v_parent_id IS NULL THEN
      RAISE EXCEPTION 'Parent ID not found in invitation';
    END IF;
  END IF;

  -- Check if student already has a linked parent
  IF EXISTS (
    SELECT 1 FROM parent_student_links
    WHERE parent_student_links.student_id = v_student_id
  ) THEN
    RAISE EXCEPTION 'Student already has a linked parent';
  END IF;

  -- Step 1: Update the invitation status
  UPDATE parent_student_invitations
  SET
    status = 'accepted',
    responded_at = NOW(),
    parent_id = v_parent_id,
    student_id = v_student_id
  WHERE id = p_invitation_id;

  -- Step 2: Create the parent-student link
  INSERT INTO parent_student_links (parent_id, student_id)
  VALUES (v_parent_id, v_student_id)
  RETURNING id, parent_student_links.linked_at INTO v_link_id, v_linked_at;

  -- Step 3: Return the link data with profile information
  RETURN QUERY
  SELECT
    v_link_id,
    v_parent_id,
    v_student_id,
    v_linked_at,
    p.name,
    p.email,
    sp_profile.name,
    sp_profile.email,
    sp_profile.avatar_path,
    gl.name
  FROM profiles p
  CROSS JOIN profiles sp_profile
  LEFT JOIN student_profiles sp ON sp.id = v_student_id
  LEFT JOIN grade_levels gl ON gl.id = sp.grade_level_id
  WHERE p.id = v_parent_id
    AND sp_profile.id = v_student_id;
END;
$$;


ALTER FUNCTION "public"."accept_parent_student_invitation"("p_invitation_id" "uuid", "p_accepting_user_id" "uuid", "p_is_parent" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_mark_practiced_on_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_session_date DATE;
BEGIN
  -- Only fire when completed_at transitions from NULL to a value
  IF NEW.completed_at IS NOT NULL AND (OLD IS NULL OR OLD.completed_at IS NULL) THEN
    v_session_date := (NEW.completed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;

    -- Upsert daily_statuses: create if missing, set has_practiced = TRUE
    INSERT INTO daily_statuses (student_id, date, has_practiced)
    VALUES (NEW.student_id, v_session_date, TRUE)
    ON CONFLICT (student_id, date)
    DO UPDATE SET has_practiced = TRUE
    WHERE daily_statuses.has_practiced = FALSE;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_mark_practiced_on_complete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_display_streak"("p_student_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;
  v_last_practiced_date DATE;
  v_streak INTEGER := 0;
  v_check_date DATE;
  v_practiced BOOLEAN;
BEGIN
  -- Get the most recent practice date
  SELECT MAX(date) INTO v_last_practiced_date
  FROM public.daily_statuses
  WHERE student_id = p_student_id AND has_practiced = true;

  -- If never practiced, streak is 0
  IF v_last_practiced_date IS NULL THEN
    RETURN 0;
  END IF;

  -- If last practice was before yesterday (local timezone), streak is broken
  IF v_last_practiced_date < v_today - 1 THEN
    RETURN 0;
  END IF;

  -- Count consecutive days starting from last practiced date
  v_check_date := v_last_practiced_date;
  LOOP
    SELECT has_practiced INTO v_practiced
    FROM public.daily_statuses
    WHERE student_id = p_student_id AND date = v_check_date;

    IF v_practiced IS TRUE THEN
      v_streak := v_streak + 1;
      v_check_date := v_check_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$$;


ALTER FUNCTION "public"."calculate_display_streak"("p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."combine_pets"("p_student_id" "uuid", "p_owned_pet_ids" "uuid"[]) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_rarity public.pet_rarity;
  v_next_rarity public.pet_rarity;
  v_success boolean;
  v_success_rate numeric;
  v_result_rarity public.pet_rarity;
  v_result_pet_id uuid;
  v_unique_id uuid;
  v_required_count integer;
  v_actual_count integer;
  v_actual_rarity public.pet_rarity;
BEGIN
  -- Validate exactly 4 pets in array
  IF array_length(p_owned_pet_ids, 1) IS NULL OR array_length(p_owned_pet_ids, 1) != 4 THEN
    RETURN json_build_object('success', false, 'error', 'Must select exactly 4 pets');
  END IF;

  -- Get rarity of first pet
  SELECT p.rarity INTO v_rarity
  FROM public.owned_pets op
  JOIN public.pets p ON p.id = op.pet_id
  WHERE op.id = p_owned_pet_ids[1] AND op.student_id = p_student_id;

  IF v_rarity IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Pet not found or not owned');
  END IF;

  IF v_rarity = 'legendary' THEN
    RETURN json_build_object('success', false, 'error', 'Cannot combine legendary pets');
  END IF;

  -- Validate each unique owned_pet_id:
  -- 1. Must be owned by the student
  -- 2. Must be same rarity
  -- 3. Must have enough count to cover how many times it appears in the array
  FOR v_unique_id IN SELECT DISTINCT unnest(p_owned_pet_ids)
  LOOP
    -- Count how many times this ID appears in the input array
    SELECT COUNT(*) INTO v_required_count
    FROM unnest(p_owned_pet_ids) AS id
    WHERE id = v_unique_id;

    -- Get actual count and rarity from database
    SELECT op.count, p.rarity INTO v_actual_count, v_actual_rarity
    FROM public.owned_pets op
    JOIN public.pets p ON p.id = op.pet_id
    WHERE op.id = v_unique_id AND op.student_id = p_student_id;

    -- Check if pet exists and is owned
    IF v_actual_count IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Pet not found or not owned');
    END IF;

    -- Check if same rarity
    IF v_actual_rarity != v_rarity THEN
      RETURN json_build_object('success', false, 'error', 'All pets must be same rarity');
    END IF;

    -- Check if user has enough of this pet
    IF v_actual_count < v_required_count THEN
      RETURN json_build_object('success', false, 'error', 'Not enough of this pet to combine');
    END IF;
  END LOOP;

  -- Determine next rarity and success rate
  v_next_rarity := CASE v_rarity
    WHEN 'common' THEN 'rare'::public.pet_rarity
    WHEN 'rare' THEN 'epic'::public.pet_rarity
    WHEN 'epic' THEN 'legendary'::public.pet_rarity
  END;

  -- Success rates: Common->Rare 50%, Rare->Epic 35%, Epic->Legendary 25%
  v_success_rate := CASE v_rarity
    WHEN 'common' THEN 0.50
    WHEN 'rare' THEN 0.35
    WHEN 'epic' THEN 0.25
    ELSE 0
  END;

  -- Roll for success
  v_success := random() < v_success_rate;
  v_result_rarity := CASE WHEN v_success THEN v_next_rarity ELSE v_rarity END;

  -- Select random result pet of the result rarity
  SELECT id INTO v_result_pet_id
  FROM public.pets
  WHERE rarity = v_result_rarity
  ORDER BY random()
  LIMIT 1;

  IF v_result_pet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No pets available for result rarity');
  END IF;

  -- Consume the 4 input pets (decrement count based on how many times each ID appears)
  FOR v_unique_id IN SELECT DISTINCT unnest(p_owned_pet_ids)
  LOOP
    -- Count how many times this ID appears
    SELECT COUNT(*) INTO v_required_count
    FROM unnest(p_owned_pet_ids) AS id
    WHERE id = v_unique_id;

    -- Get current count
    SELECT count INTO v_actual_count
    FROM public.owned_pets
    WHERE id = v_unique_id;

    -- Decrement or delete
    IF v_actual_count > v_required_count THEN
      UPDATE public.owned_pets SET count = count - v_required_count WHERE id = v_unique_id;
    ELSE
      DELETE FROM public.owned_pets WHERE id = v_unique_id;
    END IF;
  END LOOP;

  -- Add result pet at tier 1
  INSERT INTO public.owned_pets (student_id, pet_id, tier, count)
  VALUES (p_student_id, v_result_pet_id, 1, 1)
  ON CONFLICT (student_id, pet_id)
  DO UPDATE SET count = public.owned_pets.count + 1;

  RETURN json_build_object(
    'success', true,
    'upgraded', v_success,
    'result_pet_id', v_result_pet_id,
    'result_rarity', v_result_rarity
  );
END;
$$;


ALTER FUNCTION "public"."combine_pets"("p_student_id" "uuid", "p_owned_pet_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_practice_session"("p_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_student_id UUID;
  v_completed_at TIMESTAMPTZ;
  v_correct_count INTEGER;
  v_total_time_seconds INTEGER;
  v_base_xp CONSTANT INTEGER := 25;
  v_bonus_xp_per_correct CONSTANT INTEGER := 15;
  v_base_coins CONSTANT INTEGER := 10;
  v_bonus_coins_per_correct CONSTANT INTEGER := 5;
  v_total_xp INTEGER;
  v_total_coins INTEGER;
BEGIN
  -- Check if session exists and is not already completed
  SELECT student_id, completed_at
  INTO v_student_id, v_completed_at
  FROM practice_sessions
  WHERE id = p_session_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF v_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Session already completed: %', p_session_id;
  END IF;

  -- Count correct answers from actual answer records (not client-supplied)
  SELECT
    COUNT(*) FILTER (WHERE is_correct = TRUE),
    COALESCE(SUM(time_spent_seconds), 0)
  INTO v_correct_count, v_total_time_seconds
  FROM practice_answers
  WHERE session_id = p_session_id;

  -- Calculate rewards server-side
  v_total_xp := v_base_xp + (v_correct_count * v_bonus_xp_per_correct);
  v_total_coins := v_base_coins + (v_correct_count * v_bonus_coins_per_correct);

  -- Update the practice session with completion data
  -- Setting completed_at fires the auto_mark_practiced_on_complete trigger,
  -- which upserts daily_statuses with the correct local timezone date
  -- and cascades to update the student's streak
  UPDATE practice_sessions
  SET
    completed_at = NOW(),
    total_time_seconds = v_total_time_seconds,
    correct_count = v_correct_count,
    xp_earned = v_total_xp,
    coins_earned = v_total_coins
  WHERE id = p_session_id;

  -- Award XP and coins to the student
  UPDATE student_profiles
  SET
    xp = xp + v_total_xp,
    coins = coins + v_total_coins
  WHERE id = v_student_id;

  RETURN jsonb_build_object(
    'xp_earned', v_total_xp,
    'coins_earned', v_total_coins,
    'correct_count', v_correct_count
  );
END;
$$;


ALTER FUNCTION "public"."complete_practice_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_practice_session"("p_student_id" "uuid", "p_topic_id" "uuid", "p_grade_level_id" "uuid", "p_subject_id" "uuid", "p_questions" "jsonb", "p_cycle_number" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_session_id UUID;
  v_total_questions INT;
  v_tier subscription_tier;
  v_max_sessions INT;
  v_sessions_today INT;
BEGIN
  -- Calculate total questions from input array
  v_total_questions := jsonb_array_length(p_questions);

  IF v_total_questions = 0 THEN
    RAISE EXCEPTION 'Questions array cannot be empty';
  END IF;

  -- Read the student's subscription tier directly from student_profiles
  SELECT sp.subscription_tier INTO v_tier
  FROM student_profiles sp
  WHERE sp.id = p_student_id;

  -- Fallback to 'core' if no profile found (shouldn't happen)
  IF v_tier IS NULL THEN
    v_tier := 'core';
  END IF;

  -- Get the daily session limit for this tier
  SELECT spl.sessions_per_day INTO v_max_sessions
  FROM subscription_plans spl
  WHERE spl.id = v_tier;

  IF v_max_sessions IS NULL THEN
    v_max_sessions := 3; -- safe fallback
  END IF;

  -- Count sessions the student already started today (UTC day)
  SELECT count(*) INTO v_sessions_today
  FROM practice_sessions ps
  WHERE ps.student_id = p_student_id
    AND ps.created_at >= date_trunc('day', now())
    AND ps.created_at < date_trunc('day', now()) + interval '1 day';

  IF v_sessions_today >= v_max_sessions THEN
    RAISE EXCEPTION 'Daily session limit reached (% of % sessions)', v_sessions_today, v_max_sessions;
  END IF;

  -- Create the practice session
  INSERT INTO practice_sessions (
    student_id,
    topic_id,
    grade_level_id,
    subject_id,
    total_questions,
    current_question_index,
    correct_count
  )
  VALUES (
    p_student_id,
    p_topic_id,
    p_grade_level_id,
    p_subject_id,
    v_total_questions,
    0,
    0
  )
  RETURNING id INTO v_session_id;

  -- Insert session questions (preserves question order)
  INSERT INTO session_questions (session_id, question_id, question_order)
  SELECT
    v_session_id,
    (q->>'question_id')::UUID,
    (q->>'question_order')::INT
  FROM jsonb_array_elements(p_questions) AS q;

  -- Upsert student question progress (track which questions were used)
  INSERT INTO student_question_progress (student_id, topic_id, question_id, cycle_number)
  SELECT
    p_student_id,
    p_topic_id,
    (q->>'question_id')::UUID,
    p_cycle_number
  FROM jsonb_array_elements(p_questions) AS q
  ON CONFLICT (student_id, topic_id, question_id, cycle_number) DO NOTHING;

  RETURN v_session_id;
END;
$$;


ALTER FUNCTION "public"."create_practice_session"("p_student_id" "uuid", "p_topic_id" "uuid", "p_grade_level_id" "uuid", "p_subject_id" "uuid", "p_questions" "jsonb", "p_cycle_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_user_profile"("p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_user_type" "text", "p_date_of_birth" "date" DEFAULT NULL::"date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Validate user type
  IF p_user_type NOT IN ('student', 'parent') THEN
    RAISE EXCEPTION 'Invalid user type: %. Must be student or parent', p_user_type;
  END IF;

  -- Step 1: Create main profile
  INSERT INTO profiles (id, email, name, user_type, date_of_birth)
  VALUES (p_user_id, p_email, p_name, p_user_type::user_type, p_date_of_birth);

  -- Step 2: Create type-specific profile
  IF p_user_type = 'student' THEN
    INSERT INTO student_profiles (id)
    VALUES (p_user_id);
  ELSE
    INSERT INTO parent_profiles (id)
    VALUES (p_user_id);
  END IF;
END;
$$;


ALTER FUNCTION "public"."create_user_profile"("p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_user_type" "text", "p_date_of_birth" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."distribute_weekly_leaderboard_rewards"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_week_start DATE;
  v_week_end TIMESTAMPTZ;
  v_week_start_ts TIMESTAMPTZ;
  v_already_distributed BOOLEAN;
  v_coin_rewards INTEGER[] := ARRAY[500, 400, 300, 250, 200, 150, 125, 100, 75, 50];
  v_record RECORD;
BEGIN
  -- Calculate previous week boundaries in MYT (Asia/Kuala_Lumpur = UTC+8)
  -- "Previous week" = the Monday-to-Sunday that just ended
  v_week_start := date_trunc('week', (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur') - INTERVAL '1 day')::DATE;
  v_week_start_ts := v_week_start::TIMESTAMPTZ AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_week_end := v_week_start_ts + INTERVAL '7 days';

  -- Idempotency check: skip if rewards already exist for this week
  SELECT EXISTS(
    SELECT 1 FROM weekly_leaderboard_rewards WHERE week_start = v_week_start
  ) INTO v_already_distributed;

  IF v_already_distributed THEN
    RETURN;
  END IF;

  -- Get top 10 ranked students by weekly XP for the previous week
  -- DENSE_RANK ensures tied students get the same rank and no reward tiers are skipped
  FOR v_record IN
    WITH ranked AS (
      SELECT
        ps.student_id,
        COALESCE(SUM(ps.xp_earned), 0)::INTEGER AS weekly_xp,
        DENSE_RANK() OVER (ORDER BY COALESCE(SUM(ps.xp_earned), 0) DESC) AS rank
      FROM practice_sessions ps
      WHERE ps.completed_at IS NOT NULL
        AND ps.completed_at >= v_week_start_ts
        AND ps.completed_at < v_week_end
      GROUP BY ps.student_id
      HAVING COALESCE(SUM(ps.xp_earned), 0) > 0
    )
    SELECT * FROM ranked WHERE rank <= 10
    ORDER BY rank
  LOOP
    -- Insert reward record
    INSERT INTO weekly_leaderboard_rewards (week_start, student_id, rank, weekly_xp, coins_awarded)
    VALUES (v_week_start, v_record.student_id, v_record.rank, v_record.weekly_xp, v_coin_rewards[v_record.rank]);

    -- Add coins to student profile
    UPDATE student_profiles
    SET coins = coins + v_coin_rewards[v_record.rank]
    WHERE id = v_record.student_id;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."distribute_weekly_leaderboard_rewards"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evolve_pet"("p_owned_pet_id" "uuid", "p_student_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_owned_pet RECORD;
  v_current_tier INTEGER;
  v_food_fed INTEGER;
  v_required_food INTEGER;
  v_new_tier INTEGER;
BEGIN
  -- Get the owned pet
  SELECT * INTO v_owned_pet
  FROM public.owned_pets
  WHERE id = p_owned_pet_id AND student_id = p_student_id;

  IF v_owned_pet IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Pet not found');
  END IF;

  v_current_tier := v_owned_pet.tier;
  v_food_fed := v_owned_pet.food_fed;

  -- Check if already max tier
  IF v_current_tier >= 3 THEN
    RETURN json_build_object('success', false, 'error', 'Pet is already at max tier');
  END IF;

  -- Calculate required food for next evolution
  IF v_current_tier = 1 THEN
    v_required_food := 10;
  ELSE
    v_required_food := 25;
  END IF;

  -- Check if enough food has been fed
  IF v_food_fed < v_required_food THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Not enough food fed',
      'current', v_food_fed,
      'required', v_required_food
    );
  END IF;

  -- Evolve the pet
  v_new_tier := v_current_tier + 1;

  UPDATE public.owned_pets
  SET
    tier = v_new_tier,
    food_fed = 0  -- Reset food counter after evolution
  WHERE id = p_owned_pet_id;

  RETURN json_build_object(
    'success', true,
    'new_tier', v_new_tier,
    'pet_id', v_owned_pet.pet_id
  );
END;
$$;


ALTER FUNCTION "public"."evolve_pet"("p_owned_pet_id" "uuid", "p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exchange_coins_for_food"("p_food_amount" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_student_id UUID;
  v_coin_cost INTEGER;
  v_current_coins INTEGER;
  v_food_price CONSTANT INTEGER := 50; -- coins per food
BEGIN
  v_student_id := (SELECT auth.uid());
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_food_amount <= 0 THEN
    RAISE EXCEPTION 'Food amount must be positive';
  END IF;

  v_coin_cost := p_food_amount * v_food_price;

  SELECT coins INTO v_current_coins FROM student_profiles WHERE id = v_student_id;
  IF v_current_coins IS NULL THEN
    RAISE EXCEPTION 'Student profile not found';
  END IF;
  IF v_current_coins < v_coin_cost THEN
    RAISE EXCEPTION 'Insufficient coins';
  END IF;

  -- Atomically deduct coins and add food
  UPDATE student_profiles
  SET
    coins = coins - v_coin_cost,
    food = food + p_food_amount
  WHERE id = v_student_id;
END;
$$;


ALTER FUNCTION "public"."exchange_coins_for_food"("p_food_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."feed_pet_for_evolution"("p_owned_pet_id" "uuid", "p_student_id" "uuid", "p_food_amount" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_owned_pet RECORD;
  v_student_food INTEGER;
  v_new_food_fed INTEGER;
  v_required_food INTEGER;
  v_can_evolve BOOLEAN;
BEGIN
  -- Get the owned pet
  SELECT * INTO v_owned_pet
  FROM public.owned_pets
  WHERE id = p_owned_pet_id AND student_id = p_student_id;

  IF v_owned_pet IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Pet not found');
  END IF;

  -- Check if at max tier
  IF v_owned_pet.tier >= 3 THEN
    RETURN json_build_object('success', false, 'error', 'Pet is already at max tier');
  END IF;

  -- Get student's food balance
  SELECT food INTO v_student_food
  FROM public.student_profiles
  WHERE id = p_student_id;

  IF v_student_food IS NULL OR v_student_food < p_food_amount THEN
    RETURN json_build_object('success', false, 'error', 'Not enough food');
  END IF;

  -- Deduct food from student
  UPDATE public.student_profiles
  SET food = food - p_food_amount
  WHERE id = p_student_id;

  -- Add food to pet
  v_new_food_fed := v_owned_pet.food_fed + p_food_amount;

  UPDATE public.owned_pets
  SET food_fed = v_new_food_fed
  WHERE id = p_owned_pet_id;

  -- Calculate if can evolve
  IF v_owned_pet.tier = 1 THEN
    v_required_food := 10;
  ELSE
    v_required_food := 25;
  END IF;

  v_can_evolve := v_new_food_fed >= v_required_food;

  RETURN json_build_object(
    'success', true,
    'food_fed', v_new_food_fed,
    'required_food', v_required_food,
    'can_evolve', v_can_evolve
  );
END;
$$;


ALTER FUNCTION "public"."feed_pet_for_evolution"("p_owned_pet_id" "uuid", "p_student_id" "uuid", "p_food_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gacha_multi_pull"() RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_student_id UUID;
  v_current_coins INTEGER;
  v_cost CONSTANT INTEGER := 900;
  v_result uuid[] := '{}';
  v_pet_id UUID;
  v_random_value FLOAT;
  v_rarity pet_rarity;
  i INTEGER;
BEGIN
  v_student_id := (SELECT auth.uid());
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT coins INTO v_current_coins FROM student_profiles WHERE id = v_student_id;
  IF v_current_coins IS NULL THEN
    RAISE EXCEPTION 'Student profile not found';
  END IF;
  IF v_current_coins < v_cost THEN
    RAISE EXCEPTION 'Insufficient coins';
  END IF;

  -- Deduct coins (900 for 10x = 10% discount)
  UPDATE student_profiles SET coins = coins - v_cost WHERE id = v_student_id;

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
      updated_at = NOW();
  END LOOP;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."gacha_multi_pull"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gacha_pull"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_student_id UUID;
  v_current_coins INTEGER;
  v_cost CONSTANT INTEGER := 100;
  v_random_value FLOAT;
  v_selected_pet_id UUID;
  v_rarity pet_rarity;
BEGIN
  v_student_id := (SELECT auth.uid());
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check coins
  SELECT coins INTO v_current_coins FROM student_profiles WHERE id = v_student_id;
  IF v_current_coins IS NULL THEN
    RAISE EXCEPTION 'Student profile not found';
  END IF;
  IF v_current_coins < v_cost THEN
    RAISE EXCEPTION 'Insufficient coins';
  END IF;

  -- Deduct coins
  UPDATE student_profiles SET coins = coins - v_cost WHERE id = v_student_id;

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

  -- Select random pet of that rarity
  SELECT id INTO v_selected_pet_id FROM pets WHERE rarity = v_rarity ORDER BY random() LIMIT 1;

  -- Add to owned pets (or increment count)
  INSERT INTO owned_pets (student_id, pet_id, count)
  VALUES (v_student_id, v_selected_pet_id, 1)
  ON CONFLICT (student_id, pet_id) DO UPDATE SET
    count = owned_pets.count + 1,
    updated_at = NOW();

  RETURN v_selected_pet_id;
END;
$$;


ALTER FUNCTION "public"."gacha_pull"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_question_statistics"() RETURNS TABLE("question_id" "uuid", "attempts" bigint, "correct_count" bigint, "correctness_rate" numeric, "avg_time_seconds" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_type TEXT;
BEGIN
  -- Check if the current user is an admin
  SELECT p.user_type INTO v_user_type
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_user_type != 'admin' THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Return all statistics for admin users
  RETURN QUERY
  SELECT
    qs.question_id,
    qs.attempts,
    qs.correct_count,
    qs.correctness_rate,
    qs.avg_time_seconds
  FROM public.question_statistics qs;
END;
$$;


ALTER FUNCTION "public"."get_question_statistics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_profile_for_dialog"("p_student_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_coins INTEGER;
  v_member_since TIMESTAMPTZ;
  v_selected_pet_id UUID;
  v_pet JSONB := NULL;
  v_best_subjects JSONB;
  v_weekly_dates JSONB;
  v_today DATE;
  v_monday DATE;
BEGIN
  -- Get profile basics
  SELECT sp.coins, sp.selected_pet_id, pr.created_at
  INTO v_coins, v_selected_pet_id, v_member_since
  FROM public.student_profiles sp
  JOIN public.profiles pr ON pr.id = sp.id
  WHERE sp.id = p_student_id;

  -- Get pet data if selected
  IF v_selected_pet_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'name', p.name,
      'rarity', p.rarity,
      'image_path', p.image_path,
      'tier2_image_path', p.tier2_image_path,
      'tier3_image_path', p.tier3_image_path,
      'tier', COALESCE(op.tier, 1)
    )
    INTO v_pet
    FROM public.pets p
    LEFT JOIN public.owned_pets op ON op.pet_id = p.id AND op.student_id = p_student_id
    WHERE p.id = v_selected_pet_id;
  END IF;

  -- Best subjects: top 3 by average score
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_best_subjects
  FROM (
    SELECT jsonb_build_object(
      'grade_level_name', gl.name,
      'subject_name', s.name,
      'average_score', ROUND(AVG(
        CASE WHEN ps.total_questions > 0
          THEN (ps.correct_count::numeric / ps.total_questions * 100)
          ELSE 0
        END
      ))::integer
    ) AS row_data
    FROM public.practice_sessions ps
    JOIN public.grade_levels gl ON gl.id = ps.grade_level_id
    JOIN public.subjects s ON s.id = ps.subject_id
    WHERE ps.student_id = p_student_id
      AND ps.completed_at IS NOT NULL
      AND ps.total_questions > 0
    GROUP BY gl.name, s.name
    ORDER BY ROUND(AVG(
      CASE WHEN ps.total_questions > 0
        THEN (ps.correct_count::numeric / ps.total_questions * 100)
        ELSE 0
      END
    ))::integer DESC
    LIMIT 3
  ) sub;

  -- Weekly activity: dates this week with has_practiced = true from daily_statuses
  -- Uses daily_statuses (same source as streak calculation) for consistency
  v_today := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;
  v_monday := v_today - (EXTRACT(ISODOW FROM v_today)::integer - 1);

  SELECT COALESCE(jsonb_agg(ds.date), '[]'::jsonb)
  INTO v_weekly_dates
  FROM public.daily_statuses ds
  WHERE ds.student_id = p_student_id
    AND ds.has_practiced = true
    AND ds.date >= v_monday
    AND ds.date <= v_today;

  RETURN jsonb_build_object(
    'coins', COALESCE(v_coins, 0),
    'member_since', v_member_since,
    'pet', v_pet,
    'best_subjects', v_best_subjects,
    'weekly_activity_dates', v_weekly_dates
  );
END;
$$;


ALTER FUNCTION "public"."get_student_profile_for_dialog"("p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_streak"("p_student_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_streak INTEGER := 0;
  v_current_date DATE := CURRENT_DATE;
  v_practiced BOOLEAN;
BEGIN
  LOOP
    SELECT has_practiced INTO v_practiced
    FROM daily_statuses
    WHERE student_id = p_student_id AND date = v_current_date;

    IF v_practiced IS TRUE THEN
      v_streak := v_streak + 1;
      v_current_date := v_current_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$$;


ALTER FUNCTION "public"."get_student_streak"("p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tier_from_stripe_price"("p_price_id" "text") RETURNS "public"."subscription_tier"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tier subscription_tier;
BEGIN
  SELECT id INTO v_tier
  FROM subscription_plans
  WHERE stripe_price_id = p_price_id;

  RETURN COALESCE(v_tier, 'basic');
END;
$$;


ALTER FUNCTION "public"."get_tier_from_stripe_price"("p_price_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_announcement_count"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COUNT(*)::INTEGER
  FROM announcements a
  WHERE
    (a.expires_at IS NULL OR a.expires_at > NOW())
    AND (
      (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND user_type = 'student')
       AND a.target_audience IN ('all', 'students_only'))
      OR (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND user_type = 'parent')
          AND a.target_audience IN ('all', 'parents_only'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM announcement_reads ar
      WHERE ar.announcement_id = a.id AND ar.user_id = (SELECT auth.uid())
    );
$$;


ALTER FUNCTION "public"."get_unread_announcement_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_subscription_tier"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Allow if not in a user session (service role / SECURITY DEFINER context)
  IF current_setting('request.jwt.claim.role', true) IS NULL
     OR current_setting('request.jwt.claim.role', true) = '' THEN
    RETURN NEW;
  END IF;

  -- In an authenticated session, silently revert the tier change
  IF OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier THEN
    NEW.subscription_tier := OLD.subscription_tier;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_subscription_tier"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initial_pet_draw"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_student_id uuid;
  v_pet_id uuid;
BEGIN
  -- Get authenticated student
  v_student_id := (SELECT auth.uid());
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify student profile exists
  IF NOT EXISTS (SELECT 1 FROM student_profiles WHERE id = v_student_id) THEN
    RAISE EXCEPTION 'Student profile not found';
  END IF;

  -- Look up Cloud Bunny by name (avoids hardcoded UUID across environments)
  SELECT id INTO v_pet_id FROM pets WHERE name = 'Cloud Bunny' LIMIT 1;
  IF v_pet_id IS NULL THEN
    RAISE EXCEPTION 'Starter pet not found';
  END IF;

  -- Insert Cloud Bunny (UPSERT — truly idempotent, no error on retry)
  INSERT INTO owned_pets (student_id, pet_id, count, tier, food_fed)
  VALUES (v_student_id, v_pet_id, 1, 1, 0)
  ON CONFLICT (student_id, pet_id) DO NOTHING;

  RETURN v_pet_id;
END;
$$;


ALTER FUNCTION "public"."initial_pet_draw"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."populate_question_hierarchy"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  SELECT s.id, s.grade_level_id INTO NEW.subject_id, NEW.grade_level_id
  FROM public.sub_topics st
  JOIN public.topics t ON st.topic_id = t.id
  JOIN public.subjects s ON t.subject_id = s.id
  WHERE st.id = NEW.topic_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."populate_question_hierarchy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."populate_session_hierarchy"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  SELECT s.id, s.grade_level_id INTO NEW.subject_id, NEW.grade_level_id
  FROM public.sub_topics st
  JOIN public.topics t ON st.topic_id = t.id
  JOIN public.subjects s ON t.subject_id = s.id
  WHERE st.id = NEW.topic_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."populate_session_hierarchy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_unlink_with_active_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM child_subscriptions cs
    WHERE cs.parent_id = OLD.parent_id
      AND cs.student_id = OLD.student_id
      AND cs.is_active = true
      AND cs.tier != 'core'
  ) THEN
    RAISE EXCEPTION 'Cannot unlink while an active paid subscription exists. Please cancel the subscription first.';
  END IF;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_unlink_with_active_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_spin_reward"("p_daily_status_id" "uuid", "p_student_id" "uuid", "p_reward" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_has_spun BOOLEAN;
BEGIN
  -- Validate reward is one of the valid spin wheel amounts
  IF p_reward NOT IN (5, 10, 15) THEN
    RAISE EXCEPTION 'Invalid reward amount. Must be 5, 10, or 15.';
  END IF;

  -- Check if already spun today
  SELECT has_spun INTO v_has_spun
  FROM daily_statuses
  WHERE id = p_daily_status_id AND student_id = p_student_id;

  IF v_has_spun IS NULL THEN
    RAISE EXCEPTION 'Daily status not found for student';
  END IF;

  IF v_has_spun = TRUE THEN
    RAISE EXCEPTION 'Already spun today';
  END IF;

  -- Step 1: Update daily status with spin info
  UPDATE daily_statuses
  SET
    has_spun = TRUE,
    spin_reward = p_reward
  WHERE id = p_daily_status_id
    AND student_id = p_student_id;

  -- Step 2: Credit coins to student profile
  UPDATE student_profiles
  SET coins = coins + p_reward
  WHERE id = p_student_id;
END;
$$;


ALTER FUNCTION "public"."record_spin_reward"("p_daily_status_id" "uuid", "p_student_id" "uuid", "p_reward" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_question_statistics"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY question_statistics;
END;
$$;


ALTER FUNCTION "public"."refresh_question_statistics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_subscription_tier_to_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_student_id UUID;
  v_new_tier subscription_tier;
BEGIN
  -- Determine which student is affected
  IF TG_OP = 'DELETE' THEN
    v_student_id := OLD.student_id;
  ELSE
    v_student_id := NEW.student_id;
  END IF;

  -- Resolve the current active tier for this student
  SELECT cs.tier INTO v_new_tier
  FROM child_subscriptions cs
  WHERE cs.student_id = v_student_id
    AND cs.is_active = true
  ORDER BY cs.updated_at DESC
  LIMIT 1;

  -- If no active subscription, revert to 'core'
  IF v_new_tier IS NULL THEN
    v_new_tier := 'core';
  END IF;

  -- Update student_profiles
  UPDATE student_profiles
  SET subscription_tier = v_new_tier
  WHERE id = v_student_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


ALTER FUNCTION "public"."sync_subscription_tier_to_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_student_streak"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_student_streak(OLD.student_id);
    RETURN OLD;
  ELSE
    PERFORM update_student_streak(NEW.student_id);
    RETURN NEW;
  END IF;
END;
$$;


ALTER FUNCTION "public"."trigger_update_student_streak"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_questions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_questions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_session_correct_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only increment if the answer is correct
  IF NEW.is_correct THEN
    UPDATE public.practice_sessions
    SET correct_count = correct_count + 1
    WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_session_correct_count"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_session_correct_count"() IS 'Automatically increments practice_sessions.correct_count when a correct answer is inserted. Search path set to public for security.';



CREATE OR REPLACE FUNCTION "public"."update_student_streak"("p_student_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_streak INTEGER := 0;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;
  v_check_date DATE := v_today;
  v_practiced BOOLEAN;
BEGIN
  -- First check today (local timezone)
  SELECT has_practiced INTO v_practiced
  FROM public.daily_statuses
  WHERE student_id = p_student_id AND date = v_check_date;

  -- If practiced today, start counting from today
  IF v_practiced IS TRUE THEN
    v_streak := 1;
    v_check_date := v_check_date - INTERVAL '1 day';
  ELSE
    -- If not practiced today, check yesterday
    v_check_date := v_check_date - INTERVAL '1 day';
    SELECT has_practiced INTO v_practiced
    FROM public.daily_statuses
    WHERE student_id = p_student_id AND date = v_check_date;

    -- If didn't practice yesterday either, streak is 0
    IF v_practiced IS NOT TRUE THEN
      UPDATE public.student_profiles
      SET current_streak = 0
      WHERE id = p_student_id;
      RETURN 0;
    END IF;

    -- Practiced yesterday, start counting from yesterday
    v_streak := 1;
    v_check_date := v_check_date - INTERVAL '1 day';
  END IF;

  -- Continue counting consecutive days backwards
  LOOP
    SELECT has_practiced INTO v_practiced
    FROM public.daily_statuses
    WHERE student_id = p_student_id AND date = v_check_date;

    IF v_practiced IS TRUE THEN
      v_streak := v_streak + 1;
      v_check_date := v_check_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
  END LOOP;

  -- Update the student's current_streak
  UPDATE public.student_profiles
  SET current_streak = v_streak
  WHERE id = p_student_id;

  RETURN v_streak;
END;
$$;


ALTER FUNCTION "public"."update_student_streak"("p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."announcement_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."announcement_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "target_audience" "public"."announcement_audience" DEFAULT 'all'::"public"."announcement_audience" NOT NULL,
    "image_path" "text",
    "expires_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_pinned" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."child_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "tier" "public"."subscription_tier" DEFAULT 'core'::"public"."subscription_tier" NOT NULL,
    "start_date" timestamp with time zone DEFAULT CURRENT_DATE NOT NULL,
    "next_billing_date" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "stripe_subscription_id" "text",
    "stripe_price_id" "text",
    "stripe_status" "text",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false,
    "scheduled_tier" "public"."subscription_tier",
    "scheduled_change_date" timestamp with time zone,
    "stripe_schedule_id" "text"
);


ALTER TABLE "public"."child_subscriptions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."child_subscriptions"."scheduled_tier" IS 'The tier the subscription will change to at the scheduled date';



COMMENT ON COLUMN "public"."child_subscriptions"."scheduled_change_date" IS 'When the scheduled tier change will take effect';



COMMENT ON COLUMN "public"."child_subscriptions"."stripe_schedule_id" IS 'Stripe subscription schedule ID for tracking';



CREATE TABLE IF NOT EXISTS "public"."daily_statuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "mood" "public"."mood_type",
    "has_spun" boolean DEFAULT false,
    "spin_reward" integer,
    "has_practiced" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."daily_statuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grade_levels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."grade_levels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "user_type" "public"."user_type" NOT NULL,
    "date_of_birth" "date",
    "avatar_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "has_completed_tour" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_profiles" (
    "id" "uuid" NOT NULL,
    "grade_level_id" "uuid",
    "xp" integer DEFAULT 0,
    "coins" integer DEFAULT 0,
    "food" integer DEFAULT 0,
    "selected_pet_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "current_streak" integer DEFAULT 0 NOT NULL,
    "subscription_tier" "public"."subscription_tier" DEFAULT 'core'::"public"."subscription_tier" NOT NULL,
    "preferred_language" "text" DEFAULT 'en'::"text" NOT NULL,
    CONSTRAINT "preferred_language_check" CHECK (("preferred_language" = ANY (ARRAY['en'::"text", 'zh'::"text"])))
);


ALTER TABLE "public"."student_profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."leaderboard" WITH ("security_invoker"='true') AS
 SELECT "p"."id",
    "p"."name",
    "p"."avatar_path",
    "sp"."xp",
    "public"."calculate_display_streak"("p"."id") AS "current_streak",
    "gl"."name" AS "grade_level_name",
    "rank"() OVER (ORDER BY "sp"."xp" DESC) AS "rank"
   FROM (("public"."profiles" "p"
     JOIN "public"."student_profiles" "sp" ON (("p"."id" = "sp"."id")))
     LEFT JOIN "public"."grade_levels" "gl" ON (("sp"."grade_level_id" = "gl"."id")))
  WHERE ("p"."user_type" = 'student'::"public"."user_type")
  ORDER BY "sp"."xp" DESC;


ALTER VIEW "public"."leaderboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."owned_pets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "pet_id" "uuid" NOT NULL,
    "count" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tier" integer DEFAULT 1 NOT NULL,
    "food_fed" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "owned_pets_tier_check" CHECK ((("tier" >= 1) AND ("tier" <= 3)))
);


ALTER TABLE "public"."owned_pets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_profiles" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "stripe_customer_id" "text"
);


ALTER TABLE "public"."parent_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_student_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid",
    "parent_email" "text" NOT NULL,
    "student_id" "uuid",
    "student_email" "text" NOT NULL,
    "direction" "public"."invitation_direction" NOT NULL,
    "status" "public"."invitation_status" DEFAULT 'pending'::"public"."invitation_status",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "responded_at" timestamp with time zone,
    CONSTRAINT "valid_invitation" CHECK ((("parent_id" IS NOT NULL) OR ("student_id" IS NOT NULL)))
);


ALTER TABLE "public"."parent_student_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_student_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "linked_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."parent_student_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "stripe_invoice_id" "text",
    "stripe_payment_intent_id" "text",
    "stripe_subscription_id" "text",
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "status" "text" NOT NULL,
    "tier" "public"."subscription_tier",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."payment_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "rarity" "public"."pet_rarity" NOT NULL,
    "image_path" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tier2_image_path" "text",
    "tier3_image_path" "text"
);


ALTER TABLE "public"."pets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."practice_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "question_id" "uuid",
    "text_answer" "text",
    "is_correct" boolean NOT NULL,
    "time_spent_seconds" integer,
    "answered_at" timestamp with time zone DEFAULT "now"(),
    "selected_options" integer[]
);


ALTER TABLE "public"."practice_answers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."practice_answers"."selected_options" IS 'Array of selected option numbers (1-4). MCQ has single element, MRQ can have multiple.';



CREATE TABLE IF NOT EXISTS "public"."practice_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "grade_level_id" "uuid",
    "subject_id" "uuid",
    "total_questions" integer NOT NULL,
    "current_question_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "correct_count" integer,
    "xp_earned" integer,
    "coins_earned" integer,
    "total_time_seconds" integer DEFAULT 0,
    "ai_summary" "text"
);


ALTER TABLE "public"."practice_sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."practice_sessions"."ai_summary" IS 'AI-generated summary of the session performance, generated for Max tier subscribers';



CREATE TABLE IF NOT EXISTS "public"."processed_webhook_events" (
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."processed_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."question_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "reported_by" "uuid" NOT NULL,
    "category" "public"."feedback_category" NOT NULL,
    "comments" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."question_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "public"."question_type" NOT NULL,
    "question" "text" NOT NULL,
    "image_path" "text",
    "topic_id" "uuid" NOT NULL,
    "explanation" "text",
    "answer" "text",
    "option_1_text" "text",
    "option_1_image_path" "text",
    "option_1_is_correct" boolean DEFAULT false,
    "option_2_text" "text",
    "option_2_image_path" "text",
    "option_2_is_correct" boolean DEFAULT false,
    "option_3_text" "text",
    "option_3_image_path" "text",
    "option_3_is_correct" boolean,
    "option_4_text" "text",
    "option_4_image_path" "text",
    "option_4_is_correct" boolean,
    "grade_level_id" "uuid",
    "subject_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_hash" "text",
    CONSTRAINT "mcq_has_two_options" CHECK ((("type" <> 'mcq'::"public"."question_type") OR ((("option_1_text" IS NOT NULL) OR ("option_1_image_path" IS NOT NULL)) AND (("option_2_text" IS NOT NULL) OR ("option_2_image_path" IS NOT NULL))))),
    CONSTRAINT "mcq_one_correct" CHECK ((("type" <> 'mcq'::"public"."question_type") OR (((((COALESCE("option_1_is_correct", false))::integer + (COALESCE("option_2_is_correct", false))::integer) + (COALESCE("option_3_is_correct", false))::integer) + (COALESCE("option_4_is_correct", false))::integer) = 1))),
    CONSTRAINT "valid_short_answer" CHECK ((("type" <> 'short_answer'::"public"."question_type") OR ("answer" IS NOT NULL)))
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."questions"."image_hash" IS 'SHA-256 hash of combined question and option images for duplicate detection';



CREATE MATERIALIZED VIEW "public"."question_statistics" AS
 SELECT "q"."id" AS "question_id",
    "count"("pa"."id") AS "attempts",
    "count"("pa"."id") FILTER (WHERE "pa"."is_correct") AS "correct_count",
    "round"(((100.0 * ("count"("pa"."id") FILTER (WHERE "pa"."is_correct"))::numeric) / (NULLIF("count"("pa"."id"), 0))::numeric), 1) AS "correctness_rate",
    (COALESCE("avg"("pa"."time_spent_seconds"), (0)::numeric))::integer AS "avg_time_seconds"
   FROM ("public"."questions" "q"
     LEFT JOIN "public"."practice_answers" "pa" ON (("pa"."question_id" = "q"."id")))
  GROUP BY "q"."id"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."question_statistics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "question_order" integer NOT NULL
);


ALTER TABLE "public"."session_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_question_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "cycle_number" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."student_question_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sub_topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "cover_image_path" "text",
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "topic_id" "uuid" NOT NULL
);


ALTER TABLE "public"."sub_topics" OWNER TO "postgres";


COMMENT ON TABLE "public"."sub_topics" IS 'Sub-topics within a topic (renamed from original topics table). Questions and practice sessions reference sub_topics via topic_id column.';



CREATE TABLE IF NOT EXISTS "public"."subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grade_level_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "cover_image_path" "text",
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subjects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" "public"."subscription_tier" NOT NULL,
    "name" "text" NOT NULL,
    "price_monthly" numeric(10,2) NOT NULL,
    "sessions_per_day" integer NOT NULL,
    "features" "jsonb" DEFAULT '[]'::"jsonb",
    "is_highlighted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "stripe_price_id" "text"
);


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "cover_image_path" "text",
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."topics" OWNER TO "postgres";


COMMENT ON TABLE "public"."topics" IS 'Topics within a subject. Part of curriculum hierarchy: grade_levels -> subjects -> topics -> sub_topics';



CREATE OR REPLACE VIEW "public"."weekly_leaderboard" WITH ("security_invoker"='true') AS
 SELECT "id",
    "name",
    "avatar_path",
    "weekly_xp",
    "total_xp",
    "grade_level_name",
    "rank",
    "current_streak"
   FROM "public"."_weekly_leaderboard_data"() "_weekly_leaderboard_data"("id", "name", "avatar_path", "weekly_xp", "total_xp", "grade_level_name", "rank", "current_streak");


ALTER VIEW "public"."weekly_leaderboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_leaderboard_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_start" "date" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "rank" integer NOT NULL,
    "weekly_xp" integer NOT NULL,
    "coins_awarded" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "seen_at" timestamp with time zone
);


ALTER TABLE "public"."weekly_leaderboard_rewards" OWNER TO "postgres";


ALTER TABLE ONLY "public"."announcement_reads"
    ADD CONSTRAINT "announcement_reads_announcement_id_user_id_key" UNIQUE ("announcement_id", "user_id");



ALTER TABLE ONLY "public"."announcement_reads"
    ADD CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."child_subscriptions"
    ADD CONSTRAINT "child_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."child_subscriptions"
    ADD CONSTRAINT "child_subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."child_subscriptions"
    ADD CONSTRAINT "child_subscriptions_student_id_key" UNIQUE ("student_id");



ALTER TABLE ONLY "public"."daily_statuses"
    ADD CONSTRAINT "daily_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_statuses"
    ADD CONSTRAINT "daily_statuses_student_id_date_key" UNIQUE ("student_id", "date");



ALTER TABLE ONLY "public"."grade_levels"
    ADD CONSTRAINT "grade_levels_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."grade_levels"
    ADD CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."owned_pets"
    ADD CONSTRAINT "owned_pets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."owned_pets"
    ADD CONSTRAINT "owned_pets_student_id_pet_id_key" UNIQUE ("student_id", "pet_id");



ALTER TABLE ONLY "public"."parent_profiles"
    ADD CONSTRAINT "parent_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_profiles"
    ADD CONSTRAINT "parent_profiles_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."parent_student_invitations"
    ADD CONSTRAINT "parent_student_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_parent_id_student_id_key" UNIQUE ("parent_id", "student_id");



ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_student_id_unique" UNIQUE ("student_id");



ALTER TABLE ONLY "public"."payment_history"
    ADD CONSTRAINT "payment_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pets"
    ADD CONSTRAINT "pets_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."pets"
    ADD CONSTRAINT "pets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."practice_answers"
    ADD CONSTRAINT "practice_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."practice_answers"
    ADD CONSTRAINT "practice_answers_session_id_question_id_key" UNIQUE ("session_id", "question_id");



ALTER TABLE ONLY "public"."practice_sessions"
    ADD CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."processed_webhook_events"
    ADD CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_feedback"
    ADD CONSTRAINT "question_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_questions"
    ADD CONSTRAINT "session_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_questions"
    ADD CONSTRAINT "session_questions_session_id_question_id_key" UNIQUE ("session_id", "question_id");



ALTER TABLE ONLY "public"."session_questions"
    ADD CONSTRAINT "session_questions_session_id_question_order_key" UNIQUE ("session_id", "question_order");



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_question_progress"
    ADD CONSTRAINT "student_question_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_question_progress"
    ADD CONSTRAINT "student_question_progress_unique" UNIQUE ("student_id", "topic_id", "question_id", "cycle_number");



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_grade_level_id_name_key" UNIQUE ("grade_level_id", "name");



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sub_topics"
    ADD CONSTRAINT "topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_history"
    ADD CONSTRAINT "uq_payment_history_stripe_invoice_id" UNIQUE ("stripe_invoice_id");



ALTER TABLE ONLY "public"."weekly_leaderboard_rewards"
    ADD CONSTRAINT "weekly_leaderboard_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_leaderboard_rewards"
    ADD CONSTRAINT "weekly_leaderboard_rewards_week_start_student_id_key" UNIQUE ("week_start", "student_id");



CREATE INDEX "idx_announcement_reads_announcement_id" ON "public"."announcement_reads" USING "btree" ("announcement_id");



CREATE INDEX "idx_announcement_reads_user_id" ON "public"."announcement_reads" USING "btree" ("user_id");



CREATE INDEX "idx_announcements_created_at" ON "public"."announcements" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_announcements_created_by" ON "public"."announcements" USING "btree" ("created_by");



CREATE INDEX "idx_announcements_expires_at" ON "public"."announcements" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);



CREATE INDEX "idx_announcements_is_pinned" ON "public"."announcements" USING "btree" ("is_pinned" DESC);



CREATE INDEX "idx_announcements_target_audience" ON "public"."announcements" USING "btree" ("target_audience");



CREATE INDEX "idx_child_subscriptions_parent" ON "public"."child_subscriptions" USING "btree" ("parent_id");



CREATE INDEX "idx_child_subscriptions_stripe_subscription_id" ON "public"."child_subscriptions" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "idx_child_subscriptions_student" ON "public"."child_subscriptions" USING "btree" ("student_id");



CREATE INDEX "idx_daily_statuses_student_date" ON "public"."daily_statuses" USING "btree" ("student_id", "date");



CREATE INDEX "idx_feedback_question" ON "public"."question_feedback" USING "btree" ("question_id");



CREATE INDEX "idx_invitations_parent" ON "public"."parent_student_invitations" USING "btree" ("parent_id");



CREATE INDEX "idx_invitations_status" ON "public"."parent_student_invitations" USING "btree" ("status");



CREATE INDEX "idx_invitations_student" ON "public"."parent_student_invitations" USING "btree" ("student_id");



CREATE INDEX "idx_owned_pets_pet_id" ON "public"."owned_pets" USING "btree" ("pet_id");



CREATE INDEX "idx_owned_pets_student" ON "public"."owned_pets" USING "btree" ("student_id");



CREATE INDEX "idx_parent_profiles_stripe_customer_id" ON "public"."parent_profiles" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "idx_parent_student_links_parent" ON "public"."parent_student_links" USING "btree" ("parent_id");



CREATE INDEX "idx_parent_student_links_student" ON "public"."parent_student_links" USING "btree" ("student_id");



CREATE INDEX "idx_payment_history_created" ON "public"."payment_history" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_payment_history_parent" ON "public"."payment_history" USING "btree" ("parent_id");



CREATE INDEX "idx_payment_history_stripe_invoice" ON "public"."payment_history" USING "btree" ("stripe_invoice_id");



CREATE INDEX "idx_payment_history_student" ON "public"."payment_history" USING "btree" ("student_id");



CREATE INDEX "idx_practice_answers_question" ON "public"."practice_answers" USING "btree" ("question_id");



CREATE INDEX "idx_practice_answers_session" ON "public"."practice_answers" USING "btree" ("session_id");



CREATE INDEX "idx_practice_sessions_completed" ON "public"."practice_sessions" USING "btree" ("completed_at");



CREATE INDEX "idx_practice_sessions_completed_student" ON "public"."practice_sessions" USING "btree" ("completed_at", "student_id");



CREATE INDEX "idx_practice_sessions_grade_level_id" ON "public"."practice_sessions" USING "btree" ("grade_level_id");



CREATE INDEX "idx_practice_sessions_student" ON "public"."practice_sessions" USING "btree" ("student_id");



CREATE INDEX "idx_practice_sessions_subject_id" ON "public"."practice_sessions" USING "btree" ("subject_id");



CREATE INDEX "idx_practice_sessions_topic" ON "public"."practice_sessions" USING "btree" ("topic_id");



CREATE INDEX "idx_processed_webhook_events_processed_at" ON "public"."processed_webhook_events" USING "btree" ("processed_at");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_user_type" ON "public"."profiles" USING "btree" ("user_type");



CREATE INDEX "idx_question_feedback_reported_by" ON "public"."question_feedback" USING "btree" ("reported_by");



CREATE UNIQUE INDEX "idx_question_statistics_id" ON "public"."question_statistics" USING "btree" ("question_id");



CREATE INDEX "idx_questions_grade_level" ON "public"."questions" USING "btree" ("grade_level_id");



CREATE INDEX "idx_questions_image_hash" ON "public"."questions" USING "btree" ("image_hash") WHERE ("image_hash" IS NOT NULL);



CREATE INDEX "idx_questions_subject" ON "public"."questions" USING "btree" ("subject_id");



CREATE INDEX "idx_questions_topic" ON "public"."questions" USING "btree" ("topic_id");



CREATE INDEX "idx_questions_type" ON "public"."questions" USING "btree" ("type");



CREATE INDEX "idx_session_questions_question" ON "public"."session_questions" USING "btree" ("question_id");



CREATE INDEX "idx_session_questions_session" ON "public"."session_questions" USING "btree" ("session_id");



CREATE INDEX "idx_student_profiles_grade_level" ON "public"."student_profiles" USING "btree" ("grade_level_id");



CREATE INDEX "idx_student_profiles_selected_pet_id" ON "public"."student_profiles" USING "btree" ("selected_pet_id");



CREATE INDEX "idx_student_profiles_subscription_tier" ON "public"."student_profiles" USING "btree" ("subscription_tier");



CREATE INDEX "idx_student_profiles_xp" ON "public"."student_profiles" USING "btree" ("xp" DESC);



CREATE INDEX "idx_student_question_progress_lookup" ON "public"."student_question_progress" USING "btree" ("student_id", "topic_id", "cycle_number");



CREATE INDEX "idx_student_question_progress_question_id" ON "public"."student_question_progress" USING "btree" ("question_id");



CREATE INDEX "idx_student_question_progress_topic_id" ON "public"."student_question_progress" USING "btree" ("topic_id");



CREATE INDEX "idx_sub_topics_display_order" ON "public"."sub_topics" USING "btree" ("display_order");



CREATE INDEX "idx_sub_topics_topic_id" ON "public"."sub_topics" USING "btree" ("topic_id");



CREATE INDEX "idx_subjects_grade_level" ON "public"."subjects" USING "btree" ("grade_level_id");



CREATE INDEX "idx_topics_display_order" ON "public"."topics" USING "btree" ("display_order");



CREATE INDEX "idx_topics_subject_id" ON "public"."topics" USING "btree" ("subject_id");



CREATE INDEX "idx_weekly_leaderboard_rewards_student_id" ON "public"."weekly_leaderboard_rewards" USING "btree" ("student_id");



CREATE OR REPLACE TRIGGER "after_answer_insert_update_correct_count" AFTER INSERT ON "public"."practice_answers" FOR EACH ROW EXECUTE FUNCTION "public"."update_session_correct_count"();



CREATE OR REPLACE TRIGGER "mark_practiced_on_session_complete" AFTER INSERT OR UPDATE OF "completed_at" ON "public"."practice_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."auto_mark_practiced_on_complete"();



CREATE OR REPLACE TRIGGER "on_daily_status_change" AFTER INSERT OR DELETE OR UPDATE OF "has_practiced" ON "public"."daily_statuses" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_student_streak"();



CREATE OR REPLACE TRIGGER "populate_question_hierarchy_trigger" BEFORE INSERT OR UPDATE ON "public"."questions" FOR EACH ROW EXECUTE FUNCTION "public"."populate_question_hierarchy"();



CREATE OR REPLACE TRIGGER "populate_session_hierarchy_trigger" BEFORE INSERT OR UPDATE ON "public"."practice_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."populate_session_hierarchy"();



CREATE OR REPLACE TRIGGER "questions_updated_at_trigger" BEFORE UPDATE ON "public"."questions" FOR EACH ROW EXECUTE FUNCTION "public"."update_questions_updated_at"();



CREATE OR REPLACE TRIGGER "trg_guard_subscription_tier" BEFORE UPDATE ON "public"."student_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_subscription_tier"();



CREATE OR REPLACE TRIGGER "trg_prevent_unlink_with_active_subscription" BEFORE DELETE ON "public"."parent_student_links" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_unlink_with_active_subscription"();



CREATE OR REPLACE TRIGGER "trg_sync_subscription_tier" AFTER INSERT OR DELETE OR UPDATE ON "public"."child_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_subscription_tier_to_profile"();



CREATE OR REPLACE TRIGGER "update_announcements_updated_at" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_child_subscriptions_updated_at" BEFORE UPDATE ON "public"."child_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_daily_statuses_updated_at" BEFORE UPDATE ON "public"."daily_statuses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_grade_levels_updated_at" BEFORE UPDATE ON "public"."grade_levels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_owned_pets_updated_at" BEFORE UPDATE ON "public"."owned_pets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_parent_profiles_updated_at" BEFORE UPDATE ON "public"."parent_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_pets_updated_at" BEFORE UPDATE ON "public"."pets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_streak_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."daily_statuses" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_student_streak"();



CREATE OR REPLACE TRIGGER "update_student_profiles_updated_at" BEFORE UPDATE ON "public"."student_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_subjects_updated_at" BEFORE UPDATE ON "public"."subjects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_topics_updated_at" BEFORE UPDATE ON "public"."sub_topics" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."announcement_reads"
    ADD CONSTRAINT "announcement_reads_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_reads"
    ADD CONSTRAINT "announcement_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."child_subscriptions"
    ADD CONSTRAINT "child_subscriptions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."child_subscriptions"
    ADD CONSTRAINT "child_subscriptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_statuses"
    ADD CONSTRAINT "daily_statuses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."owned_pets"
    ADD CONSTRAINT "owned_pets_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."owned_pets"
    ADD CONSTRAINT "owned_pets_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_profiles"
    ADD CONSTRAINT "parent_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_student_invitations"
    ADD CONSTRAINT "parent_student_invitations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_student_invitations"
    ADD CONSTRAINT "parent_student_invitations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_history"
    ADD CONSTRAINT "payment_history_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_history"
    ADD CONSTRAINT "payment_history_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."practice_answers"
    ADD CONSTRAINT "practice_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."practice_answers"
    ADD CONSTRAINT "practice_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_sessions"
    ADD CONSTRAINT "practice_sessions_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "public"."grade_levels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_sessions"
    ADD CONSTRAINT "practice_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_sessions"
    ADD CONSTRAINT "practice_sessions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_sessions"
    ADD CONSTRAINT "practice_sessions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."sub_topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_feedback"
    ADD CONSTRAINT "question_feedback_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_feedback"
    ADD CONSTRAINT "question_feedback_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "public"."grade_levels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."sub_topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_questions"
    ADD CONSTRAINT "session_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_questions"
    ADD CONSTRAINT "session_questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "public"."grade_levels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_selected_pet_id_fkey" FOREIGN KEY ("selected_pet_id") REFERENCES "public"."pets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_question_progress"
    ADD CONSTRAINT "student_question_progress_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_question_progress"
    ADD CONSTRAINT "student_question_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_question_progress"
    ADD CONSTRAINT "student_question_progress_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."sub_topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sub_topics"
    ADD CONSTRAINT "sub_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "public"."grade_levels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_leaderboard_rewards"
    ADD CONSTRAINT "weekly_leaderboard_rewards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete announcements" ON "public"."announcements" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can delete feedback" ON "public"."question_feedback" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can delete grade levels" ON "public"."grade_levels" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can delete pets" ON "public"."pets" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can delete questions" ON "public"."questions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can delete subjects" ON "public"."subjects" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can delete subscription plans" ON "public"."subscription_plans" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can delete topics" ON "public"."sub_topics" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can insert announcements" ON "public"."announcements" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can insert grade levels" ON "public"."grade_levels" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can insert pets" ON "public"."pets" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can insert questions" ON "public"."questions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can insert subjects" ON "public"."subjects" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can insert subscription plans" ON "public"."subscription_plans" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can insert topics" ON "public"."sub_topics" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can update announcements" ON "public"."announcements" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can update feedback" ON "public"."question_feedback" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can update grade levels" ON "public"."grade_levels" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can update pets" ON "public"."pets" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can update questions" ON "public"."questions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can update subjects" ON "public"."subjects" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can update subscription plans" ON "public"."subscription_plans" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Admins can update topics" ON "public"."sub_topics" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "All authenticated users can view student profiles" ON "public"."student_profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow admin delete on topics" ON "public"."topics" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Allow admin insert on topics" ON "public"."topics" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Allow admin update on topics" ON "public"."topics" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))));



CREATE POLICY "Allow payment history read access" ON "public"."payment_history" FOR SELECT USING ((("parent_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type"))))));



CREATE POLICY "Allow public read access to topics" ON "public"."topics" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can create feedback" ON "public"."question_feedback" FOR INSERT TO "authenticated" WITH CHECK (("reported_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Authenticated users can read weekly rewards" ON "public"."weekly_leaderboard_rewards" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view relevant announcements" ON "public"."announcements" FOR SELECT TO "authenticated" USING (((("expires_at" IS NULL) OR ("expires_at" > "now"())) AND ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type")))) OR ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'student'::"public"."user_type")))) AND ("target_audience" = ANY (ARRAY['all'::"public"."announcement_audience", 'students_only'::"public"."announcement_audience"]))) OR ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'parent'::"public"."user_type")))) AND ("target_audience" = ANY (ARRAY['all'::"public"."announcement_audience", 'parents_only'::"public"."announcement_audience"]))))));



CREATE POLICY "Grade levels are viewable by everyone" ON "public"."grade_levels" FOR SELECT USING (true);



CREATE POLICY "Parents can insert own parent profile" ON "public"."parent_profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Parents can update own profile" ON "public"."parent_profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Pets are viewable by everyone" ON "public"."pets" FOR SELECT USING (true);



CREATE POLICY "Public profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Questions are viewable by everyone" ON "public"."questions" FOR SELECT USING (true);



CREATE POLICY "Service role has full access to question progress" ON "public"."student_question_progress" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Students can add own pets" ON "public"."owned_pets" FOR INSERT TO "authenticated" WITH CHECK (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Students can create own answers" ON "public"."practice_answers" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."practice_sessions"
  WHERE (("practice_sessions"."id" = "practice_answers"."session_id") AND ("practice_sessions"."student_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Students can create own daily statuses" ON "public"."daily_statuses" FOR INSERT TO "authenticated" WITH CHECK (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Students can create own session questions" ON "public"."session_questions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."practice_sessions"
  WHERE (("practice_sessions"."id" = "session_questions"."session_id") AND ("practice_sessions"."student_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Students can create own sessions" ON "public"."practice_sessions" FOR INSERT TO "authenticated" WITH CHECK (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Students can insert own question progress" ON "public"."student_question_progress" FOR INSERT TO "authenticated" WITH CHECK (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Students can insert own student profile" ON "public"."student_profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Students can read own question progress" ON "public"."student_question_progress" FOR SELECT TO "authenticated" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Students can update own answers" ON "public"."practice_answers" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."practice_sessions"
  WHERE (("practice_sessions"."id" = "practice_answers"."session_id") AND ("practice_sessions"."student_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Students can update own daily statuses" ON "public"."daily_statuses" FOR UPDATE TO "authenticated" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Students can update own pets" ON "public"."owned_pets" FOR UPDATE TO "authenticated" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Students can update own profile" ON "public"."student_profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Students can update own question progress" ON "public"."student_question_progress" FOR UPDATE TO "authenticated" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Students can update own rewards" ON "public"."weekly_leaderboard_rewards" FOR UPDATE TO "authenticated" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Students can update own sessions" ON "public"."practice_sessions" FOR UPDATE TO "authenticated" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Subjects are viewable by everyone" ON "public"."subjects" FOR SELECT USING (true);



CREATE POLICY "Subscription plans are viewable by everyone" ON "public"."subscription_plans" FOR SELECT USING (true);



CREATE POLICY "Topics are viewable by everyone" ON "public"."sub_topics" FOR SELECT USING (true);



CREATE POLICY "Users can create invitations" ON "public"."parent_student_invitations" FOR INSERT TO "authenticated" WITH CHECK ((("parent_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("student_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can create links when accepting invitation" ON "public"."parent_student_links" FOR INSERT TO "authenticated" WITH CHECK ((("parent_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("student_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can delete own links" ON "public"."parent_student_links" FOR DELETE TO "authenticated" USING ((("parent_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("student_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can mark announcements as read" ON "public"."announcement_reads" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update own invitations" ON "public"."parent_student_invitations" FOR UPDATE TO "authenticated" USING ((("parent_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("student_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view own announcement read status" ON "public"."announcement_reads" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view own invitations" ON "public"."parent_student_invitations" FOR SELECT TO "authenticated" USING ((("parent_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("student_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can view own links" ON "public"."parent_student_links" FOR SELECT TO "authenticated" USING ((("parent_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type"))))));



CREATE POLICY "Users can view relevant daily statuses" ON "public"."daily_statuses" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."parent_student_links"
  WHERE (("parent_student_links"."parent_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("parent_student_links"."student_id" = "daily_statuses"."student_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type"))))));



CREATE POLICY "Users can view relevant feedback" ON "public"."question_feedback" FOR SELECT TO "authenticated" USING ((("reported_by" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type"))))));



CREATE POLICY "Users can view relevant parent profiles" ON "public"."parent_profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type"))))));



CREATE POLICY "Users can view relevant pets" ON "public"."owned_pets" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."parent_student_links"
  WHERE (("parent_student_links"."parent_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("parent_student_links"."student_id" = "owned_pets"."student_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type"))))));



CREATE POLICY "Users can view relevant practice answers" ON "public"."practice_answers" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."practice_sessions"
  WHERE (("practice_sessions"."id" = "practice_answers"."session_id") AND ("practice_sessions"."student_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."practice_sessions" "ps"
     JOIN "public"."parent_student_links" "psl" ON (("ps"."student_id" = "psl"."student_id")))
  WHERE (("ps"."id" = "practice_answers"."session_id") AND ("psl"."parent_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type"))))));



CREATE POLICY "Users can view relevant practice sessions" ON "public"."practice_sessions" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."parent_student_links"
  WHERE (("parent_student_links"."parent_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("parent_student_links"."student_id" = "practice_sessions"."student_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type"))))));



CREATE POLICY "Users can view relevant session questions" ON "public"."session_questions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."practice_sessions"
  WHERE (("practice_sessions"."id" = "session_questions"."session_id") AND ("practice_sessions"."student_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."practice_sessions" "ps"
     JOIN "public"."parent_student_links" "psl" ON (("ps"."student_id" = "psl"."student_id")))
  WHERE (("ps"."id" = "session_questions"."session_id") AND ("psl"."parent_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type"))))));



CREATE POLICY "Users can view relevant subscriptions" ON "public"."child_subscriptions" FOR SELECT TO "authenticated" USING ((("parent_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."user_type" = 'admin'::"public"."user_type"))))));



ALTER TABLE "public"."announcement_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."child_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_statuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grade_levels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."owned_pets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_student_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_student_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."practice_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."practice_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."processed_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."question_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_question_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sub_topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subjects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_leaderboard_rewards" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."_weekly_leaderboard_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."_weekly_leaderboard_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_weekly_leaderboard_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_parent_student_invitation"("p_invitation_id" "uuid", "p_accepting_user_id" "uuid", "p_is_parent" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."accept_parent_student_invitation"("p_invitation_id" "uuid", "p_accepting_user_id" "uuid", "p_is_parent" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_parent_student_invitation"("p_invitation_id" "uuid", "p_accepting_user_id" "uuid", "p_is_parent" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_mark_practiced_on_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_mark_practiced_on_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_mark_practiced_on_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_display_streak"("p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_display_streak"("p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_display_streak"("p_student_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."combine_pets"("p_student_id" "uuid", "p_owned_pet_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."combine_pets"("p_student_id" "uuid", "p_owned_pet_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."combine_pets"("p_student_id" "uuid", "p_owned_pet_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_practice_session"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_practice_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_practice_session"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_practice_session"("p_student_id" "uuid", "p_topic_id" "uuid", "p_grade_level_id" "uuid", "p_subject_id" "uuid", "p_questions" "jsonb", "p_cycle_number" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_practice_session"("p_student_id" "uuid", "p_topic_id" "uuid", "p_grade_level_id" "uuid", "p_subject_id" "uuid", "p_questions" "jsonb", "p_cycle_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_practice_session"("p_student_id" "uuid", "p_topic_id" "uuid", "p_grade_level_id" "uuid", "p_subject_id" "uuid", "p_questions" "jsonb", "p_cycle_number" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_user_profile"("p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_user_type" "text", "p_date_of_birth" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."create_user_profile"("p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_user_type" "text", "p_date_of_birth" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_profile"("p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_user_type" "text", "p_date_of_birth" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."distribute_weekly_leaderboard_rewards"() TO "anon";
GRANT ALL ON FUNCTION "public"."distribute_weekly_leaderboard_rewards"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."distribute_weekly_leaderboard_rewards"() TO "service_role";



GRANT ALL ON FUNCTION "public"."evolve_pet"("p_owned_pet_id" "uuid", "p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."evolve_pet"("p_owned_pet_id" "uuid", "p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."evolve_pet"("p_owned_pet_id" "uuid", "p_student_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."exchange_coins_for_food"("p_food_amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."exchange_coins_for_food"("p_food_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exchange_coins_for_food"("p_food_amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."feed_pet_for_evolution"("p_owned_pet_id" "uuid", "p_student_id" "uuid", "p_food_amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."feed_pet_for_evolution"("p_owned_pet_id" "uuid", "p_student_id" "uuid", "p_food_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."feed_pet_for_evolution"("p_owned_pet_id" "uuid", "p_student_id" "uuid", "p_food_amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gacha_multi_pull"() TO "anon";
GRANT ALL ON FUNCTION "public"."gacha_multi_pull"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gacha_multi_pull"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gacha_pull"() TO "anon";
GRANT ALL ON FUNCTION "public"."gacha_pull"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gacha_pull"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_question_statistics"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_question_statistics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_question_statistics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_profile_for_dialog"("p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_profile_for_dialog"("p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_profile_for_dialog"("p_student_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_streak"("p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_streak"("p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_streak"("p_student_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tier_from_stripe_price"("p_price_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tier_from_stripe_price"("p_price_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tier_from_stripe_price"("p_price_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_announcement_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_announcement_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_announcement_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_subscription_tier"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_subscription_tier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_subscription_tier"() TO "service_role";



GRANT ALL ON FUNCTION "public"."initial_pet_draw"() TO "anon";
GRANT ALL ON FUNCTION "public"."initial_pet_draw"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."initial_pet_draw"() TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_question_hierarchy"() TO "anon";
GRANT ALL ON FUNCTION "public"."populate_question_hierarchy"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_question_hierarchy"() TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_session_hierarchy"() TO "anon";
GRANT ALL ON FUNCTION "public"."populate_session_hierarchy"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_session_hierarchy"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_unlink_with_active_subscription"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_unlink_with_active_subscription"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_unlink_with_active_subscription"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_spin_reward"("p_daily_status_id" "uuid", "p_student_id" "uuid", "p_reward" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."record_spin_reward"("p_daily_status_id" "uuid", "p_student_id" "uuid", "p_reward" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_spin_reward"("p_daily_status_id" "uuid", "p_student_id" "uuid", "p_reward" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_question_statistics"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_question_statistics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_question_statistics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_subscription_tier_to_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_subscription_tier_to_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_subscription_tier_to_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_student_streak"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_student_streak"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_student_streak"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_questions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_questions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_questions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_session_correct_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_session_correct_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_session_correct_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_student_streak"("p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_student_streak"("p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_student_streak"("p_student_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."announcement_reads" TO "anon";
GRANT ALL ON TABLE "public"."announcement_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_reads" TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."child_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."child_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."child_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."daily_statuses" TO "anon";
GRANT ALL ON TABLE "public"."daily_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_statuses" TO "service_role";



GRANT ALL ON TABLE "public"."grade_levels" TO "anon";
GRANT ALL ON TABLE "public"."grade_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."grade_levels" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."student_profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."student_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."student_profiles" TO "service_role";



GRANT UPDATE("grade_level_id") ON TABLE "public"."student_profiles" TO "authenticated";



GRANT UPDATE("selected_pet_id") ON TABLE "public"."student_profiles" TO "authenticated";



GRANT UPDATE("preferred_language") ON TABLE "public"."student_profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."owned_pets" TO "anon";
GRANT ALL ON TABLE "public"."owned_pets" TO "authenticated";
GRANT ALL ON TABLE "public"."owned_pets" TO "service_role";



GRANT ALL ON TABLE "public"."parent_profiles" TO "anon";
GRANT ALL ON TABLE "public"."parent_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."parent_student_invitations" TO "anon";
GRANT ALL ON TABLE "public"."parent_student_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_student_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."parent_student_links" TO "anon";
GRANT ALL ON TABLE "public"."parent_student_links" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_student_links" TO "service_role";



GRANT ALL ON TABLE "public"."payment_history" TO "anon";
GRANT ALL ON TABLE "public"."payment_history" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_history" TO "service_role";



GRANT ALL ON TABLE "public"."pets" TO "anon";
GRANT ALL ON TABLE "public"."pets" TO "authenticated";
GRANT ALL ON TABLE "public"."pets" TO "service_role";



GRANT ALL ON TABLE "public"."practice_answers" TO "anon";
GRANT ALL ON TABLE "public"."practice_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_answers" TO "service_role";



GRANT ALL ON TABLE "public"."practice_sessions" TO "anon";
GRANT ALL ON TABLE "public"."practice_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."processed_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."processed_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."processed_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."question_feedback" TO "anon";
GRANT ALL ON TABLE "public"."question_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."question_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";



GRANT ALL ON TABLE "public"."question_statistics" TO "service_role";



GRANT ALL ON TABLE "public"."session_questions" TO "anon";
GRANT ALL ON TABLE "public"."session_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."session_questions" TO "service_role";



GRANT ALL ON TABLE "public"."student_question_progress" TO "anon";
GRANT ALL ON TABLE "public"."student_question_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."student_question_progress" TO "service_role";



GRANT ALL ON TABLE "public"."sub_topics" TO "anon";
GRANT ALL ON TABLE "public"."sub_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."sub_topics" TO "service_role";



GRANT ALL ON TABLE "public"."subjects" TO "anon";
GRANT ALL ON TABLE "public"."subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."subjects" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."topics" TO "anon";
GRANT ALL ON TABLE "public"."topics" TO "authenticated";
GRANT ALL ON TABLE "public"."topics" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."weekly_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_leaderboard_rewards" TO "anon";
GRANT ALL ON TABLE "public"."weekly_leaderboard_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_leaderboard_rewards" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

revoke update on table "public"."student_profiles" from "authenticated";


  create policy "Admins can delete announcement images"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'announcement-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can delete curriculum images"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'curriculum-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can delete option images"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'option-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can delete pet images"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'pet-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can delete question images"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'question-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can update announcement images"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'announcement-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can update curriculum images"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'curriculum-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can update option images"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'option-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can update pet images"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'pet-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can update question images"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'question-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can upload announcement images"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'announcement-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can upload curriculum images"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'curriculum-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can upload option images"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'option-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can upload pet images"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'pet-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Admins can upload question images"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'question-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::public.user_type))))));



  create policy "Announcement images are publicly accessible"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'announcement-images'::text));



  create policy "Avatars are publicly accessible"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'avatars'::text));



  create policy "Curriculum images are publicly accessible"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'curriculum-images'::text));



  create policy "Option images are publicly accessible"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'option-images'::text));



  create policy "Pet images are publicly accessible"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'pet-images'::text));



  create policy "Question images are publicly accessible"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'question-images'::text));



  create policy "Users can delete own avatar"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can update own avatar"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload own avatar"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


-- Fix grants to match prod
GRANT UPDATE("grade_level_id") ON TABLE "public"."student_profiles" TO "authenticated";
GRANT UPDATE("selected_pet_id") ON TABLE "public"."student_profiles" TO "authenticated";
GRANT UPDATE("preferred_language") ON TABLE "public"."student_profiles" TO "authenticated";

REVOKE ALL ON TABLE "public"."leaderboard" FROM "anon";
REVOKE ALL ON TABLE "public"."question_statistics" FROM "anon";
REVOKE ALL ON TABLE "public"."question_statistics" FROM "authenticated";

-- Enable PostgREST aggregate functions
ALTER ROLE authenticator SET pgrst.db_aggregates_enabled = 'true';
NOTIFY pgrst, 'reload config';
