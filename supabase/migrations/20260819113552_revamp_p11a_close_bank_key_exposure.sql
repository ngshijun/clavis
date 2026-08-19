-- ============================================================
-- Revamp P11a — close the practice bank answer-key exposure
-- (PLAN.md decision 76; the Tier-1 residual carried forward by
--  P3a decision 33, P5a and P9a/P9b)
--
-- THE DEFECT
-- public.questions is readable by every authenticated user
-- (policy "Questions are viewable by authenticated users" USING (true))
-- and `authenticated` held a WHOLE-TABLE SELECT grant. The practice
-- runner did `select('*')` on the session's questions, so a STUDENT
-- received `answer`, `option_N_is_correct` and `option_N_tip` BEFORE
-- answering. Assessments built from bank questions inherited the same
-- exposure: P3a sanitized `assessment_questions` but a student could
-- still text-match a bank question and read its key straight off
-- `questions`.
--
-- THE FIX (the P3a/P5a pattern applied to the bank itself)
--   1. Column-level revoke: `authenticated` keeps SELECT on the 18
--      CONTENT columns and loses it on the 9 KEY columns
--      (answer, option_1..4_is_correct, option_1..4_tip). Column
--      grants are ROLE-wide, so admins lose the direct read too —
--      hence (3).
--   2. get_practice_session_questions(uuid): sanitizing definer RPC,
--      session-owner only, the sanctioned student path to practice
--      content (mirrors get_attempt_questions for assessments).
--   3. get_bank_questions(uuid) / get_bank_question(uuid): definer
--      RPCs gated to PLATFORM ADMIN that return the full bank row
--      (keys + tips) so the admin authoring surfaces keep working.
--      Org staff (manager/teacher) deliberately get NO key path —
--      the assessment bank picker and builder render content only.
--
-- NOT WEAKENED HERE
--   * get_session_result() stays the only post-completion tip path
--     (it enumerates only the wrong options the student PICKED, so it
--     never reveals the correct one).
--   * Every assessment RPC is untouched.
--   * grade_practice_answer() / grade_attempt_answer() and every other
--     function that reads `questions` are SECURITY DEFINER owned by
--     postgres, so the revoke does not affect server-side grading.
--   * anon still has no privilege of any kind on the table.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Column-level SELECT grant on public.questions
--
-- Kept for `authenticated` (18 content columns): the question text and
-- images, the four option texts/images, the curriculum foreign keys and
-- the housekeeping columns. Practice pool selection, the assessment
-- bank picker/builder and the bulk-upload dedup all read these.
--
-- Revoked for `authenticated` (9 key columns): answer,
-- option_1_is_correct .. option_4_is_correct,
-- option_1_tip .. option_4_tip. `option_N_tip` is a key column because
-- a tip is written on the WRONG options — its presence/absence is the
-- answer.
--
-- INSERT / UPDATE / DELETE grants are intentionally left whole-table:
-- RLS ("Admins can insert/update/delete questions") is what scopes
-- writes to platform admins, and authoring needs to write the keys.
-- ------------------------------------------------------------
REVOKE SELECT ON TABLE public.questions FROM authenticated;

GRANT SELECT (
  id,
  type,
  question,
  image_path,
  image_hash,
  sub_topic_id,
  subject_id,
  grade_level_id,
  option_1_text,
  option_1_image_path,
  option_2_text,
  option_2_image_path,
  option_3_text,
  option_3_image_path,
  option_4_text,
  option_4_image_path,
  created_at,
  updated_at
) ON TABLE public.questions TO authenticated;

-- Re-assert the anon lock-down from 20260530000004 (belt and braces —
-- anon must never see the bank at all).
REVOKE ALL ON TABLE public.questions FROM anon;

COMMENT ON TABLE public.questions IS
  'Global question bank. `authenticated` may SELECT content columns only; answer, option_N_is_correct and option_N_tip are column-revoked. Students read session content through get_practice_session_questions(); admins read keys through get_bank_questions()/get_bank_question().';

-- ------------------------------------------------------------
-- 2. get_practice_session_questions(p_session_id) — sanitized runner
--    payload for the session owner (decision 76)
--
-- Returns the session's questions in the frozen session_questions
-- order, content ONLY. answer / option_N_is_correct / option_N_tip are
-- never emitted. Works while the session is in progress (runner) and
-- after it is completed (review) — the shape carries no key either way.
--
-- Options mirror get_attempt_questions: 1-based `number` (the value
-- practice_answers.selected_options expects), `text`, `image_path`;
-- options with neither text nor image are dropped, so a short_answer
-- question returns [].
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_practice_session_questions(p_session_id uuid)
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
  FROM practice_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF v_student_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Cannot read another student''s session';
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      sq.question_order,
      jsonb_build_object(
        'question_id', q.id,
        'question_order', sq.question_order,
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
    FROM session_questions sq
    JOIN questions q ON q.id = sq.question_id
    WHERE sq.session_id = p_session_id
  ) x;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_practice_session_questions(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_practice_session_questions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_practice_session_questions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_practice_session_questions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_practice_session_questions(uuid) TO service_role;

COMMENT ON FUNCTION public.get_practice_session_questions(uuid) IS
  'Sanitized question content for one practice session, in question_order (session owner only, open or completed). Never emits answer, option_N_is_correct or option_N_tip.';

-- ------------------------------------------------------------
-- 3. Admin bank read paths (decision 76)
--
-- Column grants are role-wide, so the revoke in (1) also blocks the
-- platform admin's direct read of the keys. These two definer RPCs give
-- the admin authoring surfaces (curriculum sub-topic question panel,
-- question statistics preview, question feedback preview/edit) the full
-- row back, gated on app.is_admin().
--
-- Deliberately NOT granted to org staff: managers/teachers never render
-- a bank answer key today (the assessment builder and bank picker map
-- content only), and giving a teacher the global bank's keys would be a
-- new exposure, not a restored one. A staff key path, if ever wanted,
-- needs its own org-scoped RPC.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_bank_questions(p_sub_topic_id uuid DEFAULT NULL)
RETURNS SETOF public.questions
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (SELECT app.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to read the question bank';
  END IF;

  RETURN QUERY
  SELECT q.*
  FROM questions q
  WHERE p_sub_topic_id IS NULL OR q.sub_topic_id = p_sub_topic_id
  ORDER BY q.created_at DESC;
END;
$$;

ALTER FUNCTION public.get_bank_questions(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_bank_questions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_bank_questions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_bank_questions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bank_questions(uuid) TO service_role;

COMMENT ON FUNCTION public.get_bank_questions(uuid) IS
  'Full bank rows INCLUDING answer/option_N_is_correct/option_N_tip for authoring. Platform admin only. NULL p_sub_topic_id returns the whole bank, newest first.';

CREATE OR REPLACE FUNCTION public.get_bank_question(p_question_id uuid)
RETURNS SETOF public.questions
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (SELECT app.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to read the question bank';
  END IF;

  RETURN QUERY
  SELECT q.*
  FROM questions q
  WHERE q.id = p_question_id;
END;
$$;

ALTER FUNCTION public.get_bank_question(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_bank_question(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_bank_question(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_bank_question(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bank_question(uuid) TO service_role;

COMMENT ON FUNCTION public.get_bank_question(uuid) IS
  'One full bank row INCLUDING answer/option_N_is_correct/option_N_tip for authoring. Platform admin only. Returns zero rows when the id does not exist.';
