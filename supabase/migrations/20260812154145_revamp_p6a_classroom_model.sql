-- ============================================================
-- Clavis 2.2 revamp — P6a part 1/2: classroom model rework
--
-- Decisions 47-52. Reshapes the P3 tenancy model:
--   * classes(single teacher_id) -> classrooms(grade_level + subject +
--     name, created_by = manager). The single teacher_id is gone.
--   * class_members -> classroom_students (PK classroom_id, student_id).
--   * new classroom_teachers (PK classroom_id, teacher_id).
--     Both sides are now many-to-many: a teacher/student may be in many
--     classrooms; a classroom holds many of each.
--   * assessment_assignments.class_id -> classroom_id (FK classrooms).
--   * RLS (decisions 48-49): manager CRUD classrooms + INSERT/DELETE/SELECT
--     the join tables in their own org; teacher/student read only their own
--     memberships (a teacher also reads the roster of classrooms they
--     teach); admin all.
--   * Assessment membership (decision 50): a student is assigned an
--     assessment iff a direct student assignment exists OR they belong to
--     an assigned classroom (classroom_students). Builder/assign: teacher
--     targets classrooms they teach (classroom_teachers), manager any org
--     classroom.
--
-- The P3a answer-key / grading-oracle protections are NOT touched:
-- get_attempt_questions / get_attempt_result / the attempt_answers
-- is_correct column revoke / grade_attempt_answer all stay exactly as
-- shipped. app.can_read_attempt / app.can_write_assessment never read the
-- class model, so they are left untouched too.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tear down the single-teacher class model.
--
-- classrooms is a genuinely different shape (grade + subject required, no
-- teacher_id) so we drop and recreate rather than bolt columns on. Any
-- class-targeted assignments cannot survive (they named the dropped
-- classes); direct-student assignments (class_id NULL) do.
-- ------------------------------------------------------------

