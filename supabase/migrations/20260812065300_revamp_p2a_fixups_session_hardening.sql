-- P2a verifier fixups (orchestrator, 2026-08-12):
-- 1. complete_practice_session: row-lock the session so concurrent double-completion
--    cannot double-increment sessions_completed (TOCTOU on the completed_at guard).
-- 2. create_practice_session: only students (rows in student_profiles) may create
--    sessions — otherwise the stats upsert on completion hits an FK violation.
-- 3. practice_answers INSERT policy: answers must belong to the session's question
--    set, so correct_count can never exceed total_questions (score > 100 aborted
--    the completion transaction via the stats CHECK constraint).

-- ------------------------------------------------------------
-- 1 + FK guard consumer: complete_practice_session with FOR UPDATE
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_practice_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid;
  v_sub_topic_id uuid;
  v_completed_at timestamptz;
  v_total_questions integer;
  v_correct_count integer;
  v_total_time_seconds integer;
  v_score_percent integer;
BEGIN
  -- FOR UPDATE serializes concurrent completions of the same session; the
  -- second caller then fails the completed_at guard instead of double-counting.
  SELECT student_id, sub_topic_id, completed_at, total_questions
  INTO v_student_id, v_sub_topic_id, v_completed_at, v_total_questions
  FROM practice_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF v_student_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Cannot complete another student''s session';
  END IF;

  IF v_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Session already completed: %', p_session_id;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE is_correct = TRUE),
    COALESCE(SUM(time_spent_seconds), 0)
  INTO v_correct_count, v_total_time_seconds
  FROM practice_answers
  WHERE session_id = p_session_id;

  UPDATE practice_sessions
  SET
    completed_at = NOW(),
    total_time_seconds = v_total_time_seconds,
    correct_count = v_correct_count
  WHERE id = p_session_id;

  v_score_percent := COALESCE(
    round((100.0 * v_correct_count) / NULLIF(v_total_questions, 0))::integer,
    0
  );

  INSERT INTO student_sub_topic_stats AS s (
    student_id,
    sub_topic_id,
    best_score_percent,
    sessions_completed,
    last_completed_at
  )
  VALUES (v_student_id, v_sub_topic_id, v_score_percent, 1, NOW())
  ON CONFLICT (student_id, sub_topic_id) DO UPDATE
  SET
    best_score_percent = GREATEST(s.best_score_percent, EXCLUDED.best_score_percent),
    sessions_completed = s.sessions_completed + 1,
    last_completed_at = EXCLUDED.last_completed_at;

  RETURN jsonb_build_object(
    'correct_count', v_correct_count,
    'total', v_total_questions
  );
END;
$$;

-- ------------------------------------------------------------
-- 2. create_practice_session: students only
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_practice_session(
  p_student_id uuid,
  p_sub_topic_id uuid,
  p_grade_level_id uuid,
  p_subject_id uuid,
  p_questions jsonb,
  p_cycle_number integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session_id uuid;
  v_total_questions int;
BEGIN
  IF p_student_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Cannot create a practice session for another student';
  END IF;

  -- Sessions are a student-only domain: staff/admin callers would later fail
  -- the student_sub_topic_stats FK on completion, so refuse up front.
  IF NOT EXISTS (SELECT 1 FROM student_profiles WHERE id = p_student_id) THEN
    RAISE EXCEPTION 'Only students can create practice sessions';
  END IF;

  v_total_questions := jsonb_array_length(p_questions);

  IF v_total_questions = 0 THEN
    RAISE EXCEPTION 'Questions array cannot be empty';
  END IF;

  INSERT INTO practice_sessions (
    student_id,
    sub_topic_id,
    grade_level_id,
    subject_id,
    total_questions,
    current_question_index,
    correct_count
  )
  VALUES (
    p_student_id,
    p_sub_topic_id,
    p_grade_level_id,
    p_subject_id,
    v_total_questions,
    0,
    0
  )
  RETURNING id INTO v_session_id;

  INSERT INTO session_questions (session_id, question_id, question_order)
  SELECT
    v_session_id,
    (q->>'question_id')::uuid,
    (q->>'question_order')::int
  FROM jsonb_array_elements(p_questions) AS q;

  INSERT INTO student_question_progress (student_id, sub_topic_id, question_id, cycle_number)
  SELECT
    p_student_id,
    p_sub_topic_id,
    (q->>'question_id')::uuid,
    p_cycle_number
  FROM jsonb_array_elements(p_questions) AS q
  ON CONFLICT (student_id, sub_topic_id, question_id, cycle_number) DO NOTHING;

  RETURN v_session_id;
END;
$$;

-- ------------------------------------------------------------
-- 3. practice_answers INSERT: only questions in the session's set
-- ------------------------------------------------------------
DROP POLICY "Students can create own answers" ON public.practice_answers;

CREATE POLICY "Students can create own answers" ON public.practice_answers
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.practice_sessions ps
    WHERE ps.id = practice_answers.session_id
      AND ps.student_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public.session_questions sq
    WHERE sq.session_id = practice_answers.session_id
      AND sq.question_id = practice_answers.question_id
  )
);
