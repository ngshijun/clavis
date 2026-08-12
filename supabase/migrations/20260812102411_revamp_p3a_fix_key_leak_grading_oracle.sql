-- ============================================================
-- Clavis 2.0 revamp — P3a security fix: answer-key leak + grading oracle
--
-- A verifier proved two exploits against the P3a engine on a live cluster:
--
--   1. ANSWER-KEY LEAK. assessment_questions' SELECT policy let an assigned
--      student read the row from publish time onward, and payload carries
--      {answer, options[].is_correct, explanation}. The runner needed the
--      row to render, so the key travelled with it.
--   2. GRADING ORACLE. attempt_answers had a whole-table SELECT grant, so
--      the attempt owner could read the server-computed is_correct while
--      the attempt was still open; combined with the (legitimate) revise
--      policy that is an unlimited brute-force path to 100%.
--
-- Fix (PLAN.md decisions 32-33):
--   * students lose every direct read path to assessment_questions;
--     question content is served by the sanitizing RPC
--     get_attempt_questions(), which never emits a key;
--   * attempt_answers' table-wide SELECT grant becomes an explicit column
--     list without is_correct, so correctness is unreadable mid-attempt.
--     The revise (UPDATE) policy stays: with is_correct hidden it answers
--     nothing. Correctness is served by get_attempt_result(), which the
--     owner may call only after completion.
--
-- Both RPCs are SECURITY DEFINER (they read what the caller may not) and
-- do their own authorization; EXECUTE is granted to authenticated only.
-- ============================================================

-- ------------------------------------------------------------
-- 1. assessment_questions: staff/admin SELECT only (decision 32)
--
-- The table-level GRANT SELECT stays — it is RLS that decides which rows
-- a role sees, and staff still need the full row (key included) for the
-- builder and the results view. Writes are unchanged.
-- ------------------------------------------------------------
DROP POLICY "Read assessment questions: org staff, assigned students"
  ON public.assessment_questions;

CREATE POLICY "Read assessment questions: staff only"
  ON public.assessment_questions
  FOR SELECT
  TO authenticated
  USING (
    (SELECT app.is_admin())
    OR (
      (SELECT app.is_org_staff())
      AND app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    )
  );

COMMENT ON TABLE public.assessment_questions IS
  'Ordered questions of an assessment. Exactly one of question_id (global bank) or payload (ad-hoc) is set. Staff/admin read only — students receive sanitized content through get_attempt_questions().';

-- ------------------------------------------------------------
-- 2. attempt_answers: revoke is_correct from authenticated (decision 33)
--
-- REVOKE SELECT ON TABLE drops the table-wide privilege AND any column
-- privileges, so the explicit list below is the whole story afterwards.
-- INSERT/UPDATE column grants are untouched (is_correct was never in
-- them; the grading trigger owns it).
--
-- Consequence for the client: select('*') and any write with
-- "Prefer: return=representation" over all columns now fail with
-- "permission denied for column is_correct" — columns must be named.
-- ------------------------------------------------------------
REVOKE SELECT ON TABLE public.attempt_answers FROM authenticated;
GRANT SELECT (
  id,
  attempt_id,
  assessment_question_id,
  selected_options,
  text_answer,
  time_spent_seconds,
  answered_at
) ON TABLE public.attempt_answers TO authenticated;

COMMENT ON COLUMN public.attempt_answers.is_correct IS
  'Server-owned grade. Not readable by authenticated (no column grant) — correctness is served by get_attempt_result() only.';