-- Dashboard RPCs read classes / class_members / classes.teacher_id and are
-- fully reworked in part 2; drop them first. (String-bodied plpgsql keeps no
-- hard dependency on the tables, but get_student_rollups changes an argument
-- NAME, which CREATE OR REPLACE cannot do — so a clean DROP is required.)
DROP FUNCTION IF EXISTS public.get_class_rollups(uuid);
DROP FUNCTION IF EXISTS public.get_student_rollups(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_assessment_completion(uuid);
DROP FUNCTION IF EXISTS public.get_org_overview();
DROP FUNCTION IF EXISTS public.get_platform_totals();

-- assessment_assignments policies reference classes / class_id / the old
-- app.is_class_member — drop them (recreated against classrooms below). The
-- "Admins manage assignments" FOR ALL policy does not touch the class model,
-- so it is left in place.
DROP POLICY "Read assignments: org staff, targeted students" ON public.assessment_assignments;
DROP POLICY "Create assignments: manager org-wide, teacher own classes" ON public.assessment_assignments;
DROP POLICY "Update assignments: manager org-wide, teacher own" ON public.assessment_assignments;
DROP POLICY "Delete assignments: manager org-wide, teacher own" ON public.assessment_assignments;

-- Repoint assessment_assignments.class_id -> classroom_id. Class-targeted
-- rows die with the classes they named; direct-student rows survive.
DELETE FROM public.assessment_assignments WHERE class_id IS NOT NULL;
ALTER TABLE public.assessment_assignments
  DROP CONSTRAINT assessment_assignments_class_id_fkey;
DROP INDEX IF EXISTS public.uq_assessment_assignments_class;
DROP INDEX IF EXISTS public.idx_assessment_assignments_class;
-- RENAME COLUMN auto-rewrites the assessment_assignments_one_target CHECK
-- (num_nonnulls(class_id, student_id) = 1) to reference classroom_id.
ALTER TABLE public.assessment_assignments RENAME COLUMN class_id TO classroom_id;

-- Drop the class model. class_members first (FK to classes), then classes,
-- then the membership helper that read class_members.
DROP TABLE public.class_members;
DROP TABLE public.classes;
DROP FUNCTION IF EXISTS app.is_class_member(uuid);

-- ------------------------------------------------------------
-- 2. classrooms (decision 47): grade + subject + name, manager-created.
-- ------------------------------------------------------------
CREATE TABLE public.classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  grade_level_id uuid NOT NULL
    REFERENCES public.grade_levels(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL
    REFERENCES public.subjects(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_by uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.classrooms OWNER TO postgres;

COMMENT ON TABLE public.classrooms IS
  'Org-scoped classroom = grade level + subject + name (multiple sections of the same grade+subject are allowed). Created by a manager. Teachers and students join via classroom_teachers / classroom_students (many-to-many).';

CREATE INDEX idx_classrooms_organization ON public.classrooms USING btree (organization_id);
CREATE INDEX idx_classrooms_grade_level ON public.classrooms USING btree (grade_level_id);
CREATE INDEX idx_classrooms_subject ON public.classrooms USING btree (subject_id);
CREATE INDEX idx_classrooms_created_by ON public.classrooms USING btree (created_by);

CREATE TRIGGER update_classrooms_updated_at
  BEFORE UPDATE ON public.classrooms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 3. classroom_teachers + classroom_students (decision 48): join tables.
--    PK is the pair; the row is nothing but its key, so no UPDATE grant.
-- ------------------------------------------------------------
CREATE TABLE public.classroom_teachers (
  classroom_id uuid NOT NULL
    REFERENCES public.classrooms(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (classroom_id, teacher_id)
);

ALTER TABLE public.classroom_teachers OWNER TO postgres;

COMMENT ON TABLE public.classroom_teachers IS
  'Teacher membership of a classroom (many-to-many). Managed by the org''s manager.';

CREATE INDEX idx_classroom_teachers_teacher ON public.classroom_teachers USING btree (teacher_id);

CREATE TABLE public.classroom_students (
  classroom_id uuid NOT NULL
    REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id uuid NOT NULL
    REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (classroom_id, student_id)
);

ALTER TABLE public.classroom_students OWNER TO postgres;

COMMENT ON TABLE public.classroom_students IS
  'Student membership of a classroom (many-to-many). Replaces class_members. Managed by the org''s manager.';

CREATE INDEX idx_classroom_students_student ON public.classroom_students USING btree (student_id);

-- ------------------------------------------------------------
-- 4. Repoint the assessment_assignments FK + indexes onto classrooms.
-- ------------------------------------------------------------
ALTER TABLE public.assessment_assignments
  ADD CONSTRAINT assessment_assignments_classroom_id_fkey
  FOREIGN KEY (classroom_id) REFERENCES public.classrooms(id) ON DELETE CASCADE;

CREATE INDEX idx_assessment_assignments_classroom
  ON public.assessment_assignments USING btree (classroom_id);

-- The same classroom may only be assigned once per assessment.
CREATE UNIQUE INDEX uq_assessment_assignments_classroom
  ON public.assessment_assignments (assessment_id, classroom_id)
  WHERE classroom_id IS NOT NULL;

-- ------------------------------------------------------------
-- 5. Membership helpers (schema app, SECURITY DEFINER STABLE, owner
--    postgres, empty search_path, always called wrapped in (SELECT ...)).
--
--    Definer on purpose: the classrooms SELECT policy reaches the join
--    tables to scope teacher/student reads, and each join table's own
--    policy reaches classrooms to scope the manager's org read. Written
--    naively that is a cycle; reading membership through definer functions
--    (which bypass RLS) breaks it, exactly as P3a did for classes <->
--    class_members.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.is_classroom_teacher(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classroom_teachers ct
    WHERE ct.classroom_id = p_classroom_id
      AND ct.teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION app.is_classroom_student(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classroom_students cs
    WHERE cs.classroom_id = p_classroom_id
      AND cs.student_id = auth.uid()
  );
$$;

-- A student sees an assessment iff it is published AND assigned to them —
-- directly OR through a classroom they belong to (decision 50). Repointed
-- from class_members to classroom_students.
CREATE OR REPLACE FUNCTION app.student_assessment_visible(p_assessment_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assessments a
    JOIN public.assessment_assignments aa ON aa.assessment_id = a.id
    WHERE a.id = p_assessment_id
      AND a.status = 'published'
      AND (
        aa.student_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.classroom_students cs
          WHERE cs.classroom_id = aa.classroom_id
            AND cs.student_id = auth.uid()
        )
      )
  );
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'app.is_classroom_teacher(uuid)',
    'app.is_classroom_student(uuid)',
    'app.student_assessment_visible(uuid)'
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
-- 6. Grants. Supabase's default privileges grant ALL on new public tables
--    to anon/authenticated, so every revoke below is load-bearing.
-- ------------------------------------------------------------
REVOKE ALL ON TABLE public.classrooms FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.classrooms TO authenticated;
GRANT ALL ON TABLE public.classrooms TO service_role;

-- No UPDATE on the join tables: the row is nothing but its primary key.
-- Membership changes are add/remove.
REVOKE ALL ON TABLE public.classroom_teachers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.classroom_teachers TO authenticated;
GRANT ALL ON TABLE public.classroom_teachers TO service_role;

REVOKE ALL ON TABLE public.classroom_students FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.classroom_students TO authenticated;
GRANT ALL ON TABLE public.classroom_students TO service_role;

-- ------------------------------------------------------------
-- 7. RLS: classrooms (decision 48)
--    manager CRUD own org · teacher/student SELECT their memberships ·
--    admin all.
-- ------------------------------------------------------------
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage classrooms"
  ON public.classrooms
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Read classrooms: manager org, member teacher/student"
  ON public.classrooms
  FOR SELECT
  TO authenticated
  USING (
    ((SELECT app.is_manager()) AND organization_id = (SELECT app.current_org_id()))
    OR app.is_classroom_teacher(id)
    OR app.is_classroom_student(id)
  );

CREATE POLICY "Create classrooms: manager own org"
  ON public.classrooms
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app.is_manager())
    AND organization_id = (SELECT app.current_org_id())
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY "Update classrooms: manager own org"
  ON public.classrooms
  FOR UPDATE
  TO authenticated
  USING ((SELECT app.is_manager()) AND organization_id = (SELECT app.current_org_id()))
  WITH CHECK ((SELECT app.is_manager()) AND organization_id = (SELECT app.current_org_id()));

CREATE POLICY "Delete classrooms: manager own org"
  ON public.classrooms
  FOR DELETE
  TO authenticated
  USING ((SELECT app.is_manager()) AND organization_id = (SELECT app.current_org_id()));

-- ------------------------------------------------------------
-- 8. RLS: classroom_teachers (decision 48-49)
--    manager INSERT/DELETE/SELECT own org · teacher SELECT own membership
--    (and co-teachers of classrooms they teach) · admin all.
-- ------------------------------------------------------------
ALTER TABLE public.classroom_teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage classroom teachers"
  ON public.classroom_teachers
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Read classroom teachers: self, classroom teacher, manager org"
  ON public.classroom_teachers
  FOR SELECT
  TO authenticated
  USING (
    teacher_id = (SELECT auth.uid())
    OR app.is_classroom_teacher(classroom_id)
    OR (
      (SELECT app.is_manager())
      AND EXISTS (
        SELECT 1 FROM public.classrooms c
        WHERE c.id = public.classroom_teachers.classroom_id
          AND c.organization_id = (SELECT app.current_org_id())
      )
    )
  );

CREATE POLICY "Add classroom teachers: manager own org"
  ON public.classroom_teachers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app.is_manager())
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = public.classroom_teachers.classroom_id
        AND c.organization_id = (SELECT app.current_org_id())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.classroom_teachers.teacher_id
        AND p.organization_id = (SELECT app.current_org_id())
        AND p.user_type = 'teacher'::public.user_role
    )
  );

