-- ============================================================
-- Clavis 2.0 revamp — P2a part 1/2: topic_id -> sub_topic_id
--
-- Historical naming trap: `questions.topic_id`, `practice_sessions.topic_id`
-- and `student_question_progress.topic_id` all FK **sub_topics**, not
-- `topics`. The learning map (P2) makes the sub-topic the first-class
-- unit, so the columns are renamed to say what they actually reference.
--
-- `sub_topics.topic_id` is NOT renamed — it genuinely references `topics`.
--
-- ALTER TABLE ... RENAME COLUMN rewrites index/constraint *definitions*
-- automatically, but not their *names* nor the text bodies of plpgsql/sql
-- functions. Both are chased explicitly below.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------
ALTER TABLE public.questions
  RENAME COLUMN topic_id TO sub_topic_id;

ALTER TABLE public.practice_sessions
  RENAME COLUMN topic_id TO sub_topic_id;

ALTER TABLE public.student_question_progress
  RENAME COLUMN topic_id TO sub_topic_id;

-- ------------------------------------------------------------
-- 2. Constraint names that encode the old column name
-- ------------------------------------------------------------
ALTER TABLE public.questions
  RENAME CONSTRAINT questions_topic_id_fkey TO questions_sub_topic_id_fkey;

ALTER TABLE public.practice_sessions
  RENAME CONSTRAINT practice_sessions_topic_id_fkey TO practice_sessions_sub_topic_id_fkey;

ALTER TABLE public.student_question_progress
  RENAME CONSTRAINT student_question_progress_topic_id_fkey TO student_question_progress_sub_topic_id_fkey;

-- ------------------------------------------------------------
-- 3. Index names that encode the old column name
--    (student_question_progress_unique keeps its name — it does not.)
-- ------------------------------------------------------------
ALTER INDEX public.idx_questions_topic
  RENAME TO idx_questions_sub_topic;

ALTER INDEX public.idx_practice_sessions_topic
  RENAME TO idx_practice_sessions_sub_topic;

ALTER INDEX public.idx_student_question_progress_topic_id
  RENAME TO idx_student_question_progress_sub_topic_id;

-- ------------------------------------------------------------
-- 4. Stale comment on sub_topics
-- ------------------------------------------------------------
COMMENT ON TABLE public.sub_topics IS
  'Sub-topics within a topic. Questions, practice sessions and question progress reference sub_topics via their sub_topic_id column; sub_topics.topic_id references topics. display_order defines the learning-map order.';

-- ------------------------------------------------------------
-- 5. Trigger functions that read NEW.topic_id
--    (bodies are stored as text — the rename does not touch them)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.populate_question_hierarchy()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SELECT s.id, s.grade_level_id INTO NEW.subject_id, NEW.grade_level_id
  FROM public.sub_topics st
  JOIN public.topics t ON st.topic_id = t.id
  JOIN public.subjects s ON t.subject_id = s.id
  WHERE st.id = NEW.sub_topic_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.populate_session_hierarchy()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SELECT s.id, s.grade_level_id INTO NEW.subject_id, NEW.grade_level_id
  FROM public.sub_topics st
  JOIN public.topics t ON st.topic_id = t.id
  JOIN public.subjects s ON t.subject_id = s.id
  WHERE st.id = NEW.sub_topic_id;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 6. get_subtopic_answered_counts: body + result column renamed.
--    The result column is part of the public contract (generated
--    types), so it is renamed for consistency with the schema.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_subtopic_answered_counts();

CREATE FUNCTION public.get_subtopic_answered_counts()
RETURNS TABLE(sub_topic_id uuid, answered_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ps.sub_topic_id, count(DISTINCT pa.question_id) AS answered_count
  FROM public.practice_answers pa
  JOIN public.practice_sessions ps ON ps.id = pa.session_id
  WHERE ps.student_id = (SELECT auth.uid())
    AND pa.question_id IS NOT NULL
  GROUP BY ps.sub_topic_id;
$$;

ALTER FUNCTION public.get_subtopic_answered_counts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_subtopic_answered_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_subtopic_answered_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_subtopic_answered_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subtopic_answered_counts() TO service_role;

-- ------------------------------------------------------------
-- 7. create_practice_session: parameter and body renamed.
--    The old signature is dropped because the parameter name changes
--    (PostgREST calls RPCs with named arguments).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_practice_session(uuid, uuid, uuid, uuid, jsonb, integer);

CREATE FUNCTION public.create_practice_session(
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

  -- Preserve question order
  INSERT INTO session_questions (session_id, question_id, question_order)
  SELECT
    v_session_id,
    (q->>'question_id')::uuid,
    (q->>'question_order')::int
  FROM jsonb_array_elements(p_questions) AS q;

  -- Track which questions were used (cycle-based selection)
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

ALTER FUNCTION public.create_practice_session(uuid, uuid, uuid, uuid, jsonb, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_practice_session(uuid, uuid, uuid, uuid, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_practice_session(uuid, uuid, uuid, uuid, jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_practice_session(uuid, uuid, uuid, uuid, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_practice_session(uuid, uuid, uuid, uuid, jsonb, integer) TO service_role;
