-- ============================================================
-- Clavis 2.4 revamp — P8a: assessment grade + subject scoping
--
-- Decisions 60-62:
--   60. Templates REQUIRE a (grade_level_id, subject_id) pairing. A normal
--       assessment may be unscoped (both NULL — today's behaviour) or scoped
--       (both set — what a clone inherits). The half-set state is forbidden.
--   61. Template visibility is grade+subject MATCHED: a manager/teacher only
--       sees a template when they have a matching classroom (teacher = a
--       classroom they teach; manager = any classroom in their org). Admin
--       sees everything. The template's questions follow the same gate, so
--       there is no preview leak.
--   62. A clone inherits the pairing, and a SCOPED assessment can only be
--       assigned to a matching classroom, or to a student who belongs to at
--       least one matching classroom (this closes the bypass of assigning a
--       scoped assessment to every student individually). Enforced by the
--       existing BEFORE trigger on assessment_assignments, which is
--       role-independent and therefore also binds admin and service_role.
--
-- Decision 64: nothing about students changes. No student-facing path is
-- touched — templates stay student-invisible and unassignable, and the
-- P3a/P6a attempt contracts (get_attempt_questions / get_attempt_result /
-- grade_attempt_answer / the attempt_answers.is_correct revoke) are not
-- referenced here at all.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Schema: the (grade_level_id, subject_id) pairing + its CHECK
--
-- ON DELETE RESTRICT matches public.classrooms (P6a): a grade level or
-- subject that an assessment is scoped to cannot silently vanish.
--
-- Templates authored BEFORE decision 60 have no pairing and cannot be given
-- one automatically (their scope is editorial, not derivable). They are
-- deleted so the CHECK below can be validated: the only such rows are the
-- staging seed's demo templates, which supabase/seed.sql re-creates WITH a
-- pairing. Prod has none (P7a has not shipped to prod; this migration and
-- P7a's land in the same deploy). Normal assessments are untouched — they
-- simply become unscoped (NULL, NULL), which the CHECK allows.
-- ------------------------------------------------------------
DELETE FROM public.assessments WHERE is_template;

ALTER TABLE public.assessments
  ADD COLUMN grade_level_id uuid REFERENCES public.grade_levels(id) ON DELETE RESTRICT,
  ADD COLUMN subject_id     uuid REFERENCES public.subjects(id)     ON DELETE RESTRICT;

ALTER TABLE public.assessments
  ADD CONSTRAINT assessments_scope_check
  CHECK (
    -- never half-set: an assessment is either unscoped or fully scoped
    ((grade_level_id IS NULL) = (subject_id IS NULL))
    -- a template is ALWAYS scoped
    AND (NOT is_template OR grade_level_id IS NOT NULL)
  );

COMMENT ON COLUMN public.assessments.grade_level_id IS
  'Grade level this assessment targets. Required for templates (decision 60); NULL together with subject_id for an unscoped org assessment.';

COMMENT ON COLUMN public.assessments.subject_id IS
  'Subject this assessment targets. Required for templates (decision 60); NULL together with grade_level_id for an unscoped org assessment.';

-- Pairing lookups (RLS matching, template library filters) + the subject FK.
CREATE INDEX idx_assessments_grade_subject
  ON public.assessments USING btree (grade_level_id, subject_id);

CREATE INDEX idx_assessments_subject
  ON public.assessments USING btree (subject_id);

-- ------------------------------------------------------------
-- 2. Helper: does the CALLER have a classroom with this exact pairing?
--
--   teacher -> a classroom they teach (classroom_teachers)
--   manager -> any classroom in their org
--   admin   -> true (platform-wide)
--   anyone else (student/anon) -> false
--
-- SECURITY DEFINER (RLS-bypassing) so policies reach classrooms +
-- classroom_teachers without adding an edge to the policy dependency graph,
-- exactly as app.is_classroom_teacher / teacher_shares_classroom_with_student
-- do (P6a/P6d). Empty search_path, owner postgres.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.has_matching_classroom(
  p_grade_level_id uuid,
  p_subject_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN app.is_admin() THEN true
    WHEN p_grade_level_id IS NULL OR p_subject_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.classrooms c
      WHERE c.grade_level_id = p_grade_level_id
        AND c.subject_id = p_subject_id
        AND (
          EXISTS (
            SELECT 1 FROM public.classroom_teachers ct
            WHERE ct.classroom_id = c.id
              AND ct.teacher_id = auth.uid()
          )
          OR (app.is_manager() AND c.organization_id = app.current_org_id())
        )
    )
  END;
$$;

COMMENT ON FUNCTION app.has_matching_classroom(uuid, uuid) IS
  'True when the caller has a classroom with this exact grade+subject pairing (teacher: one they teach; manager: any in their org; admin: always). Decision 61.';

-- Is this assessment a template the CALLER is allowed to see? (decision 61)
-- Used by the assessment_questions template branch, which only has the
-- assessment id to work with — same gate as the assessments policy.
CREATE OR REPLACE FUNCTION app.assessment_template_visible(p_assessment_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assessments a
    WHERE a.id = p_assessment_id
      AND a.is_template
      AND app.has_matching_classroom(a.grade_level_id, a.subject_id)
  );
$$;

COMMENT ON FUNCTION app.assessment_template_visible(uuid) IS
  'True when the assessment is a template whose grade+subject matches one of the caller''s classrooms (admin: any template). Decision 61.';

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'app.has_matching_classroom(uuid, uuid)',
    'app.assessment_template_visible(uuid)'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 3. RLS: templates are visible to MATCHED org staff only (decision 61)
--
-- Replaces P7a's "Read assessment templates: org staff" (which showed every
-- template to every manager/teacher). Admin is unaffected — it reads every
-- row through the pre-existing "Admins manage assessments" FOR ALL policy.
-- The org-scoped policies for NON-template assessments are untouched.
-- ------------------------------------------------------------
DROP POLICY "Read assessment templates: org staff" ON public.assessments;

CREATE POLICY "Read assessment templates: matched org staff"
  ON public.assessments
  FOR SELECT
  TO authenticated
  USING (
    is_template
    AND (SELECT app.is_org_staff())
    AND app.has_matching_classroom(grade_level_id, subject_id)
  );

-- Same gate on the template branch of assessment_questions: a template the
-- caller may not see must not leak through its questions either. The
-- P3a-fix "Read assessment questions: staff only" policy is untouched (it
-- covers admin + own-org assessments).
DROP POLICY "Read assessment questions: templates for org staff" ON public.assessment_questions;

CREATE POLICY "Read assessment questions: matched templates for org staff"
  ON public.assessment_questions
  FOR SELECT
  TO authenticated
  USING (
    (SELECT app.is_org_staff())
    AND app.assessment_template_visible(assessment_id)
  );

-- ------------------------------------------------------------
-- 4. Assignment guard, extended (decision 62)
--
-- P7a's trigger only rejected templates. It now also enforces the scope of a
-- SCOPED assessment on BOTH target branches:
--   * classroom target -> the classroom's grade_level_id AND subject_id must
--     equal the assessment's pairing;
--   * student target   -> the student must belong to >= 1 classroom with that
--     pairing (otherwise "assign to every student individually" would bypass
--     the classroom rule).
-- An UNSCOPED assessment (NULL pairing) keeps today's behaviour exactly.
--
-- Still a trigger, not a policy clause: RLS does not gate the admin FOR ALL
-- policy or service_role, and a CHECK cannot reach another table. This is the
-- one place that binds EVERY role.
--
-- Renamed reject_template_assignment -> enforce_assignment_scope: the guard
-- is no longer only about templates.
-- ------------------------------------------------------------
DROP TRIGGER trg_reject_template_assignment ON public.assessment_assignments;
DROP FUNCTION public.reject_template_assignment();

CREATE OR REPLACE FUNCTION public.enforce_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_template boolean;
  v_grade_level_id uuid;
  v_subject_id uuid;
BEGIN
  SELECT a.is_template, a.grade_level_id, a.subject_id
    INTO v_is_template, v_grade_level_id, v_subject_id
  FROM assessments a
  WHERE a.id = NEW.assessment_id;

  -- A missing assessment is left to the FK constraint to report.
  IF v_is_template THEN
    RAISE EXCEPTION 'Cannot assign a template assessment';
  END IF;

  -- Unscoped assessment: no grade/subject restriction (today's behaviour).
  IF v_grade_level_id IS NULL OR v_subject_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.classroom_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM classrooms c
       WHERE c.id = NEW.classroom_id
         AND c.grade_level_id = v_grade_level_id
         AND c.subject_id = v_subject_id
     )
  THEN
    RAISE EXCEPTION 'Classroom does not match the assessment grade and subject';
  END IF;

  IF NEW.student_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM classroom_students cs
       JOIN classrooms c ON c.id = cs.classroom_id
       WHERE cs.student_id = NEW.student_id
         AND c.grade_level_id = v_grade_level_id
         AND c.subject_id = v_subject_id
     )
  THEN
    RAISE EXCEPTION 'Student is not in a classroom matching the assessment grade and subject';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_assignment_scope() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_assignment_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_assignment_scope() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_assignment_scope() FROM authenticated;

