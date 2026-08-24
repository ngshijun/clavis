-- ============================================================
-- Clavis 2.0 revamp — P15c: practice is submitted at the end,
-- nothing is written while it is in progress.
--
-- Before: create_practice_session() wrote the session, its frozen
-- question set and the progress rows the moment practice started;
-- each answer was inserted as it was given; complete_practice_session()
-- closed the row. An abandoned attempt left a half-finished session
-- behind, and answers could not be revised once given.
--
-- After: the attempt lives entirely in the browser until the student
-- submits. One definer function then writes the session, its questions,
-- the progress rows, every answer and the completion in a single
-- transaction. An abandoned attempt leaves no trace at all.
--
-- Two consequences follow:
--   * Question content can no longer be fetched by session id (there is
--     no session yet), so get_practice_questions(uuid[]) serves the same
--     sanitized shape keyed on the ids the client picked. It exposes
--     nothing new — every column it returns is already SELECTable by
--     `authenticated` on `questions`; the revoked key columns (answer,
--     option_N_is_correct, option_N_tip) are absent here exactly as they
--     are in get_practice_session_questions.
--   * The client no longer writes practice_answers or practice_sessions
--     at all, so those grants are revoked. Every practice write is now
--     definer-owned.
--
-- get_practice_session_questions(uuid) is KEPT: the post-completion
-- review page still reads a stored session by id.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Sanitized question content by id
--
-- Mirrors get_practice_session_questions' item shape exactly, so
-- `parsePracticeQuestions` consumes both without branching. Order
-- follows the caller's array (WITH ORDINALITY), which is the shuffled
-- order the student will see and the order frozen at submit.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_practice_questions(p_question_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      (ids.ord - 1)::int AS question_order,
      jsonb_build_object(
        'question_id', q.id,
        'question_order', (ids.ord - 1)::int,
        'type', q.type::text,
        'question', q.question,
        'image_path', q.image_path,
        'sub_topic_id', q.sub_topic_id,
        'subject_id', q.subject_id,
        'grade_level_id', q.grade_level_id,
        'options', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'number', o.opt_number,
                'text', o.opt_text,
                'image_path', o.opt_image
              )
              ORDER BY o.opt_number
            ),
            '[]'::jsonb
          )
          FROM (
            VALUES
              (1, q.option_1_text, q.option_1_image_path),
              (2, q.option_2_text, q.option_2_image_path),
              (3, q.option_3_text, q.option_3_image_path),
              (4, q.option_4_text, q.option_4_image_path)
          ) AS o(opt_number, opt_text, opt_image)
          WHERE btrim(COALESCE(o.opt_text, '')) <> '' OR o.opt_image IS NOT NULL
        )
      ) AS item
    FROM unnest(p_question_ids) WITH ORDINALITY AS ids(question_id, ord)
    JOIN questions q ON q.id = ids.question_id
  ) x;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_practice_questions(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_practice_questions(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_practice_questions(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_practice_questions(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_practice_questions(uuid[]) TO service_role;

COMMENT ON FUNCTION public.get_practice_questions(uuid[]) IS
  'Sanitized practice content for an in-browser attempt that has no session row yet. Same item shape as get_practice_session_questions, ordered by the caller''s array. Never returns answer, option_N_is_correct or option_N_tip.';

-- ------------------------------------------------------------
-- 2. Submit a whole practice attempt in one transaction
--
-- p_answers is the full attempt, one entry per question presented, in
-- display order:
--   [{ question_id, selected_options: int[]|null,
--      text_answer: text|null, time_spent_seconds: int|null }, ...]
--
-- total_questions is the length of that array, so a score can never
-- exceed 100% however the client slices the payload. is_correct is set
-- by the existing trg_grade_practice_answer BEFORE INSERT trigger — the
-- placeholder false written here is always overwritten.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_practice_session(
  p_sub_topic_id uuid,
  p_cycle_number integer,
  p_answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid := (SELECT auth.uid());
  v_session_id uuid;
  v_grade_level_id uuid;
  v_subject_id uuid;
  v_total_questions int;
  v_distinct_questions int;
  v_matching_questions int;
  v_correct_count int;
  v_total_time_seconds int;
  v_score_percent int;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Sessions are a student-only domain: a staff caller would fail the
  -- student_sub_topic_stats FK below, so refuse up front.
  IF NOT EXISTS (SELECT 1 FROM student_profiles WHERE id = v_student_id) THEN
    RAISE EXCEPTION 'Only students can submit practice sessions';
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'Answers must be a json array';
  END IF;

  v_total_questions := jsonb_array_length(p_answers);

  IF v_total_questions = 0 THEN
    RAISE EXCEPTION 'Answers array cannot be empty';
  END IF;

  -- Resolve the curriculum ancestry server-side rather than trusting the
  -- client's copy: sub_topic -> topic -> subject -> grade_level.
  SELECT s.id, s.grade_level_id
  INTO v_subject_id, v_grade_level_id
  FROM sub_topics st
  JOIN topics t ON t.id = st.topic_id
  JOIN subjects s ON s.id = t.subject_id
  WHERE st.id = p_sub_topic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub-topic not found: %', p_sub_topic_id;
  END IF;

  -- Every answered question must be a distinct question of THIS sub-topic.
  -- Without this a client could submit another sub-topic's questions (or the
  -- same question repeatedly) and steer the stats row it lands in.
  SELECT
    COUNT(DISTINCT (a->>'question_id')::uuid)
  INTO v_distinct_questions
  FROM jsonb_array_elements(p_answers) AS a;

  IF v_distinct_questions <> v_total_questions THEN
    RAISE EXCEPTION 'Answers contain duplicate questions';
  END IF;

  SELECT COUNT(*)
  INTO v_matching_questions
  FROM jsonb_array_elements(p_answers) AS a
  JOIN questions q ON q.id = (a->>'question_id')::uuid
  WHERE q.sub_topic_id = p_sub_topic_id;

  IF v_matching_questions <> v_total_questions THEN
    RAISE EXCEPTION 'Answers reference questions outside sub-topic %', p_sub_topic_id;
  END IF;

  INSERT INTO practice_sessions (
    student_id,
    sub_topic_id,
    grade_level_id,
    subject_id,
    total_questions,
    correct_count
  )
  VALUES (
    v_student_id,
    p_sub_topic_id,
    v_grade_level_id,
    v_subject_id,
    v_total_questions,
    0
  )
  RETURNING id INTO v_session_id;

  INSERT INTO session_questions (session_id, question_id, question_order)
  SELECT
    v_session_id,
    (a.value->>'question_id')::uuid,
    (a.ordinality - 1)::int
  FROM jsonb_array_elements(p_answers) WITH ORDINALITY AS a(value, ordinality);

  INSERT INTO student_question_progress (student_id, sub_topic_id, question_id, cycle_number)
  SELECT
    v_student_id,
    p_sub_topic_id,
    (a->>'question_id')::uuid,
    p_cycle_number
  FROM jsonb_array_elements(p_answers) AS a
  ON CONFLICT (student_id, sub_topic_id, question_id, cycle_number) DO NOTHING;

  -- is_correct is a placeholder: trg_grade_practice_answer overwrites it
  -- from the answer key before the row lands.
  INSERT INTO practice_answers (
    session_id,
    question_id,
    selected_options,
    text_answer,
    is_correct,
    time_spent_seconds
  )
  SELECT
    v_session_id,
    (a->>'question_id')::uuid,
    CASE
      WHEN jsonb_typeof(a->'selected_options') = 'array'
        AND jsonb_array_length(a->'selected_options') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(a->'selected_options')::int)
      ELSE NULL
    END,
    NULLIF(btrim(COALESCE(a->>'text_answer', '')), ''),
    FALSE,
    NULLIF(a->>'time_spent_seconds', '')::int
  FROM jsonb_array_elements(p_answers) AS a;

  SELECT
    COUNT(*) FILTER (WHERE is_correct = TRUE),
    COALESCE(SUM(time_spent_seconds), 0)
  INTO v_correct_count, v_total_time_seconds
  FROM practice_answers
  WHERE session_id = v_session_id;

  UPDATE practice_sessions
  SET
    completed_at = NOW(),
    total_time_seconds = v_total_time_seconds,
    correct_count = v_correct_count
  WHERE id = v_session_id;

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
  VALUES (v_student_id, p_sub_topic_id, v_score_percent, 1, NOW())
  ON CONFLICT (student_id, sub_topic_id) DO UPDATE
  SET
    best_score_percent = GREATEST(s.best_score_percent, EXCLUDED.best_score_percent),
    sessions_completed = s.sessions_completed + 1,
    last_completed_at = EXCLUDED.last_completed_at;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'correct_count', v_correct_count,
    'total', v_total_questions
  );
END;
$$;

ALTER FUNCTION public.submit_practice_session(uuid, integer, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_practice_session(uuid, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_practice_session(uuid, integer, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_practice_session(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_practice_session(uuid, integer, jsonb) TO service_role;

COMMENT ON FUNCTION public.submit_practice_session(uuid, integer, jsonb) IS
  'Writes a finished practice attempt — session, frozen question set, cycle progress, every answer and the completion — in one transaction. The only way a practice session is created; nothing is stored while an attempt is in progress.';

-- ------------------------------------------------------------
-- 3. Retire the start/complete pair
-- ------------------------------------------------------------
DROP FUNCTION public.create_practice_session(uuid, uuid, uuid, uuid, jsonb, integer);
DROP FUNCTION public.complete_practice_session(uuid);

-- ------------------------------------------------------------
-- 4. Retire the in-progress cursor
--
-- Nothing resumes a practice session any more, so the column and the
-- client's UPDATE grant on it both go. (attempts.current_question_index
-- is a different column and is untouched — assessments still resume.)
-- ------------------------------------------------------------
ALTER TABLE public.practice_sessions DROP COLUMN current_question_index;

-- ------------------------------------------------------------
-- 5. Practice writes are definer-only now
--
-- The client used to INSERT practice_answers and UPDATE practice_sessions
-- directly. submit_practice_session owns both, so the grants and the
-- answer INSERT policy that guarded them are removed. SELECT is kept —
-- the review page reads its own session and answers.
-- ------------------------------------------------------------
DROP POLICY "Students can create own answers" ON public.practice_answers;

-- Both were granted per-column (20260405071125), so the columns are named
-- explicitly as well as the table — a table-level REVOKE is not guaranteed
-- to clear column-level grants.
REVOKE INSERT ON TABLE public.practice_answers FROM authenticated;
REVOKE UPDATE (selected_options, text_answer, time_spent_seconds, answered_at)
  ON TABLE public.practice_answers FROM authenticated;
REVOKE UPDATE ON TABLE public.practice_answers FROM authenticated;

REVOKE UPDATE (completed_at, total_time_seconds, correct_count)
  ON TABLE public.practice_sessions FROM authenticated;
REVOKE UPDATE ON TABLE public.practice_sessions FROM authenticated;
