-- ============================================================
-- Practice server-side grading (CRITICAL)
--
-- The client computes practice_answers.is_correct and inserts it
-- directly (src/stores/practice.ts). complete_practice_session then
-- counts is_correct = TRUE rows to derive XP/coins, so a malicious
-- client could insert is_correct = true for every answer and farm
-- maximum rewards / inflate the leaderboard.
--
-- Fix: the database now OWNS is_correct. A BEFORE INSERT/UPDATE
-- trigger on practice_answers recomputes is_correct from the question
-- row (option_N_is_correct / answer), exactly mirroring the client's
-- grading logic so instant UI feedback stays consistent. The client
-- still sends is_correct for snappy UI, but the value is overwritten
-- server-side before the row is persisted.
--
-- Also: correct_count becomes server-owned. The redundant
-- update_session_correct_count AFTER INSERT trigger (which trusted the
-- same boolean) is removed; complete_practice_session remains the sole
-- writer that recomputes correct_count from the server-graded rows.
-- The authenticated UPDATE grant on practice_sessions.correct_count is
-- revoked so the client can no longer write it.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Server-side grading function + trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grade_practice_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_question RECORD;
  v_correct_options INTEGER[];
BEGIN
  -- Fetch the answer key for the answered question
  SELECT
    type,
    answer,
    option_1_is_correct,
    option_2_is_correct,
    option_3_is_correct,
    option_4_is_correct
  INTO v_question
  FROM public.questions
  WHERE id = NEW.question_id;

  -- If the question no longer exists (question_id is nullable / ON DELETE
  -- SET NULL), the answer cannot be graded as correct.
  IF v_question IS NULL THEN
    NEW.is_correct := FALSE;
    RETURN NEW;
  END IF;

  IF v_question.type = 'short_answer' THEN
    -- Case-insensitive, trimmed comparison (mirrors the client)
    NEW.is_correct := (
      v_question.answer IS NOT NULL
      AND NEW.text_answer IS NOT NULL
      AND lower(btrim(NEW.text_answer)) = lower(btrim(v_question.answer))
    );

  ELSIF v_question.type IN ('mcq', 'mrq') THEN
    -- Build the set of correct option numbers from the answer key
    v_correct_options := ARRAY(
      SELECT opt_num FROM (
        VALUES
          (1, v_question.option_1_is_correct),
          (2, v_question.option_2_is_correct),
          (3, v_question.option_3_is_correct),
          (4, v_question.option_4_is_correct)
      ) AS o(opt_num, is_correct)
      WHERE o.is_correct IS TRUE
      ORDER BY opt_num
    );

    -- Correct iff the selected option set equals the correct option set
    -- exactly (same members, no extras, no omissions). NULL selection
    -- never matches. Order-independent via sorted-array equality.
    NEW.is_correct := (
      NEW.selected_options IS NOT NULL
      AND ARRAY(SELECT DISTINCT unnest(NEW.selected_options) ORDER BY 1)
          = v_correct_options
    );

  ELSE
    NEW.is_correct := FALSE;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.grade_practice_answer() OWNER TO postgres;

-- Lock down EXECUTE: this is a trigger function, no role needs to call it directly.
REVOKE ALL ON FUNCTION public.grade_practice_answer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grade_practice_answer() FROM anon;
REVOKE ALL ON FUNCTION public.grade_practice_answer() FROM authenticated;

CREATE OR REPLACE TRIGGER trg_grade_practice_answer
  BEFORE INSERT OR UPDATE OF selected_options, text_answer, question_id, is_correct
  ON public.practice_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.grade_practice_answer();

-- ------------------------------------------------------------
-- 2. Make correct_count server-owned
-- ------------------------------------------------------------
-- Drop the redundant AFTER INSERT trigger that incremented correct_count
-- off the (formerly client-supplied) boolean. complete_practice_session
-- recomputes correct_count from the server-graded rows as the single
-- source of truth.
DROP TRIGGER IF EXISTS after_answer_insert_update_correct_count ON public.practice_answers;
DROP FUNCTION IF EXISTS public.update_session_correct_count();

-- Revoke the authenticated UPDATE grant on correct_count. The lock-down
-- migration granted UPDATE on (current_question_index, completed_at,
-- total_time_seconds, correct_count); re-grant without correct_count.
REVOKE UPDATE ON TABLE public.practice_sessions FROM authenticated;
GRANT UPDATE (current_question_index, completed_at, total_time_seconds)
  ON TABLE public.practice_sessions TO authenticated;