CREATE TRIGGER trg_enforce_assignment_scope
  BEFORE INSERT OR UPDATE ON public.assessment_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_assignment_scope();

COMMENT ON FUNCTION public.enforce_assignment_scope() IS
  'Assignment guard (decisions 55/62): a template is never assignable, and a scoped assessment only reaches a matching classroom or a student who is in one. Role-independent.';

-- ------------------------------------------------------------
-- 5. clone_assessment_template: the clone inherits the pairing
--
-- Two changes vs P7a:
--   * grade_level_id + subject_id are copied onto the clone, so the clone is
--     scoped and the extended assignment guard applies to it (decision 62).
--   * the caller must have a matching classroom. The RPC is SECURITY DEFINER,
--     so without this check it would hand a manager/teacher the full contents
--     of a template that decision 61 hides from them.
-- Everything else (errors, ownership, question copy) is unchanged.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clone_assessment_template(p_template_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_org_id uuid;
  v_template assessments%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only org staff (manager or teacher) clone; admins author templates.
  IF NOT app.is_org_staff() THEN
    RAISE EXCEPTION 'Only managers and teachers can clone templates';
  END IF;

  v_org_id := app.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no organization';
  END IF;

  SELECT * INTO v_template
  FROM assessments
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  IF NOT v_template.is_template THEN
    RAISE EXCEPTION 'Assessment is not a template: %', p_template_id;
  END IF;

  IF NOT app.has_matching_classroom(v_template.grade_level_id, v_template.subject_id) THEN
    RAISE EXCEPTION 'No classroom matches this template grade and subject';
  END IF;

  -- The clone is a normal, editable draft owned by the caller in their org,
  -- carrying the template's grade+subject scope.
  INSERT INTO assessments (
    organization_id, created_by, title, description,
    status, time_limit_seconds, shuffle_questions, is_template,
    grade_level_id, subject_id
  )
  VALUES (
    v_org_id, v_caller, v_template.title, v_template.description,
    'draft', v_template.time_limit_seconds, v_template.shuffle_questions, false,
    v_template.grade_level_id, v_template.subject_id
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

COMMENT ON FUNCTION public.clone_assessment_template(uuid) IS
  'Clones a platform template (matching one of the caller''s classrooms) into a new org-scoped editable draft owned by the calling manager/teacher, inheriting its grade+subject and questions. Returns the new assessment id.';
