-- ============================================================
-- Clavis — P12a: managers become READ-ONLY on assessments
--
-- Decision 80: a manager manages PEOPLE and reads DATA. Authoring teaching
-- material is a teacher's job. Managers keep full SELECT on their org's
-- assessments, questions, assignments and attempts — the read-only list and
-- results view they still need — and lose every write path:
--
--   * assessments            INSERT / UPDATE / DELETE
--   * assessment_questions   INSERT / UPDATE / DELETE (via can_write_assessment)
--   * assessment_assignments INSERT / UPDATE / DELETE
--
-- The client already hides these controls, but hiding a button is not a
-- boundary: a manager holds an ordinary `authenticated` JWT and can call
-- PostgREST directly, so the rule has to live here.
--
-- Teachers are unaffected: every teacher-side predicate below is copied
-- verbatim from the policy it replaces (P6d for assignment INSERT/UPDATE,
-- P6a for the rest) with only the `app.is_manager()` branch removed. Admins
-- are unaffected — their FOR ALL policies short-circuit all of this.
--
-- NOT touched: the P9b marking and answer-release RPCs. Those are SECURITY
-- DEFINER with their own authz, and letting a manager release answers or
-- settle a marking dispute is squarely "manage", not "author".
-- ============================================================

-- ------------------------------------------------------------
-- 0. Role predicate, mirroring app.is_manager(). Several policies below need
--    "is a teacher" positively, not merely "is org staff and not a manager".
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.is_teacher()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_type = 'teacher'
  );
$$;

COMMENT ON FUNCTION app.is_teacher() IS
  'True when the caller is a teacher. Counterpart of app.is_manager().';

-- ------------------------------------------------------------
-- 1. The shared write predicate for assessment CONTENT.
--    Dropping the manager branch here closes assessment_questions in one
--    place — all three of its write policies call this.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.can_write_assessment(p_assessment_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id = p_assessment_id
      AND (
        app.is_admin()
        OR (
          a.organization_id = app.current_org_id()
          AND a.created_by = auth.uid()
          AND app.is_teacher()
        )
      )
  );
$$;

COMMENT ON FUNCTION app.can_write_assessment(uuid) IS
  'Admin, or the TEACHER who created the assessment within their own org. Managers are read-only on assessments (decision 80).';

-- ------------------------------------------------------------
-- 2. assessments: creation is teacher-only (is_org_staff() included
--    managers); update/delete stay with the creating teacher.
-- ------------------------------------------------------------
DROP POLICY "Create assessments: org staff in own org" ON public.assessments;

CREATE POLICY "Create assessments: teachers in own org"
  ON public.assessments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app.is_teacher())
    AND organization_id = (SELECT app.current_org_id())
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY "Update assessments: manager org-wide, teacher own" ON public.assessments;

CREATE POLICY "Update assessments: creating teacher"
  ON public.assessments
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = (SELECT app.current_org_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT app.is_teacher())
  )
  WITH CHECK (
    organization_id = (SELECT app.current_org_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT app.is_teacher())
  );

DROP POLICY "Delete assessments: manager org-wide, teacher own" ON public.assessments;

CREATE POLICY "Delete assessments: creating teacher"
  ON public.assessments
  FOR DELETE
  TO authenticated
  USING (
    organization_id = (SELECT app.current_org_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT app.is_teacher())
  );

-- ------------------------------------------------------------
-- 3. assessment_assignments: handing work to a class is teaching, so it
--    follows the same rule.
--
--    INSERT/UPDATE are the P6d bodies with the manager branches removed;
--    the classroom target must now be one the caller teaches, and an
--    individually-targeted student must share a classroom with them. The
--    P8a BEFORE trigger that checks the grade+subject pairing still fires
--    on every row and is unchanged.
-- ------------------------------------------------------------
DROP POLICY "Create assignments: manager org-wide, teacher own classrooms"
  ON public.assessment_assignments;

CREATE POLICY "Create assignments: teacher own classrooms"
  ON public.assessment_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app.is_teacher())
    AND assigned_by = (SELECT auth.uid())
    AND app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    AND (
      classroom_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.classrooms c
        WHERE c.id = public.assessment_assignments.classroom_id
          AND c.organization_id = (SELECT app.current_org_id())
          AND app.is_classroom_teacher(c.id)
      )
    )
    AND (
      student_id IS NULL
      OR (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = public.assessment_assignments.student_id
            AND p.organization_id = (SELECT app.current_org_id())
            AND p.user_type = 'student'::public.user_role
        )
        AND app.teacher_shares_classroom_with_student(
          public.assessment_assignments.student_id
        )
      )
    )
  );

DROP POLICY "Update assignments: manager org-wide, teacher own"
  ON public.assessment_assignments;

CREATE POLICY "Update assignments: assigning teacher"
  ON public.assessment_assignments
  FOR UPDATE
  TO authenticated
  USING (
    app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    AND assigned_by = (SELECT auth.uid())
    AND (SELECT app.is_teacher())
  )
  WITH CHECK (
    app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    AND assigned_by = (SELECT auth.uid())
    AND (SELECT app.is_teacher())
    AND (
      classroom_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.classrooms c
        WHERE c.id = public.assessment_assignments.classroom_id
          AND c.organization_id = (SELECT app.current_org_id())
          AND app.is_classroom_teacher(c.id)
      )
    )
    AND (
      student_id IS NULL
      OR (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = public.assessment_assignments.student_id
            AND p.organization_id = (SELECT app.current_org_id())
            AND p.user_type = 'student'::public.user_role
        )
        AND app.teacher_shares_classroom_with_student(
          public.assessment_assignments.student_id
        )
      )
    )
  );

DROP POLICY "Delete assignments: manager org-wide, teacher own"
  ON public.assessment_assignments;

CREATE POLICY "Delete assignments: assigning teacher"
  ON public.assessment_assignments
  FOR DELETE
  TO authenticated
  USING (
    app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    AND assigned_by = (SELECT auth.uid())
    AND (SELECT app.is_teacher())
  );
