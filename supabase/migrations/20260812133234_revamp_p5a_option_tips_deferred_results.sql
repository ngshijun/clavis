-- ============================================================
-- Clavis 2.1 revamp — P5a: per-option tips + deferred practice results
--
-- Two locked decisions (PLAN.md 39, 41):
--
--   39. Per-option tips REPLACE questions.explanation. Drop the single
--       explanation column; add option_1_tip .. option_4_tip (nullable).
--       Tips are per MCQ/MRQ option and explain why a WRONG option is
--       wrong. Short-answer has no options, so it carries no tips. The
--       correct answer is NEVER revealed to a student — only the tip for
--       an option the student actually picked and got wrong.
--
--   41. Close the practice grading-oracle (folds in chip task_22874c33):
--       column-revoke practice_answers.is_correct from authenticated so a
--       student can never read correctness mid-session, and serve
--       post-completion correctness + wrong-option tips through a new
--       owner-only RPC get_session_result(). This mirrors the assessment
--       get_attempt_result() pattern exactly. The server-side grading
--       trigger and the practice-answer INSERT/UPDATE policies are
--       untouched — the client keeps writing answers, the DB keeps owning
--       is_correct.
--
-- Grading is UNAFFECTED by tips: grade_practice_answer() reads only
-- type/answer/option_N_is_correct, and question_statistics selects only
-- ids + practice_answers — neither ever referenced explanation, so no
-- recreate is needed (verified against the current definitions).
--
-- Migration is schema-only and applies to ALL envs. Prod keeps its real
-- questions (explanation dropped, tips NULL until admins fill them via the
-- P5b editor). The staging question-bank wipe + reseed is seed.sql only
-- (decision 44), NOT part of this migration.
-- ============================================================

-- ------------------------------------------------------------
-- 1. questions: drop explanation, add per-option tips (decision 39)
-- ------------------------------------------------------------
ALTER TABLE public.questions DROP COLUMN explanation;

ALTER TABLE public.questions
  ADD COLUMN option_1_tip text,
  ADD COLUMN option_2_tip text,
  ADD COLUMN option_3_tip text,
  ADD COLUMN option_4_tip text;

COMMENT ON COLUMN public.questions.option_1_tip IS
  'Hint shown after completion when a student wrongly selected option 1. Never reveals the correct answer. NULL = no tip.';
COMMENT ON COLUMN public.questions.option_2_tip IS
  'Hint shown after completion when a student wrongly selected option 2. Never reveals the correct answer. NULL = no tip.';
COMMENT ON COLUMN public.questions.option_3_tip IS
  'Hint shown after completion when a student wrongly selected option 3. Never reveals the correct answer. NULL = no tip.';
COMMENT ON COLUMN public.questions.option_4_tip IS
  'Hint shown after completion when a student wrongly selected option 4. Never reveals the correct answer. NULL = no tip.';

-- ------------------------------------------------------------
-- 2. practice_answers: revoke is_correct SELECT from authenticated
--    (decision 41 — close the grading oracle)
--
-- Current grant chain: remote_schema GRANT ALL -> lock_down narrowed
-- UPDATE to (selected_options, text_answer, time_spent_seconds,
-- answered_at). SELECT was still whole-table, so is_correct was readable
-- mid-session; combined with the (legitimate) revise/UPDATE policy that is
-- an unlimited brute-force path to 100%.
--
-- REVOKE SELECT ON TABLE drops the table-wide privilege AND any column
-- privileges, so the explicit list below (every column EXCEPT is_correct)
-- is the whole story afterwards. INSERT/UPDATE grants and the grading
-- trigger are untouched — the trigger owns is_correct on write.
--
-- Consequence for the client (P5c): select('*') and any write with
-- "Prefer: return=representation" over all columns now fail with
-- "permission denied for column is_correct" — columns must be named.
-- ------------------------------------------------------------
REVOKE SELECT ON TABLE public.practice_answers FROM authenticated;
GRANT SELECT (
  id,
  session_id,
  question_id,
  selected_options,
  text_answer,
  time_spent_seconds,
  answered_at
) ON TABLE public.practice_answers TO authenticated;

COMMENT ON COLUMN public.practice_answers.is_correct IS
  'Server-owned grade set by grade_practice_answer(). Not readable by authenticated (no column grant) — correctness is served by get_session_result() after completion only.';

