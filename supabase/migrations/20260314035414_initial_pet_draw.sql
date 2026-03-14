-- Free starter pet draw for first-time students
-- Always gives Cloud Bunny, no coin cost, idempotent via UPSERT
CREATE OR REPLACE FUNCTION public.initial_pet_draw()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- Guard: only allow if student has no pets yet (prevents abuse via devtools/API)
  IF EXISTS (SELECT 1 FROM owned_pets WHERE student_id = v_student_id) THEN
    RAISE EXCEPTION 'Student already owns pets';
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

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.initial_pet_draw() TO authenticated;
