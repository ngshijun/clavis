-- ============================================================
-- Clavis revamp — P29a: a classroom names its teachers to everyone
-- in it, and only an archived classroom can be deleted.
--
--   D1  public.classroom_teacher_names() hands back, for every
--       classroom the caller reaches, the names of its teachers. A
--       student reaches neither the teacher list nor another person's
--       profile, so this is the one way a pupil's card can say whose
--       classroom it is. It gives a name and nothing else: no id, no
--       email. Staff could read the names themselves; they call this
--       too so there is one reading of them.
--   D2  A manager deletes a classroom only once it is archived (R10.7).
--       Deleting takes every practice session recorded in the
--       classroom with it, so it is a second, deliberate step after
--       putting the classroom away.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Teacher names (D1)
--
-- The same reach as the classrooms SELECT policy: the managers of
-- the classroom's organization, and the teachers and students of a
-- live classroom.
-- ------------------------------------------------------------

CREATE FUNCTION public.classroom_teacher_names()
 RETURNS TABLE (classroom_id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT ct.classroom_id, p.name
  FROM public.classroom_teachers ct
  JOIN public.profiles p ON p.id = ct.teacher_id
  WHERE app.is_classroom_staff(ct.classroom_id)
     OR app.is_classroom_student(ct.classroom_id)
  ORDER BY p.name;
$function$;

REVOKE ALL ON FUNCTION public.classroom_teacher_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classroom_teacher_names() TO authenticated, service_role;


-- ------------------------------------------------------------
-- 2. Delete only what is archived (D2)
-- ------------------------------------------------------------

DROP POLICY "Delete classrooms: manager own org" ON public.classrooms;

CREATE POLICY "Delete classrooms: manager own org, archived"
  ON public.classrooms
  FOR DELETE
  TO authenticated
  USING (
    (SELECT app.is_manager())
    AND organization_id = (SELECT app.current_org_id())
    AND archived_at IS NOT NULL
  );