CREATE POLICY "Remove classroom teachers: manager own org"
  ON public.classroom_teachers
  FOR DELETE
  TO authenticated
  USING (
    (SELECT app.is_manager())
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = public.classroom_teachers.classroom_id
        AND c.organization_id = (SELECT app.current_org_id())
    )
  );

-- ------------------------------------------------------------
-- 9. RLS: classroom_students (decision 48-49)
--    manager INSERT/DELETE/SELECT own org · student SELECT own membership ·
--    teacher SELECT roster of classrooms they teach · admin all.
-- ------------------------------------------------------------
ALTER TABLE public.classroom_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage classroom students"
  ON public.classroom_students
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Read classroom students: self, classroom teacher, manager org"
  ON public.classroom_students
  FOR SELECT
  TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR app.is_classroom_teacher(classroom_id)
    OR (
      (SELECT app.is_manager())
      AND EXISTS (
        SELECT 1 FROM public.classrooms c
        WHERE c.id = public.classroom_students.classroom_id
          AND c.organization_id = (SELECT app.current_org_id())
      )
    )
  );

CREATE POLICY "Add classroom students: manager own org"
  ON public.classroom_students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app.is_manager())
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = public.classroom_students.classroom_id
        AND c.organization_id = (SELECT app.current_org_id())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.classroom_students.student_id
        AND p.organization_id = (SELECT app.current_org_id())
        AND p.user_type = 'student'::public.user_role
    )
  );

CREATE POLICY "Remove classroom students: manager own org"
  ON public.classroom_students
  FOR DELETE
  TO authenticated
  USING (
    (SELECT app.is_manager())
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = public.classroom_students.classroom_id
        AND c.organization_id = (SELECT app.current_org_id())
    )
  );

-- ------------------------------------------------------------
-- 10. RLS: assessment_assignments — recreate against classrooms
--     (decision 50). manager targets any org classroom; teacher targets
--     classrooms they teach (classroom_teachers).
-- ------------------------------------------------------------
CREATE POLICY "Read assignments: org staff, targeted students"
  ON public.assessment_assignments
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT app.is_org_staff())
      AND app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    )
    OR student_id = (SELECT auth.uid())
    OR app.is_classroom_student(classroom_id)
  );

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
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = public.assessment_assignments.student_id
          AND p.organization_id = (SELECT app.current_org_id())
          AND p.user_type = 'student'::public.user_role
      )
    )
  );

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
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = public.assessment_assignments.student_id
          AND p.organization_id = (SELECT app.current_org_id())
          AND p.user_type = 'student'::public.user_role
      )
    )
  );

