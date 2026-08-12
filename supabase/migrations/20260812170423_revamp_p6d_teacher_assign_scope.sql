-- Revamp P6d — restrict teacher assessment assignment to their classroom students
--
-- Decision (2026-08-13): a TEACHER may only assign an assessment to students
-- WITHIN their own classrooms — for BOTH target branches.
--   * classroom target — already gated by app.is_classroom_teacher (P6a §10),
--     unchanged here.
--   * student target — P6a let ANY org staff (manager OR teacher) name ANY
--     org student. Tighten it: a teacher may name a student only when they
--     share a classroom (the teacher teaches it AND the student is in its
--     classroom_students). Manager stays org-wide. Admin stays unrestricted
--     via the separate "Admins manage assignments" FOR ALL policy (P3a).
--
-- Only the INSERT + UPDATE policies on assessment_assignments change; the read
-- path, delete path, engine tables, and the P3a key-leak protections are all
-- untouched.

-- ------------------------------------------------------------
-- 1. Helper: does the calling teacher share a classroom with this student?
--    SECURITY DEFINER (RLS-bypassing) so the policy can reach both join
--    tables without a recursive policy dependency, exactly as P6a's
--    is_classroom_teacher / is_classroom_student do. Empty search_path,
--    owner postgres, EXECUTE to authenticated + service_role.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.teacher_shares_classroom_with_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classroom_teachers ct
    JOIN public.classroom_students cs ON cs.classroom_id = ct.classroom_id
    WHERE ct.teacher_id = auth.uid()
      AND cs.student_id = p_student_id
  );
$$;

ALTER FUNCTION app.teacher_shares_classroom_with_student(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.teacher_shares_classroom_with_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.teacher_shares_classroom_with_student(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.teacher_shares_classroom_with_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.teacher_shares_classroom_with_student(uuid) TO service_role;

-- ------------------------------------------------------------
-- 2. Recreate the INSERT policy with the tightened student-target branch.
-- ------------------------------------------------------------
DROP POLICY "Create assignments: manager org-wide, teacher own classrooms"
  ON public.assessment_assignments;

CREATE POLICY "Create assignments: manager org-wide, teacher own classrooms"
  ON public.assessment_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app.is_org_staff())
    AND assigned_by = (SELECT auth.uid())
    AND app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    AND (
      classroom_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.classrooms c
        WHERE c.id = public.assessment_assignments.classroom_id
          AND c.organization_id = (SELECT app.current_org_id())
          AND ((SELECT app.is_manager()) OR app.is_classroom_teacher(c.id))
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
        AND (
          (SELECT app.is_manager())
          OR app.teacher_shares_classroom_with_student(public.assessment_assignments.student_id)
        )
      )
    )
  );

-- ------------------------------------------------------------
-- 3. Recreate the UPDATE policy — its WITH CHECK mirrors INSERT, so the same
--    student-target tightening applies. USING clause (who may touch a row) is
--    unchanged: manager org-wide, teacher own rows (assigned_by = self).
-- ------------------------------------------------------------
DROP POLICY "Update assignments: manager org-wide, teacher own"
  ON public.assessment_assignments;

CREATE POLICY "Update assignments: manager org-wide, teacher own"
  ON public.assessment_assignments
  FOR UPDATE
  TO authenticated
  USING (
    app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    AND ((SELECT app.is_manager()) OR assigned_by = (SELECT auth.uid()))
  )
  WITH CHECK (
    app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    AND ((SELECT app.is_manager()) OR assigned_by = (SELECT auth.uid()))
    AND (
      classroom_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.classrooms c
        WHERE c.id = public.assessment_assignments.classroom_id
          AND c.organization_id = (SELECT app.current_org_id())
          AND ((SELECT app.is_manager()) OR app.is_classroom_teacher(c.id))
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
        AND (
          (SELECT app.is_manager())
          OR app.teacher_shares_classroom_with_student(public.assessment_assignments.student_id)
        )
      )
    )
  );
