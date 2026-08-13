-- Revamp P9b — manual marking + teacher-controlled answer release
-- Decisions 69, 70, 71 (Revamp 2.5).
--
-- P9a left long_answer answers PENDING (is_correct NULL / awarded_points
-- NULL) and the stored score_percent as the FLOOR of the final score. This
-- part closes that loop:
--
--   1. attempt_answers gains marked_by / marked_at / marker_comment. Like
--      is_correct and awarded_points, the three are server-owned: no column
--      privilege is granted to `authenticated`, so only definer code writes
--      them (decision 69).
--   2. assessment_attempts gains pending_manual_count — the explicit,
--      queryable "awaiting marking" state, maintained by the same recompute
--      the score goes through, so the staff marking queue is one indexed
--      predicate and the student can be shown "N awaiting".
--   3. mark_attempt_answer(answer, points, comment) — classroom-scoped
--      authz, validates the answer is a submitted, manual one and that the
--      award is in range, then recomputes the whole attempt. A student can
--      never reach it.
--   4. assessments gains show_auto_score_while_pending (decision 70) and
--      answers_released_at / answers_released_by + release_assessment_answers
--      (decision 71). The two release columns are revoked from the client:
--      release goes through the RPC, which has its own (wider than "who may
--      edit the assessment") authz.
--   5. get_attempt_result is rewritten around both gates. For the ATTEMPT
--      OWNER it reveals the answer key ONLY once answers are released, and
--      when marking is pending it either shows the auto-graded subtotal or
--      NO score at all, per the assessment's setting. Staff visibility is
--      unchanged (they already read the key straight off assessment_questions).
--
-- NOT touched: get_attempt_questions (mid-attempt content stays key-free,
-- including P9a's per-attempt scramble of matching/ordering item order), the
-- attempt_answers is_correct/awarded_points revocation (no mid-attempt
-- grading oracle), and every P3a/P5a/P8a contract around them.

-- ============================================================
-- SECTION 1 — assessments: pending-score visibility + release
-- ============================================================
ALTER TABLE public.assessments
  ADD COLUMN show_auto_score_while_pending boolean NOT NULL DEFAULT true,
  ADD COLUMN answers_released_at timestamptz,
  ADD COLUMN answers_released_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.assessments.show_auto_score_while_pending IS
  'Decision 70. While an attempt still has answers awaiting manual marking: TRUE = the student sees the auto-graded subtotal plus a pending count, FALSE = the student sees no score at all until marking is finished.';

COMMENT ON COLUMN public.assessments.answers_released_at IS
  'Decision 71. NULL = answer keys are hidden from students (default). Once set, get_attempt_result reveals the key to the attempt owner. Written only by release_assessment_answers().';

COMMENT ON COLUMN public.assessments.answers_released_by IS
  'Who released the answers. ON DELETE SET NULL — losing the releaser is an audit gap, not a reason to block deleting a profile; the release itself stands (answers_released_at is the gate).';

-- Covers the FK: without it, deleting a profile seq-scans assessments.
CREATE INDEX IF NOT EXISTS idx_assessments_answers_released_by
  ON public.assessments USING btree (answers_released_by);

-- Column-level write grants: everything the builder edits stays writable,
-- the two release columns do NOT. Release is an action with its own authz
-- (a teacher of an ASSIGNED classroom may release an assessment they did
-- not author), so it must not also be a plain column write, and
-- answers_released_by must not be spoofable.
REVOKE INSERT, UPDATE ON TABLE public.assessments FROM authenticated;

GRANT INSERT (
  id, organization_id, created_by, title, description, status,
  time_limit_seconds, shuffle_questions, created_at, updated_at,
  is_template, grade_level_id, subject_id, show_auto_score_while_pending
) ON TABLE public.assessments TO authenticated;

GRANT UPDATE (
  id, organization_id, created_by, title, description, status,
  time_limit_seconds, shuffle_questions, created_at, updated_at,
  is_template, grade_level_id, subject_id, show_auto_score_while_pending
) ON TABLE public.assessments TO authenticated;

-- SELECT stays table-wide: students may see WHETHER answers are released
-- (that is a UI affordance, not a key), staff need it for the results view.

-- ============================================================
-- SECTION 2 — attempt_answers: marking columns (decision 69)
--
-- No grant is issued for the three columns, so `authenticated` can neither
-- read nor write them directly (Supabase's default privileges apply to new
-- TABLES, not new columns, and P9a already replaced the table-level grants
-- with explicit column lists). The explicit REVOKE below is belt and braces
-- and documents the intent.
-- ============================================================
ALTER TABLE public.attempt_answers
  ADD COLUMN marked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN marked_at timestamptz,
  ADD COLUMN marker_comment text;

REVOKE ALL (marked_by, marked_at, marker_comment)
  ON TABLE public.attempt_answers FROM authenticated;
REVOKE ALL (marked_by, marked_at, marker_comment)
  ON TABLE public.attempt_answers FROM anon;

COMMENT ON COLUMN public.attempt_answers.marked_by IS
  'Staff member who hand-marked this answer. Server-owned: written only by mark_attempt_answer().';

COMMENT ON COLUMN public.attempt_answers.marked_at IS
  'When the answer was hand-marked. NULL = never marked.';

COMMENT ON COLUMN public.attempt_answers.marker_comment IS
  'Optional feedback from the marker. Shown to the attempt owner by get_attempt_result() (unless the score is being withheld), never writable by any client.';

-- Covers the FK: without it, deleting a profile seq-scans attempt_answers.
CREATE INDEX IF NOT EXISTS idx_attempt_answers_marked_by
  ON public.attempt_answers USING btree (marked_by);

-- ============================================================
-- SECTION 3 — assessment_attempts: explicit pending state
--
-- pending_manual_count = answers of this attempt that EXIST but have no
-- grade yet (awarded_points IS NULL). The grader only ever leaves
-- awarded_points NULL for a manual (long_answer) question, so this is
-- exactly "answers awaiting marking". An UNANSWERED manual question is not
-- pending — it is a zero, like any other unanswered question; there is no
-- answer row for a teacher to mark.
--
-- The client cannot write it: assessment_attempts only grants
-- UPDATE (current_question_index) to `authenticated`. The table-level
-- SELECT grant covers the new column, so the owner sees their own count and
-- staff see the marking queue.
-- ============================================================
ALTER TABLE public.assessment_attempts
  ADD COLUMN pending_manual_count integer NOT NULL DEFAULT 0
    CHECK (pending_manual_count >= 0);

COMMENT ON COLUMN public.assessment_attempts.pending_manual_count IS
  'Answers of this attempt awaiting manual marking (answer rows with awarded_points IS NULL). Maintained by app.recompute_attempt_score() on submission and after every mark. 0 = fully graded, so score_percent is final.';

-- The staff marking queue: "submitted attempts of this assessment that are
-- awaiting marking".
CREATE INDEX idx_assessment_attempts_pending_marking
  ON public.assessment_attempts USING btree (assessment_id)
  WHERE pending_manual_count > 0;

-- ============================================================
-- SECTION 4 — One scoring formula, one place
--
-- score_percent = clamp(0..100, round(100 * SUM(COALESCE(awarded_points,0))
--                                        / SUM(points)))
-- over the attempt's frozen snapshot (P9a decision 68). A pending answer
-- contributes 0 to the numerator and its full points to the denominator, so
-- the stored score is the FLOOR of the final score while marking is
-- outstanding and becomes exact the moment pending_manual_count hits 0.
--
-- Internal: EXECUTE is revoked from every client role; only the definer
-- RPCs below (owner postgres) call it.
-- ============================================================
CREATE OR REPLACE FUNCTION app.recompute_attempt_score(p_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_questions integer;
  v_total_points numeric;
  v_correct_count integer;
  v_earned_points numeric;
  v_pending integer;
BEGIN
  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(aq.points), 0)::numeric,
    COUNT(*) FILTER (WHERE ans.is_correct)::integer,
    COALESCE(SUM(COALESCE(ans.awarded_points, 0)), 0)::numeric,
    COUNT(*) FILTER (WHERE ans.id IS NOT NULL AND ans.awarded_points IS NULL)::integer
  INTO v_total_questions, v_total_points, v_correct_count, v_earned_points, v_pending
  FROM attempt_questions atq
  JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
  LEFT JOIN attempt_answers ans
    ON ans.attempt_id = atq.attempt_id
   AND ans.assessment_question_id = atq.assessment_question_id
  WHERE atq.attempt_id = p_attempt_id;

  UPDATE assessment_attempts
  SET
    correct_count = v_correct_count,
    total_questions = v_total_questions,
    score_percent = LEAST(100, GREATEST(0, COALESCE(
      round((100 * v_earned_points) / NULLIF(v_total_points, 0))::integer,
      0
    ))),
    pending_manual_count = v_pending
  WHERE id = p_attempt_id;
END;
$$;

ALTER FUNCTION app.recompute_attempt_score(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.recompute_attempt_score(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.recompute_attempt_score(uuid) FROM anon;
REVOKE ALL ON FUNCTION app.recompute_attempt_score(uuid) FROM authenticated;

COMMENT ON FUNCTION app.recompute_attempt_score(uuid) IS
  'Internal. Re-derives correct_count / total_questions / score_percent / pending_manual_count for one attempt from its frozen snapshot and server-graded answers. The single definition of the scoring formula.';

-- ============================================================
-- SECTION 5 — The time-limit trigger must not see a marking write
--
-- trg_attempt_answer_time_limit fires BEFORE INSERT OR UPDATE and raises
-- 'Attempt already completed' for any write to a submitted attempt — which
-- is exactly what marking is. Narrow it to the columns a CLIENT may write
-- (the P9a grant list, verbatim): every student write still trips it,
-- while a definer marking write that touches only the grade/marking columns
-- does not. Same technique, and same reasoning, as P9a's change to
-- trg_grade_attempt_answer's UPDATE OF list.
--
-- Trigger name is unchanged, so the firing order (time limit before
-- grading, alphabetical) is unchanged.
-- ============================================================
DROP TRIGGER trg_attempt_answer_time_limit ON public.attempt_answers;

CREATE TRIGGER trg_attempt_answer_time_limit
  BEFORE INSERT OR UPDATE OF
    attempt_id, assessment_question_id, selected_options, text_answer,
    response, time_spent_seconds, answered_at
  ON public.attempt_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_attempt_time_limit();

-- ============================================================
-- SECTION 6 — complete_assessment_attempt: same contract, shared formula
--
-- Signature and return shape are unchanged apart from an additive
-- "pending_count" key. Scoring now runs through
-- app.recompute_attempt_score, so submission and marking can never drift
-- apart.
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_assessment_attempt(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid;
  v_completed_at timestamptz;
  v_correct_count integer;
  v_total_questions integer;
  v_score_percent integer;
  v_pending integer;
BEGIN
  -- FOR UPDATE serializes concurrent completions of the same attempt.
  SELECT student_id, completed_at, correct_count, total_questions, score_percent,
         pending_manual_count
  INTO v_student_id, v_completed_at, v_correct_count, v_total_questions, v_score_percent,
       v_pending
  FROM assessment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found: %', p_attempt_id;
  END IF;

  IF v_student_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Cannot complete another student''s attempt';
  END IF;

  IF v_completed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'correct_count', v_correct_count,
      'total', v_total_questions,
      'score_percent', v_score_percent,
      'pending_count', v_pending,
      'already_completed', true
    );
  END IF;

  PERFORM app.recompute_attempt_score(p_attempt_id);

  UPDATE assessment_attempts
  SET completed_at = now()
  WHERE id = p_attempt_id
  RETURNING correct_count, total_questions, score_percent, pending_manual_count
  INTO v_correct_count, v_total_questions, v_score_percent, v_pending;

  RETURN jsonb_build_object(
    'correct_count', v_correct_count,
    'total', v_total_questions,
    'score_percent', v_score_percent,
    'pending_count', v_pending,
    'already_completed', false
  );
END;
$$;

COMMENT ON FUNCTION public.complete_assessment_attempt(uuid) IS
  'Scores and closes the caller''s attempt via app.recompute_attempt_score: score_percent = SUM(awarded_points)/SUM(points) over the frozen snapshot (an answer awaiting marking counts 0 until marked, and is counted in pending_count). Idempotent.';

-- ============================================================
-- SECTION 7 — Who may mark / release (decisions 69, 71)
--
--   admin                                            -> always
--   manager of the assessment's organization         -> always
--   teacher of a classroom the assessment is assigned to, or a teacher who
--   shares a classroom with a student it is assigned to directly (P6d's
--   rule for who may assign, applied to who may mark)
--
-- A STUDENT can never satisfy any branch: classroom_teachers is staff-only,
-- so neither EXISTS clause can be true for them, and is_admin/is_manager
-- read profiles.user_type. Marking one's own attempt is therefore
-- structurally impossible.
--
-- SECURITY DEFINER so the RPCs can evaluate it without needing a read path
-- of their own into the assignment/classroom tables, exactly like the P6a
-- membership helpers.
-- ============================================================
CREATE OR REPLACE FUNCTION app.can_mark_assessment(p_assessment_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    app.is_admin()
    OR (
      app.is_manager()
      AND app.assessment_org_id(p_assessment_id) IS NOT NULL
      AND app.assessment_org_id(p_assessment_id) = app.current_org_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.assessment_assignments aa
      WHERE aa.assessment_id = p_assessment_id
        AND (
          (aa.classroom_id IS NOT NULL AND app.is_classroom_teacher(aa.classroom_id))
          OR (aa.student_id IS NOT NULL
              AND app.teacher_shares_classroom_with_student(aa.student_id))
        )
    );
$$;

ALTER FUNCTION app.can_mark_assessment(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.can_mark_assessment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_mark_assessment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.can_mark_assessment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.can_mark_assessment(uuid) TO service_role;

COMMENT ON FUNCTION app.can_mark_assessment(uuid) IS
  'May the caller mark answers of, and release answers for, this assessment? Admin, manager of its org, or a teacher of a classroom / of a directly-assigned student it is assigned to. Never a student.';

-- ============================================================
-- SECTION 8 — mark_attempt_answer (decision 69)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_attempt_answer(
  p_answer_id uuid,
  p_points numeric,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_attempt_id uuid;
  v_assessment_question_id uuid;
  v_assessment_id uuid;
  v_completed_at timestamptz;
  v_max_points integer;
  v_is_manual boolean;
  v_award numeric;
  v_is_correct boolean;
  v_marked_at timestamptz;
  v_correct_count integer;
  v_total_questions integer;
  v_score_percent integer;
  v_pending integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT ans.attempt_id, ans.assessment_question_id
  INTO v_attempt_id, v_assessment_question_id
  FROM attempt_answers ans
  WHERE ans.id = p_answer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Answer not found: %', p_answer_id;
  END IF;

  -- FOR UPDATE serializes two markers working on the same attempt: each
  -- mark recomputes the whole attempt, so the writes must not interleave.
  SELECT att.assessment_id, att.completed_at
  INTO v_assessment_id, v_completed_at
  FROM assessment_attempts att
  WHERE att.id = v_attempt_id
  FOR UPDATE;

  IF NOT app.can_mark_assessment(v_assessment_id) THEN
    RAISE EXCEPTION 'Not authorized to mark this answer';
  END IF;

  IF v_completed_at IS NULL THEN
    RAISE EXCEPTION 'Only submitted attempts can be marked';
  END IF;

  SELECT aq.points,
         (aq.question_id IS NULL AND aq.payload->>'type' = 'long_answer')
  INTO v_max_points, v_is_manual
  FROM assessment_questions aq
  WHERE aq.id = v_assessment_question_id;

  IF NOT COALESCE(v_is_manual, false) THEN
    RAISE EXCEPTION 'Only long-answer questions are marked by hand';
  END IF;

  -- NaN would slip past a naive range test (NaN > every numeric in
  -- Postgres, so `p_points > max` would catch it, but `p_points < 0`
  -- would not); reject it explicitly.
  IF p_points IS NULL OR p_points = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Awarded points must be a number between 0 and %', v_max_points;
  END IF;

  IF p_points < 0 OR p_points > v_max_points THEN
    RAISE EXCEPTION 'Awarded points must be between 0 and %', v_max_points;
  END IF;

  -- Same rounding as the auto grader (2 dp); full marks = "correct".
  v_award := round(p_points, 2);
  v_is_correct := (v_award >= v_max_points);

  -- Touches ONLY server-owned columns, so neither the time-limit trigger
  -- (section 5) nor the grading trigger (P9a's UPDATE OF list) fires.
  UPDATE attempt_answers
  SET
    awarded_points = v_award,
    is_correct = v_is_correct,
    marked_by = v_caller,
    marked_at = now(),
    marker_comment = NULLIF(btrim(COALESCE(p_comment, '')), '')
  WHERE id = p_answer_id
  RETURNING marked_at INTO v_marked_at;

  PERFORM app.recompute_attempt_score(v_attempt_id);

  SELECT att.correct_count, att.total_questions, att.score_percent,
         att.pending_manual_count
  INTO v_correct_count, v_total_questions, v_score_percent, v_pending
  FROM assessment_attempts att
  WHERE att.id = v_attempt_id;

  RETURN jsonb_build_object(
    'answer_id', p_answer_id,
    'attempt_id', v_attempt_id,
    'awarded_points', v_award,
    'is_correct', v_is_correct,
    'marked_at', v_marked_at,
    'correct_count', v_correct_count,
    'total_questions', v_total_questions,
    'score_percent', v_score_percent,
    'pending_count', v_pending
  );
END;
$$;

ALTER FUNCTION public.mark_attempt_answer(uuid, numeric, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_attempt_answer(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_attempt_answer(uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_attempt_answer(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_attempt_answer(uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.mark_attempt_answer(uuid, numeric, text) IS
  'Hand-marks one long-answer answer of a SUBMITTED attempt (staff only, classroom-scoped), then recomputes the attempt score. Re-marking the same answer is allowed and simply overwrites the award/comment. Returns the updated attempt totals and the remaining pending count.';

-- ============================================================
-- SECTION 9 — release_assessment_answers (decision 71)
--
-- p_released defaults to true, so the documented call
-- release_assessment_answers(p_assessment_id) releases. Passing false
-- un-releases (same authz) — the operational undo for "released too early",
-- which costs nothing to support because the gate is a single nullable
-- column.
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_assessment_answers(
  p_assessment_id uuid,
  p_released boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_released_at timestamptz;
  v_released_by uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM 1 FROM assessments WHERE id = p_assessment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment not found: %', p_assessment_id;
  END IF;

  IF NOT app.can_mark_assessment(p_assessment_id) THEN
    RAISE EXCEPTION 'Not authorized to release answers for this assessment';
  END IF;

  UPDATE assessments
  SET
    -- Idempotent: re-releasing keeps the original timestamp and releaser.
    answers_released_at = CASE
      WHEN COALESCE(p_released, true) THEN COALESCE(answers_released_at, now())
      ELSE NULL
    END,
    answers_released_by = CASE
      WHEN COALESCE(p_released, true) THEN COALESCE(answers_released_by, v_caller)
      ELSE NULL
    END
  WHERE id = p_assessment_id
  RETURNING answers_released_at, answers_released_by
  INTO v_released_at, v_released_by;

  RETURN jsonb_build_object(
    'assessment_id', p_assessment_id,
    'answers_released_at', v_released_at,
    'answers_released_by', v_released_by
  );
END;
$$;

ALTER FUNCTION public.release_assessment_answers(uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.release_assessment_answers(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_assessment_answers(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_assessment_answers(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_assessment_answers(uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.release_assessment_answers(uuid, boolean) IS
  'Releases (or, with p_released => false, un-releases) the answer keys of an assessment to its students. Same authz as marking: admin, manager of the org, or a teacher of an assigned classroom. Idempotent.';

-- ============================================================
-- SECTION 10 — get_attempt_result: release gate + pending visibility
--
-- Contract by caller (decisions 70-71):
--
--  STAFF (admin / org staff of the assessment's org, any time)
--      unchanged full visibility: real score, per-question correctness and
--      awarded points, the student's answer, plus the key (which they can
--      already read straight off assessment_questions) and the answer id
--      the marking RPC takes.
--
--  OWNER (own attempt, completed only — unchanged authz)
--      keys           : ONLY when answers_released_at IS NOT NULL.
--      score          : withheld ENTIRELY (score_percent, correct_count,
--                       points, per-question is_correct / awarded_points /
--                       marker_comment all null) while pending answers
--                       remain AND show_auto_score_while_pending is false.
--                       Otherwise the stored score, which while pending is
--                       the auto-graded subtotal (pending answers score 0
--                       out of their full points) and is exact once
--                       pending_count reaches 0.
--      own answers    : always (their own rows, already client-readable).
--
-- The two gates are independent: releasing keys does not reveal a withheld
-- score, and showing the subtotal never reveals a key.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_attempt_result(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_attempt assessment_attempts%ROWTYPE;
  v_assessment assessments%ROWTYPE;
  v_is_staff boolean;
  v_reveal_keys boolean;
  v_withhold_score boolean;
  v_pending integer;
  v_earned_points numeric;
  v_total_points numeric;
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

  SELECT * INTO v_assessment
  FROM assessments
  WHERE id = v_attempt.assessment_id;

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

  -- Derived live, not read from the stored counter: the gate below must be
  -- right even for a staff peek at an attempt that has not been through
  -- recompute yet.
  SELECT
    COUNT(*) FILTER (WHERE ans.id IS NOT NULL AND ans.awarded_points IS NULL)::integer,
    COALESCE(SUM(COALESCE(ans.awarded_points, 0)), 0)::numeric,
    COALESCE(SUM(aq.points), 0)::numeric
  INTO v_pending, v_earned_points, v_total_points
  FROM attempt_questions atq
  JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
  LEFT JOIN attempt_answers ans
    ON ans.attempt_id = atq.attempt_id
   AND ans.assessment_question_id = atq.assessment_question_id
  WHERE atq.attempt_id = p_attempt_id;

  v_reveal_keys := v_is_staff OR v_assessment.answers_released_at IS NOT NULL;

  v_withhold_score := (NOT v_is_staff)
    AND v_pending > 0
    AND NOT v_assessment.show_auto_score_while_pending;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_questions
  FROM (
    SELECT
      atq.question_order,
      jsonb_build_object(
        'assessment_question_id', atq.assessment_question_id,
        'question_order', atq.question_order,
        'points', aq.points,
        -- The answer row id — what mark_attempt_answer takes.
        'answer_id', ans.id,
        -- The caller's / student's own submission. Not a key: the owner can
        -- read these columns of their own rows directly anyway.
        'selected_options', to_jsonb(ans.selected_options),
        'text_answer', ans.text_answer,
        'response', ans.response,
        'answered_at', ans.answered_at
      )
      || CASE
           -- Withheld score: no correctness, no points, no marker feedback
           -- — a per-question breakdown IS the score, in pieces.
           WHEN v_withhold_score THEN jsonb_build_object(
             'is_correct', NULL::boolean,
             'awarded_points', NULL::numeric,
             'marker_comment', NULL::text,
             'marked_at', NULL::timestamptz
           )
           ELSE jsonb_build_object(
             -- no answer row -> false (unanswered); row with NULL -> pending
             'is_correct', CASE WHEN ans.id IS NULL THEN to_jsonb(false)
                                ELSE to_jsonb(ans.is_correct) END,
             'awarded_points', ans.awarded_points,
             'marker_comment', ans.marker_comment,
             'marked_at', ans.marked_at
           )
         END
      || CASE
           WHEN NOT v_reveal_keys THEN '{}'::jsonb
           ELSE jsonb_build_object('correct',
             CASE
               WHEN aq.question_id IS NOT NULL THEN
                 CASE
                   WHEN bank.type::text = 'short_answer' THEN
                     jsonb_build_object(
                       'accepted_answers',
                       CASE WHEN bank.answer IS NULL THEN '[]'::jsonb
                            ELSE jsonb_build_array(bank.answer) END
                     )
                   ELSE
                     jsonb_build_object('correct_options', (
                       SELECT COALESCE(jsonb_agg(o.opt_num ORDER BY o.opt_num), '[]'::jsonb)
                       FROM (VALUES
                         (1, bank.option_1_is_correct),
                         (2, bank.option_2_is_correct),
                         (3, bank.option_3_is_correct),
                         (4, bank.option_4_is_correct)
                       ) AS o(opt_num, is_correct)
                       WHERE o.is_correct IS TRUE
                     ))
                 END

               WHEN aq.payload->>'type' IN ('mcq', 'mrq') THEN
                 jsonb_build_object('correct_options', (
                   SELECT COALESCE(jsonb_agg(e.ord::integer ORDER BY e.ord), '[]'::jsonb)
                   FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(aq.payload->'options') = 'array'
                          THEN aq.payload->'options' ELSE '[]'::jsonb END
                   ) WITH ORDINALITY AS e(elem, ord)
                   WHERE jsonb_typeof(e.elem) = 'object'
                     AND e.elem->'is_correct' = 'true'::jsonb
                 ))

               WHEN aq.payload->>'type' = 'true_false' THEN
                 jsonb_build_object('answer', aq.payload->'answer')

               WHEN aq.payload->>'type' = 'numeric' THEN
                 jsonb_build_object(
                   'answer', aq.payload->'answer',
                   'tolerance', aq.payload->'tolerance'
                 )

               WHEN aq.payload->>'type' = 'short_answer' THEN
                 jsonb_build_object('accepted_answers', aq.payload->'accepted_answers')

               WHEN aq.payload->>'type' = 'cloze' THEN
                 jsonb_build_object('blanks', (
                   SELECT COALESCE(
                     jsonb_agg(
                       jsonb_build_object(
                         'index', e.elem->'index',
                         'accepted', e.elem->'accepted'
                       ) ORDER BY e.ord
                     ),
                     '[]'::jsonb
                   )
                   FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(aq.payload->'blanks') = 'array'
                          THEN aq.payload->'blanks' ELSE '[]'::jsonb END
                   ) WITH ORDINALITY AS e(elem, ord)
                   WHERE jsonb_typeof(e.elem) = 'object'
                 ))

               WHEN aq.payload->>'type' = 'matching' THEN
                 jsonb_build_object('pairs', aq.payload->'pairs')

               WHEN aq.payload->>'type' = 'ordering' THEN
                 jsonb_build_object('correct_order', aq.payload->'correct_order')

               WHEN aq.payload->>'type' = 'long_answer' THEN
                 jsonb_build_object('rubric', aq.payload->'rubric')

               ELSE '{}'::jsonb
             END
             || CASE
                  WHEN aq.question_id IS NULL
                   AND jsonb_typeof(aq.payload->'explanation') = 'string'
                    THEN jsonb_build_object('explanation', aq.payload->>'explanation')
                  ELSE '{}'::jsonb
                END
           )
         END AS item
    FROM attempt_questions atq
    JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
    LEFT JOIN questions bank ON bank.id = aq.question_id
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
    'total_questions', v_attempt.total_questions,
    'pending_count', v_pending,
    'score_withheld', v_withhold_score,
    'answers_revealed', v_reveal_keys,
    'answers_released_at', v_assessment.answers_released_at,
    'show_auto_score_while_pending', v_assessment.show_auto_score_while_pending,
    'correct_count', CASE WHEN v_withhold_score THEN NULL::jsonb
                          ELSE to_jsonb(v_attempt.correct_count) END,
    'score_percent', CASE WHEN v_withhold_score THEN NULL::jsonb
                          ELSE to_jsonb(v_attempt.score_percent) END,
    'points_awarded', CASE WHEN v_withhold_score THEN NULL::jsonb
                           ELSE to_jsonb(v_earned_points) END,
    'points_total', CASE WHEN v_withhold_score THEN NULL::jsonb
                         ELSE to_jsonb(v_total_points) END,
    'questions', v_questions
  );
END;
$$;

COMMENT ON FUNCTION public.get_attempt_result(uuid) IS
  'Attempt result, gated: owner after submission (keys only once answers_released_at is set; no score at all while marking is pending if show_auto_score_while_pending is false), org staff any time with full visibility. is_correct NULL = awaiting marking.';