CREATE POLICY "Delete assignments: manager org-wide, teacher own"
  ON public.assessment_assignments
  FOR DELETE
  TO authenticated
  USING (
    app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    AND ((SELECT app.is_manager()) OR assigned_by = (SELECT auth.uid()))
  );

-- ------------------------------------------------------------
-- 11. start_assessment_attempt — repoint the assignment + due-date reach
--     from class_members to classroom_students (decision 50). Signature,
--     return shape, error strings, ordering and idempotency are unchanged.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_assessment_attempt(p_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid := (SELECT auth.uid());
  v_attempt assessment_attempts%ROWTYPE;
  v_status assessment_status;
  v_time_limit integer;
  v_shuffle boolean;
  v_total integer;
  v_resumed boolean := false;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Attempts are a student-only domain (student_id FKs student_profiles).
  IF NOT EXISTS (SELECT 1 FROM student_profiles WHERE id = v_student_id) THEN
    RAISE EXCEPTION 'Only students can start assessment attempts';
  END IF;

  SELECT a.status, a.time_limit_seconds, a.shuffle_questions
  INTO v_status, v_time_limit, v_shuffle
  FROM assessments a
  WHERE a.id = p_assessment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment not found: %', p_assessment_id;
  END IF;

  -- FOR UPDATE serializes concurrent starts of the same attempt.
  SELECT * INTO v_attempt
  FROM assessment_attempts
  WHERE assessment_id = p_assessment_id
    AND student_id = v_student_id
  FOR UPDATE;

  IF FOUND THEN
    -- One attempt per (assessment, student) — decision 26. Resuming skips
    -- the due-date gate on purpose: an in-flight attempt may always finish.
    IF v_attempt.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Assessment already completed';
    END IF;
    v_resumed := true;
  ELSE
    IF v_status <> 'published' THEN
      RAISE EXCEPTION 'Assessment is not published';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM assessment_assignments aa
      WHERE aa.assessment_id = p_assessment_id
        AND (
          aa.student_id = v_student_id
          OR EXISTS (
            SELECT 1 FROM classroom_students cs
            WHERE cs.classroom_id = aa.classroom_id
              AND cs.student_id = v_student_id
          )
        )
    ) THEN
      RAISE EXCEPTION 'Assessment is not assigned to you';
    END IF;

    -- Due date blocks starting only, and only if EVERY assignment that
    -- reaches this student is past due.
    IF NOT EXISTS (
      SELECT 1
      FROM assessment_assignments aa
      WHERE aa.assessment_id = p_assessment_id
        AND (aa.due_at IS NULL OR aa.due_at > now())
        AND (
          aa.student_id = v_student_id
          OR EXISTS (
            SELECT 1 FROM classroom_students cs
            WHERE cs.classroom_id = aa.classroom_id
              AND cs.student_id = v_student_id
          )
        )
    ) THEN
      RAISE EXCEPTION 'Assessment is past its due date';
    END IF;

    SELECT COUNT(*) INTO v_total
    FROM assessment_questions
    WHERE assessment_id = p_assessment_id;

    IF v_total = 0 THEN
      RAISE EXCEPTION 'Assessment has no questions';
    END IF;

    BEGIN
      INSERT INTO assessment_attempts (assessment_id, student_id, total_questions)
      VALUES (p_assessment_id, v_student_id, v_total)
      RETURNING * INTO v_attempt;
    EXCEPTION WHEN unique_violation THEN
      -- A concurrent start won the race; resume its attempt instead.
      SELECT * INTO v_attempt
      FROM assessment_attempts
      WHERE assessment_id = p_assessment_id
        AND student_id = v_student_id;
      v_resumed := true;
    END;

    IF NOT v_resumed THEN
      -- Freeze the question order for this attempt: shuffled when the
      -- assessment says so, otherwise the builder's position order.
      INSERT INTO attempt_questions (attempt_id, assessment_question_id, question_order)
      SELECT
        v_attempt.id,
        aq.id,
        row_number() OVER (
          ORDER BY CASE WHEN v_shuffle THEN random() END, aq.position, aq.id
        )
      FROM assessment_questions aq
      WHERE aq.assessment_id = p_assessment_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'started_at', v_attempt.started_at,
    'total_questions', v_attempt.total_questions,
    'current_question_index', v_attempt.current_question_index,
    'time_limit_seconds', v_time_limit,
    'expires_at', CASE
      WHEN v_time_limit IS NULL THEN NULL
      ELSE v_attempt.started_at + make_interval(secs => v_time_limit)
    END,
    'resumed', v_resumed
  );
END;
$$;

ALTER FUNCTION public.start_assessment_attempt(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.start_assessment_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_assessment_attempt(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_assessment_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_assessment_attempt(uuid) TO service_role;
