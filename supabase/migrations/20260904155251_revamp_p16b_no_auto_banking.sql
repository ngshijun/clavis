-- ============================================================
-- Clavis revamp — P16b: no auto-banking; an assessment question is a copy
--
-- P16a isolated the practice bank (kept) and, in the same step, made a
-- published admin template contribute its questions to the assessment bank
-- through a trigger, tracked by `assessment_questions.banked_question_id`
-- and tagged with a per-question `difficulty` (dropped here).
--
-- That design kept the same admin question as two independent copies — one
-- in the bank, one in the template — synchronised once, in one direction,
-- on the draft->published edge. Every edit after that moment diverged the
-- copies silently, questions added to an already-published template were
-- never banked, and a template assembled from bank picks needed the marker
-- column just to avoid re-banking them on every publish.
--
-- Decision 89 replaces it: the bank is the ONLY store of admin questions and
-- a template will be an ordered list of references into it (next migration).
-- With one copy there is nothing to sync, so the trigger, the marker and the
-- difficulty column all go. `assessment_questions` returns to what it is for
-- a teacher: a self-contained copy that no bank edit can reach.
--
-- clone_assessment_template still copies template rows verbatim; it is
-- re-pointed at bank references when templates move.
-- ============================================================

DROP TRIGGER IF EXISTS bank_template_questions_on_publish ON public.assessments;
DROP FUNCTION IF EXISTS public.bank_template_questions();

DROP INDEX IF EXISTS public.idx_assessment_questions_banked;

ALTER TABLE public.assessment_questions
  DROP COLUMN banked_question_id,
  DROP COLUMN difficulty;

-- ---- clone_assessment_template (no difficulty to carry) ----
CREATE OR REPLACE FUNCTION public.clone_assessment_template(
  p_template_id  uuid,
  p_classroom_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller   uuid := (SELECT auth.uid());
  v_org_id   uuid;
  v_template assessments%ROWTYPE;
  v_new_id   uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Authoring is a teacher's job (decision 80), and it happens inside a
  -- classroom they actually teach (decision 81).
  IF NOT app.is_teacher() THEN
    RAISE EXCEPTION 'Only teachers can clone templates';
  END IF;

  IF NOT app.is_classroom_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'You do not teach this classroom';
  END IF;

  v_org_id := app.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no organization';
  END IF;

  SELECT * INTO v_template FROM assessments WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  IF NOT v_template.is_template THEN
    RAISE EXCEPTION 'Assessment is not a template: %', p_template_id;
  END IF;

  -- The template's pairing still gates WHO may use it: the target classroom
  -- must be of that grade and subject.
  IF NOT EXISTS (
    SELECT 1 FROM classrooms c
    WHERE c.id = p_classroom_id
      AND c.organization_id = v_org_id
      AND c.grade_level_id = v_template.grade_level_id
      AND c.subject_id = v_template.subject_id
  ) THEN
    RAISE EXCEPTION 'No classroom matches this template grade and subject';
  END IF;

  INSERT INTO assessments (
    organization_id, created_by, title, description,
    status, time_limit_seconds, shuffle_questions, is_template,
    classroom_id
  )
  VALUES (
    v_org_id, v_caller, v_template.title, v_template.description,
    'draft', v_template.time_limit_seconds, v_template.shuffle_questions, false,
    p_classroom_id
  )
  RETURNING id INTO v_new_id;

  -- A teacher's copy in their own classroom: payload, order and marks, and
  -- nothing that could ever reach back into the admin bank.
  INSERT INTO assessment_questions (assessment_id, payload, position, points)
  SELECT v_new_id, aq.payload, aq.position, aq.points
  FROM assessment_questions aq
  WHERE aq.assessment_id = p_template_id;

  RETURN v_new_id;
END;
$$;
