-- ============================================================
-- Clavis — P12b: an assessment belongs to a CLASSROOM
--
-- Decision 81. Scoping was keyed on the grade+subject pairing, which cannot
-- identify a classroom: a manager may run "Year 1 Math (Group A)" and
-- "Year 1 Math (Group B)" side by side, and those carry the SAME
-- grade_level_id and subject_id. Any pairing-based rule shows Group A's work
-- to Group B. The seed already contains exactly that pair.
--
-- So a non-template assessment now carries `classroom_id`, and that column —
-- not the pairing — answers "which classroom does this belong to" for staff
-- lists, for student lists, and for the assignment guard.
--
-- Templates are unchanged: they are platform-wide, belong to no classroom,
-- and keep grade_level_id + subject_id, which is what decides WHICH centers
-- may see them (P8a decision 61/62). The pairing keeps exactly that job and
-- loses the one it was bad at.
--
-- PRE-FLIGHT (already true on staging; prod has no assessments at all):
--   select id, title from public.assessments
--   where not is_template and classroom_id is null;
-- must return zero rows after section 2, or the CHECK in section 3 aborts.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The column.
--
-- ON DELETE RESTRICT, deliberately, where classroom_students and
-- assessment_assignments both CASCADE: cascading here would let deleting a
-- classroom delete its assessments, and assessment_attempts cascade from
-- assessments — silently destroying graded student work. A classroom that
-- still owns assessments has to be emptied explicitly.
-- ------------------------------------------------------------
ALTER TABLE public.assessments
  ADD COLUMN classroom_id uuid REFERENCES public.classrooms(id) ON DELETE RESTRICT;

CREATE INDEX idx_assessments_classroom ON public.assessments USING btree (classroom_id);

COMMENT ON COLUMN public.assessments.classroom_id IS
  'The classroom this assessment belongs to (decision 81). NULL for templates, required otherwise. This — not grade_level_id/subject_id — is what scopes an assessment, because two classrooms can share a grade and subject.';

-- ------------------------------------------------------------
-- 2. Backfill from existing assignments.
--
-- A classroom-targeted assignment names the classroom outright. Failing
-- that, an individually-targeted assignment implies it: the P8a guard
-- already required such a student to sit in a classroom matching the
-- assessment's pairing. Earliest assignment wins so the result is
-- deterministic when an assessment reached several classrooms.
-- ------------------------------------------------------------
UPDATE public.assessments a
SET classroom_id = sub.classroom_id
FROM (
  SELECT DISTINCT ON (aa.assessment_id)
         aa.assessment_id,
         aa.classroom_id
  FROM public.assessment_assignments aa
  WHERE aa.classroom_id IS NOT NULL
  ORDER BY aa.assessment_id, aa.created_at
) AS sub
WHERE a.id = sub.assessment_id
  AND NOT a.is_template
  AND a.classroom_id IS NULL;

UPDATE public.assessments a
SET classroom_id = sub.classroom_id
FROM (
  SELECT DISTINCT ON (aa.assessment_id)
         aa.assessment_id,
         cs.classroom_id
  FROM public.assessment_assignments aa
  JOIN public.classroom_students cs ON cs.student_id = aa.student_id
  JOIN public.classrooms c ON c.id = cs.classroom_id
  WHERE aa.student_id IS NOT NULL
  ORDER BY aa.assessment_id, aa.created_at
) AS sub
WHERE a.id = sub.assessment_id
  AND NOT a.is_template
  AND a.classroom_id IS NULL;

-- ------------------------------------------------------------
-- 3. Templates own no classroom; everything else must own one.
-- ------------------------------------------------------------
ALTER TABLE public.assessments
  ADD CONSTRAINT assessments_classroom_matches_kind
  CHECK (
    (is_template AND classroom_id IS NULL)
    OR (NOT is_template AND classroom_id IS NOT NULL)
  );

-- ------------------------------------------------------------
-- 4. The assignment guard now checks classroom IDENTITY.
--
-- Replaces the pairing comparison, which could not tell Group A from
-- Group B. An assessment reaches its own classroom, or a student enrolled
-- in that classroom — nothing else. Still role-independent, so it binds
-- admins and service_role too.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_template  boolean;
  v_classroom_id uuid;
BEGIN
  SELECT a.is_template, a.classroom_id
    INTO v_is_template, v_classroom_id
  FROM assessments a
  WHERE a.id = NEW.assessment_id;

  -- A missing assessment is left to the FK constraint to report.
  IF v_is_template THEN
    RAISE EXCEPTION 'Cannot assign a template assessment';
  END IF;

  IF NEW.classroom_id IS NOT NULL AND NEW.classroom_id <> v_classroom_id THEN
    RAISE EXCEPTION 'Assessment belongs to a different classroom';
  END IF;

  IF NEW.student_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM classroom_students cs
       WHERE cs.student_id = NEW.student_id
         AND cs.classroom_id = v_classroom_id
     )
  THEN
    RAISE EXCEPTION 'Student is not in this assessment''s classroom';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_assignment_scope() IS
  'Assignment guard (decisions 55/62/81): a template is never assignable, and an assessment only reaches its OWN classroom or a student enrolled in it. Role-independent.';

-- ------------------------------------------------------------
-- 5. Creating an assessment: teachers, into a classroom they teach.
--
-- Replaces the P12a policy, which checked only the org. Without the
-- classroom test a teacher could create an assessment owned by a colleague's
-- classroom and have it appear in that classroom's list.
-- ------------------------------------------------------------
DROP POLICY "Create assessments: teachers in own org" ON public.assessments;

CREATE POLICY "Create assessments: teachers in own classroom"
  ON public.assessments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app.is_teacher())
    AND organization_id = (SELECT app.current_org_id())
    AND created_by = (SELECT auth.uid())
    AND classroom_id IS NOT NULL
    AND app.is_classroom_teacher(classroom_id)
  );

-- ------------------------------------------------------------
-- 6. Cloning a template now targets a classroom.
--
-- The caller says WHICH classroom the clone is for; the RPC checks they
-- teach it and that it matches the template's pairing (that pairing is what
-- decides who may use the template at all — decision 62). The clone no
-- longer copies grade_level_id/subject_id: for a non-template the classroom
-- is the single source of truth, and carrying both invites them to diverge.
--
-- The old one-argument signature is dropped rather than kept alongside — a
-- clone with no classroom can no longer satisfy the section 3 CHECK.
-- ------------------------------------------------------------
DROP FUNCTION public.clone_assessment_template(uuid);

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

  INSERT INTO assessment_questions (
    assessment_id, question_id, payload, position, points
  )
  SELECT v_new_id, aq.question_id, aq.payload, aq.position, aq.points
  FROM assessment_questions aq
  WHERE aq.assessment_id = p_template_id;

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION public.clone_assessment_template(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.clone_assessment_template(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clone_assessment_template(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clone_assessment_template(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.clone_assessment_template(uuid, uuid) IS
  'Copy a platform template into one classroom the calling teacher teaches (decisions 60/81). The clone is an editable draft owned by that classroom.';