-- ------------------------------------------------------------
-- 3. get_session_result(p_session_id) — deferred practice results
--    (decision 41 — the practice analogue of get_attempt_result)
--
-- Owner only (the student who owns the session), and only once the
-- session is completed. Returns, per question in question_order:
--   - question_order, type, is_correct
--   - the student's own answer (selected_options / text_answer)
--   - wrong_option_tips: for each MCQ/MRQ option the student SELECTED and
--     got wrong, { number, tip } (tip may be NULL if the author left it
--     blank). Options the student did NOT pick are never enumerated, so
--     the correct option is never revealed. Short-answer questions carry
--     no options and therefore an empty wrong_option_tips array.
--
-- {
--   "session_id": "uuid",
--   "student_id": "uuid",
--   "completed_at": "…",
--   "correct_count": 7, "total": 10, "score_percent": 70,
--   "questions": [
--     { "question_id": "uuid", "question_order": 1,
--       "type": "mcq" | "mrq" | "short_answer",
--       "is_correct": false,
--       "selected_options": [2, 3] | null,
--       "text_answer": "…" | null,
--       "wrong_option_tips": [ { "number": 2, "tip": "…" | null } ] }
--   ]
-- }
--
-- SECURITY DEFINER: it reads is_correct + the answer key, which the caller
-- may not read directly. It does its own owner + completion authorization.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_session_result(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_session practice_sessions%ROWTYPE;
  v_questions jsonb;
  v_score_percent integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_session
  FROM practice_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF v_session.student_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Not authorized to view this session result';
  END IF;

  IF v_session.completed_at IS NULL THEN
    RAISE EXCEPTION 'Results are available after the session is completed';
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_questions
  FROM (
    SELECT
      sq.question_order,
      jsonb_build_object(
        'question_id', q.id,
        'question_order', sq.question_order,
        'type', q.type,
        'is_correct', COALESCE(ans.is_correct, false),
        'selected_options', to_jsonb(ans.selected_options),
        'text_answer', ans.text_answer,
        'wrong_option_tips', CASE
          WHEN q.type IN ('mcq', 'mrq') AND ans.selected_options IS NOT NULL THEN (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object('number', o.opt_number, 'tip', o.opt_tip)
                ORDER BY o.opt_number
              ),
              '[]'::jsonb
            )
            FROM (
              VALUES
                (1, q.option_1_is_correct, q.option_1_tip),
                (2, q.option_2_is_correct, q.option_2_tip),
                (3, q.option_3_is_correct, q.option_3_tip),
                (4, q.option_4_is_correct, q.option_4_tip)
            ) AS o(opt_number, opt_is_correct, opt_tip)
            -- Only options the student actually PICKED and got WRONG.
            -- "wrong" = is_correct IS DISTINCT FROM TRUE (covers false and
            -- the NULL default on options 3/4). Correct picks are excluded
            -- so the answer key is never enumerated.
            WHERE o.opt_number = ANY (ans.selected_options)
              AND o.opt_is_correct IS DISTINCT FROM TRUE
          )
          ELSE '[]'::jsonb
        END
      ) AS item
    FROM session_questions sq
    JOIN questions q ON q.id = sq.question_id
    LEFT JOIN practice_answers ans
      ON ans.session_id = sq.session_id
     AND ans.question_id = sq.question_id
    WHERE sq.session_id = p_session_id
  ) x;

  v_score_percent := COALESCE(
    round((100.0 * v_session.correct_count) / NULLIF(v_session.total_questions, 0))::integer,
    0
  );

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'student_id', v_session.student_id,
    'completed_at', v_session.completed_at,
    'correct_count', v_session.correct_count,
    'total', v_session.total_questions,
    'score_percent', v_score_percent,
    'questions', v_questions
  );
END;
$$;

ALTER FUNCTION public.get_session_result(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_session_result(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_session_result(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_session_result(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_result(uuid) TO service_role;

COMMENT ON FUNCTION public.get_session_result(uuid) IS
  'Deferred practice results for one session (owner only, after completion). Returns per-question correctness, the student''s own answer, and tips for the wrong options the student picked. Never reveals the correct option or answer.';