-- ------------------------------------------------------------
-- 3. get_attempt_questions(p_attempt_id) — sanitized runner payload
--
-- Attempt owner only. Returns the frozen snapshot in question_order:
--
-- [
--   {
--     "assessment_question_id": "uuid",
--     "question_order": 1,
--     "points": 1,
--     "type": "mcq" | "mrq" | "short_answer",
--     "question": "display text",
--     "image_path": "storage/path.png" | null,
--     "options": [ { "number": 1, "text": "…", "image_path": null } ]
--   }
-- ]
--
-- Bank questions resolve from public.questions (text + images + option
-- text/images); ad-hoc questions resolve from the payload. Option
-- "number" is the 1-based ordinal the grader expects in
-- attempt_answers.selected_options in both cases. is_correct, answer,
-- explanation and the raw payload are never emitted.
--
-- Works while the attempt is open (runner) and after it is completed
-- (review) — the sanitized shape carries no key either way.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_attempt_questions(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_student_id uuid;
  v_result jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT student_id INTO v_student_id
  FROM assessment_attempts
  WHERE id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found: %', p_attempt_id;
  END IF;

  IF v_student_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Cannot read another student''s attempt';
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      atq.question_order,
      jsonb_build_object(
        'assessment_question_id', aq.id,
        'question_order', atq.question_order,
        'points', aq.points,
        'type', COALESCE(bank.type::text, aq.payload->>'type'),
        'question', COALESCE(bank.question, aq.payload->>'question'),
        'image_path', bank.image_path,
        'options', CASE
          WHEN bank.id IS NOT NULL THEN (
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
                (1, bank.option_1_text, bank.option_1_image_path),
                (2, bank.option_2_text, bank.option_2_image_path),
                (3, bank.option_3_text, bank.option_3_image_path),
                (4, bank.option_4_text, bank.option_4_image_path)
            ) AS o(opt_number, opt_text, opt_image)
            WHERE btrim(COALESCE(o.opt_text, '')) <> '' OR o.opt_image IS NOT NULL
          )
          ELSE (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'number', e.ord::integer,
                  'text', e.elem->>'text',
                  'image_path', NULL::text
                )
                ORDER BY e.ord
              ),
              '[]'::jsonb
            )
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(aq.payload->'options') = 'array' THEN aq.payload->'options'
                ELSE '[]'::jsonb
              END
            ) WITH ORDINALITY AS e(elem, ord)
            WHERE jsonb_typeof(e.elem) = 'object'
          )
        END
      ) AS item
    FROM attempt_questions atq
    JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
    LEFT JOIN questions bank ON bank.id = aq.question_id
    WHERE atq.attempt_id = p_attempt_id
  ) x;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_attempt_questions(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_attempt_questions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_attempt_questions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_attempt_questions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attempt_questions(uuid) TO service_role;

COMMENT ON FUNCTION public.get_attempt_questions(uuid) IS
  'Sanitized question snapshot for one attempt (owner only). Never emits is_correct, answer, explanation or the raw payload.';

-- ------------------------------------------------------------
-- 4. get_attempt_result(p_attempt_id) — correctness, gated
--
-- Attempt owner: allowed only once completed_at IS NOT NULL.
-- Org staff of the assessment's organization (and platform admin):
-- allowed at any time, and additionally see the student's given answer.
--
-- {
--   "attempt_id": "uuid",
--   "assessment_id": "uuid",
--   "student_id": "uuid",
--   "started_at": "…", "completed_at": "…" | null,
--   "correct_count": 9, "total_questions": 12, "score_percent": 75,
--   "questions": [
--     { "assessment_question_id": "uuid", "question_order": 1,
--       "points": 1, "is_correct": true,
--       -- staff only:
--       "selected_options": [2], "text_answer": null, "answered_at": "…" }
--   ]
-- }
--
-- The score fields are the stored attempt columns: they are only
-- meaningful after completion (a staff peek at an open attempt sees
-- zeros with live per-question correctness).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_attempt_result(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_attempt assessment_attempts%ROWTYPE;
  v_is_staff boolean;
  v_questions jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_attempt
  FROM assessment_attempts
  WHERE id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found: %', p_attempt_id;
  END IF;

  v_is_staff := app.is_admin()
    OR (
      app.is_org_staff()
      AND app.assessment_org_id(v_attempt.assessment_id) = app.current_org_id()
    );

  IF NOT v_is_staff THEN
    IF v_attempt.student_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Not authorized to view this attempt result';
    END IF;

    IF v_attempt.completed_at IS NULL THEN
      RAISE EXCEPTION 'Results are available after the attempt is submitted';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_questions
  FROM (
    SELECT
      atq.question_order,
      jsonb_build_object(
        'assessment_question_id', atq.assessment_question_id,
        'question_order', atq.question_order,
        'points', aq.points,
        'is_correct', COALESCE(ans.is_correct, false)
      )
      || CASE
           WHEN v_is_staff THEN jsonb_build_object(
             'selected_options', to_jsonb(ans.selected_options),
             'text_answer', ans.text_answer,
             'answered_at', ans.answered_at
           )
           ELSE '{}'::jsonb
         END AS item
    FROM attempt_questions atq
    JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
    LEFT JOIN attempt_answers ans
      ON ans.attempt_id = atq.attempt_id
     AND ans.assessment_question_id = atq.assessment_question_id
    WHERE atq.attempt_id = p_attempt_id
  ) x;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'assessment_id', v_attempt.assessment_id,
    'student_id', v_attempt.student_id,
    'started_at', v_attempt.started_at,
    'completed_at', v_attempt.completed_at,
    'correct_count', v_attempt.correct_count,
    'total_questions', v_attempt.total_questions,
    'score_percent', v_attempt.score_percent,
    'questions', v_questions
  );
END;
$$;

ALTER FUNCTION public.get_attempt_result(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_attempt_result(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_attempt_result(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_attempt_result(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attempt_result(uuid) TO service_role;

COMMENT ON FUNCTION public.get_attempt_result(uuid) IS
  'Score + per-question correctness for one attempt: owner after completion, org staff any time (staff also see the given answer).';
