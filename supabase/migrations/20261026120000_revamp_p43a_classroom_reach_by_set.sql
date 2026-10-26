-- ============================================================
-- Clavis revamp — P43a: who reaches a classroom, worked out once a query.
--
-- The classroom policies asked app.is_classroom_teacher,
-- app.is_classroom_student and app.is_classroom_staff of every row they
-- read. Those functions cannot be inlined, so each row cost a few
-- queries of its own, and a page of a few classrooms paid for every
-- enrolment, session and teacher row it touched, and classroom_teacher_names
-- for every classroom on the platform.
--
--   D1  The caller's classrooms are read as three sets: the live ones they
--       teach, the live ones they are a student of, and the ones they
--       follow as staff (those they teach, and every classroom of their
--       organization for a manager). Who reaches what is unchanged.
--   D2  The policies, and classroom_teacher_names, test a row against a
--       set read once for the whole query, written `(SELECT …)::uuid[]` so
--       it is worked out before the first row and still compared as an
--       array, which an index can use.
--   D3  app.is_classroom_teacher and app.is_classroom_staff, kept for the
--       functions that check one classroom, answer from the same sets.
--       app.is_classroom_student is no longer used and is dropped.
--   D4  app.taught_classrooms takes NULL for every classroom the caller
--       teaches, so a teacher's dashboard of all of them need not name
--       them first.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The caller's classrooms (D1)
-- ------------------------------------------------------------

CREATE FUNCTION app.taught_classroom_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(ct.classroom_id), '{}')
  FROM public.classroom_teachers ct
  JOIN public.classrooms c ON c.id = ct.classroom_id
  WHERE ct.teacher_id = (SELECT auth.uid())
    AND c.archived_at IS NULL;
$$;

CREATE FUNCTION app.enrolled_classroom_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(cs.classroom_id), '{}')
  FROM public.classroom_students cs
  JOIN public.classrooms c ON c.id = cs.classroom_id
  WHERE cs.student_id = (SELECT auth.uid())
    AND c.archived_at IS NULL;
$$;

CREATE FUNCTION app.staff_classroom_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.taught_classroom_ids() || coalesce(
    (
      SELECT array_agg(c.id)
      FROM public.classrooms c
      WHERE (SELECT app.is_manager())
        AND c.organization_id = (SELECT app.current_org_id())
    ),
    '{}'
  );
$$;

ALTER FUNCTION app.taught_classroom_ids() OWNER TO postgres;
ALTER FUNCTION app.enrolled_classroom_ids() OWNER TO postgres;
ALTER FUNCTION app.staff_classroom_ids() OWNER TO postgres;
REVOKE ALL ON FUNCTION app.taught_classroom_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app.enrolled_classroom_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app.staff_classroom_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.taught_classroom_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.enrolled_classroom_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.staff_classroom_ids() TO authenticated, service_role;

COMMENT ON FUNCTION app.taught_classroom_ids() IS
  'The live classrooms the caller teaches.';
COMMENT ON FUNCTION app.enrolled_classroom_ids() IS
  'The live classrooms the caller is a student of.';
COMMENT ON FUNCTION app.staff_classroom_ids() IS
  'The classrooms the caller follows as staff: the live ones they teach, '
  'and for a manager every classroom of their organization.';


-- ------------------------------------------------------------
-- 2. One classroom, from the same sets (D3)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.is_classroom_teacher(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_classroom_id = ANY (app.taught_classroom_ids());
$$;

CREATE OR REPLACE FUNCTION app.is_classroom_staff(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_classroom_id = ANY (app.staff_classroom_ids());
$$;


-- ------------------------------------------------------------
-- 3. The policies (D2)
-- ------------------------------------------------------------

ALTER POLICY "Read classrooms: manager org, member teacher/student" ON public.classrooms
  USING (
    ((SELECT app.is_manager()) AND organization_id = (SELECT app.current_org_id()))
    OR id = ANY ((SELECT app.taught_classroom_ids())::uuid[])
    OR id = ANY ((SELECT app.enrolled_classroom_ids())::uuid[])
  );

ALTER POLICY "Read classroom students: self, classroom staff" ON public.classroom_students
  USING (
    (student_id = (SELECT auth.uid()) AND classroom_id = ANY ((SELECT app.enrolled_classroom_ids())::uuid[]))
    OR classroom_id = ANY ((SELECT app.staff_classroom_ids())::uuid[])
  );

ALTER POLICY "Read classroom teachers: classroom staff" ON public.classroom_teachers
  USING (classroom_id = ANY ((SELECT app.staff_classroom_ids())::uuid[]));

ALTER POLICY "Read practice sessions: self, admin, classroom staff" ON public.practice_sessions
  USING (
    student_id = (SELECT auth.uid())
    OR (SELECT app.is_admin())
    OR classroom_id = ANY ((SELECT app.staff_classroom_ids())::uuid[])
  );

ALTER POLICY "Read assignments: classroom staff, a student given it" ON public.assignments
  USING (
    classroom_id = ANY ((SELECT app.staff_classroom_ids())::uuid[])
    OR EXISTS (
      SELECT 1
      FROM public.assignment_students s
      WHERE s.assignment_id = assignments.id
        AND s.student_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Delete assignments: classroom teacher" ON public.assignments
  USING (classroom_id = ANY ((SELECT app.taught_classroom_ids())::uuid[]));

ALTER POLICY "Read assignment students: self, classroom staff" ON public.assignment_students
  USING (
    (student_id = (SELECT auth.uid()) AND classroom_id = ANY ((SELECT app.enrolled_classroom_ids())::uuid[]))
    OR classroom_id = ANY ((SELECT app.staff_classroom_ids())::uuid[])
  );


-- ------------------------------------------------------------
-- 4. Teacher names (D2)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.classroom_teacher_names()
 RETURNS TABLE (classroom_id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT ct.classroom_id, p.name
  FROM public.classroom_teachers ct
  JOIN public.profiles p ON p.id = ct.teacher_id
  WHERE ct.classroom_id = ANY ((SELECT app.staff_classroom_ids() || app.enrolled_classroom_ids())::uuid[])
  ORDER BY p.name;
$function$;

DROP FUNCTION app.is_classroom_student(uuid);


-- ------------------------------------------------------------
-- 5. Every classroom a teacher teaches (D4)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.taught_classrooms(p_classroom_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id
  FROM unnest(app.taught_classroom_ids()) AS id
  WHERE p_classroom_ids IS NULL OR id = ANY (p_classroom_ids);
$$;

COMMENT ON FUNCTION app.taught_classrooms(uuid[]) IS
  'Of the classrooms named, those the caller teaches and that are live; '
  'every one of them for NULL.';
