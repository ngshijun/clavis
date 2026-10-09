-- ============================================================
-- Clavis revamp — P26a: practice in a classroom, and a classroom's archive.
--
--   D1  A classroom can be archived and restored (`classrooms.archived_at`,
--       NULL while it is live). An archived classroom is seen only by the
--       managers of its organization, who can change nothing in it but
--       restore or delete it. Its teachers and students do not reach it:
--       app.is_classroom_teacher and app.is_classroom_student answer no for
--       an archived classroom, so every policy written on them hides it.
--   D2  Practice is bound to a classroom. A practice session records the
--       classroom it was done in (`practice_sessions.classroom_id`), and a
--       stage is dealt and a session recorded only for a student of that
--       classroom, while it is live, and only a stage of its subject.
--   D3  A classroom's practice is followed by its own staff: the teachers on
--       its list and the managers of its organization, where it used to be
--       any staff of the student's organization.
--   D4  A pupil practises a stage whole. serve_practice_stage deals every
--       question of it, as the admin's preview does (P23c), and
--       submit_practice_session records the session: one answer row a
--       question, the unanswered ones included, and the session's score is
--       its marks (`practice_sessions.marks`), one mark a question shared
--       among its parts. It hands back each question's mark and tips and
--       never a right answer. This replaces the submit that took ten
--       sampled questions and a cycle number and counted whole questions
--       (`correct_count`), and get_session_result, which read that count.
--   D5  Mastery is gone. student_stage_stats (a best score kept for a
--       student and a stage) and the two roll-ups that read it,
--       get_class_rollups and get_student_rollups, are dropped; nothing
--       derives a best score, stars or an at-risk label. What a student has
--       done is the sessions on record, classroom by classroom.
--   D6  Deleting a classroom deletes its practice with it.
--   D7  What only the old practice used goes with it: the three functions
--       that served ten sampled questions and counted the ones seen, the
--       tables session_questions (a session's sample) and
--       student_question_progress (the cycle), and the two columns of
--       seconds, which nothing times any more.
--
-- A session recorded before classrooms were is given the classroom of its
-- subject that its student joined first. A session whose student is in no
-- classroom of its subject is DELETED: there is no classroom it could have
-- been done in. Count them before this runs with
--   SELECT count(*) FROM practice_sessions ps WHERE NOT EXISTS (
--     SELECT 1 FROM classroom_students cs JOIN classrooms c ON c.id = cs.classroom_id
--     WHERE cs.student_id = ps.student_id AND c.subject_id = ps.subject_id);
-- ============================================================

-- ------------------------------------------------------------
-- 1. The archive (D1)
-- ------------------------------------------------------------

ALTER TABLE public.classrooms ADD COLUMN archived_at timestamptz;

COMMENT ON COLUMN public.classrooms.archived_at IS
  'When the classroom was archived; NULL while it is live. An archived '
  'classroom is reached only by the managers of its organization.';

-- A classroom's teacher or student is one only while the classroom is live.
CREATE OR REPLACE FUNCTION app.is_classroom_teacher(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classroom_teachers ct
    JOIN public.classrooms c ON c.id = ct.classroom_id
    WHERE ct.classroom_id = p_classroom_id
      AND ct.teacher_id = auth.uid()
      AND c.archived_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION app.is_classroom_student(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classroom_students cs
    JOIN public.classrooms c ON c.id = cs.classroom_id
    WHERE cs.classroom_id = p_classroom_id
      AND cs.student_id = auth.uid()
      AND c.archived_at IS NULL
  );
$$;

CREATE FUNCTION app.is_classroom_staff(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.is_classroom_teacher(p_classroom_id)
      OR (
        app.is_manager()
        AND EXISTS (
          SELECT 1
          FROM public.classrooms c
          WHERE c.id = p_classroom_id
            AND c.organization_id = app.current_org_id()
        )
      );
$$;

ALTER FUNCTION app.is_classroom_staff(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.is_classroom_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.is_classroom_staff(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION app.is_classroom_staff(uuid) IS
  'Whether the caller follows this classroom: a teacher on its list while it '
  'is live, or a manager of its organization.';


-- An archived classroom changes in one way only: it is restored.
CREATE FUNCTION public.guard_archived_classroom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.archived_at IS NOT NULL
     AND (to_jsonb(NEW) - 'archived_at' - 'updated_at')
         IS DISTINCT FROM (to_jsonb(OLD) - 'archived_at' - 'updated_at')
  THEN
    RAISE EXCEPTION 'Classroom % is archived: restore it to change it', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- The moment it was archived is the database's, whatever was sent.
  IF NEW.archived_at IS NOT NULL THEN
    NEW.archived_at := COALESCE(OLD.archived_at, now());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_archived_classroom
  BEFORE UPDATE ON public.classrooms
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_archived_classroom();


-- Its rosters stand as they were: a manager adds to and removes from a live
-- classroom only. (A cascade from a deleted classroom or account is not a
-- manager's change and passes.)
DROP POLICY "Add classroom students: manager own org" ON public.classroom_students;
CREATE POLICY "Add classroom students: manager own org, live classroom"
  ON public.classroom_students FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT app.is_manager())
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_students.classroom_id
        AND c.organization_id = (SELECT app.current_org_id())
        AND c.archived_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = classroom_students.student_id
        AND p.organization_id = (SELECT app.current_org_id())
        AND p.user_type = 'student'::public.user_role
    )
  );

DROP POLICY "Remove classroom students: manager own org" ON public.classroom_students;
CREATE POLICY "Remove classroom students: manager own org, live classroom"
  ON public.classroom_students FOR DELETE TO authenticated
  USING (
    (SELECT app.is_manager())
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_students.classroom_id
        AND c.organization_id = (SELECT app.current_org_id())
        AND c.archived_at IS NULL
    )
  );

DROP POLICY "Add classroom teachers: manager own org" ON public.classroom_teachers;
CREATE POLICY "Add classroom teachers: manager own org, live classroom"
  ON public.classroom_teachers FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT app.is_manager())
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_teachers.classroom_id
        AND c.organization_id = (SELECT app.current_org_id())
        AND c.archived_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = classroom_teachers.teacher_id
        AND p.organization_id = (SELECT app.current_org_id())
        AND p.user_type = 'teacher'::public.user_role
    )
  );

DROP POLICY "Remove classroom teachers: manager own org" ON public.classroom_teachers;
CREATE POLICY "Remove classroom teachers: manager own org, live classroom"
  ON public.classroom_teachers FOR DELETE TO authenticated
  USING (
    (SELECT app.is_manager())
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_teachers.classroom_id
        AND c.organization_id = (SELECT app.current_org_id())
        AND c.archived_at IS NULL
    )
  );

-- A roster is read by whoever reaches the classroom: its own row no longer
-- shows a student or a teacher a classroom that has been archived.
DROP POLICY "Read classroom students: self, classroom teacher, manager org" ON public.classroom_students;
CREATE POLICY "Read classroom students: self, classroom staff"
  ON public.classroom_students FOR SELECT TO authenticated
  USING (
    (student_id = (SELECT auth.uid()) AND app.is_classroom_student(classroom_id))
    OR app.is_classroom_staff(classroom_id)
  );

DROP POLICY "Read classroom teachers: self, classroom teacher, manager org" ON public.classroom_teachers;
CREATE POLICY "Read classroom teachers: classroom staff"
  ON public.classroom_teachers FOR SELECT TO authenticated
  USING (app.is_classroom_staff(classroom_id));


-- ------------------------------------------------------------
-- 2. A session's classroom (D2)
-- ------------------------------------------------------------

ALTER TABLE public.practice_sessions
  ADD COLUMN classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE;

UPDATE public.practice_sessions ps
SET classroom_id = (
  SELECT c.id
  FROM public.classroom_students cs
  JOIN public.classrooms c ON c.id = cs.classroom_id
  WHERE cs.student_id = ps.student_id
    AND c.subject_id = ps.subject_id
  ORDER BY cs.created_at, c.id
  LIMIT 1
);

DELETE FROM public.practice_sessions WHERE classroom_id IS NULL;

ALTER TABLE public.practice_sessions ALTER COLUMN classroom_id SET NOT NULL;

CREATE INDEX idx_practice_sessions_classroom ON public.practice_sessions (classroom_id);

COMMENT ON COLUMN public.practice_sessions.classroom_id IS
  'The classroom the session was practised in. The session goes when the '
  'classroom is deleted.';


-- ------------------------------------------------------------
-- 3. Mastery is gone (D5)
-- ------------------------------------------------------------

DROP FUNCTION public.get_class_rollups(uuid);
DROP FUNCTION public.get_student_rollups(uuid, uuid);
DROP TABLE public.student_stage_stats;


-- ------------------------------------------------------------
-- 4. A pupil practises a stage, in a classroom (D2, D4)
-- ------------------------------------------------------------

-- A session's score is the marks it earned.
ALTER TABLE public.practice_sessions ADD COLUMN marks numeric(7,4);

UPDATE public.practice_sessions ps
SET marks = COALESCE(
  (SELECT sum(pa.marks) FROM public.practice_answers pa WHERE pa.session_id = ps.id),
  0
);

DROP FUNCTION public.get_session_result(uuid);

ALTER TABLE public.practice_sessions
  ALTER COLUMN marks SET NOT NULL,
  ADD CONSTRAINT practice_sessions_marks_check CHECK (marks >= 0 AND marks <= total_questions),
  DROP COLUMN correct_count;

COMMENT ON COLUMN public.practice_sessions.marks IS
  'The session''s score: the sum of its answers'' marks, out of total_questions '
  'at one mark a question.';

CREATE FUNCTION app.assert_can_practise(p_classroom_id uuid, p_stage_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  -- Practice happens in a classroom: one the caller is a student of, and
  -- that is live. Nobody practises in an archived classroom.
  IF NOT EXISTS (
    SELECT 1
    FROM public.classroom_students cs
    JOIN public.classrooms c ON c.id = cs.classroom_id
    WHERE cs.classroom_id = p_classroom_id
      AND cs.student_id = (SELECT auth.uid())
      AND c.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not a student of classroom %', p_classroom_id;
  END IF;

  -- A classroom practises the stages of its own subject and no others.
  IF NOT EXISTS (
    SELECT 1
    FROM public.stages sg
    JOIN public.topics t ON t.id = sg.topic_id
    JOIN public.classrooms c ON c.subject_id = t.subject_id
    WHERE sg.id = p_stage_id
      AND c.id = p_classroom_id
  ) THEN
    RAISE EXCEPTION 'Stage % is not of the subject of classroom %', p_stage_id, p_classroom_id;
  END IF;
END;
$$;

ALTER FUNCTION app.assert_can_practise(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.assert_can_practise(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.assert_can_practise(uuid, uuid) IS
  'Raises unless the caller may practise the stage in the classroom: a '
  'student of that classroom, which is live, and a stage of its subject. '
  'Internal to the pupil''s practice RPCs.';

CREATE FUNCTION public.serve_practice_stage(p_classroom_id uuid, p_stage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.assert_can_practise(p_classroom_id, p_stage_id);

  RETURN app.serve_stage(p_stage_id, gen_random_uuid()::text);
END;
$$;

ALTER FUNCTION public.serve_practice_stage(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.serve_practice_stage(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.serve_practice_stage(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.serve_practice_stage(uuid, uuid) IS
  'A stage dealt for the caller to practise in a classroom: app.serve_stage, '
  'every question with no key and no tip in it. Each call deals afresh. '
  'Refused unless the caller is a student of that classroom, it is live, and '
  'the stage is of its subject. Records nothing.';

DROP FUNCTION public.submit_practice_session(uuid, integer, jsonb);

CREATE FUNCTION public.submit_practice_session(
  p_classroom_id uuid,
  p_stage_id uuid,
  p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_marked jsonb;
  v_session_id uuid;
BEGIN
  PERFORM app.assert_can_practise(p_classroom_id, p_stage_id);

  v_marked := app.mark_stage_answers(p_stage_id, p_answers);

  IF (v_marked->>'total')::integer = 0 THEN
    RAISE EXCEPTION 'Stage % has no questions', p_stage_id;
  END IF;

  -- The session's grade level and subject are filled in from its stage by
  -- populate_session_hierarchy.
  INSERT INTO public.practice_sessions (
    student_id,
    classroom_id,
    stage_id,
    total_questions,
    marks,
    completed_at
  )
  VALUES (
    (SELECT auth.uid()),
    p_classroom_id,
    p_stage_id,
    (v_marked->>'total')::integer,
    (v_marked->>'marks')::numeric,
    now()
  )
  RETURNING id INTO v_session_id;

  -- One row a question of the stage, an unanswered one with no answer in
  -- it. is_correct is a placeholder: trg_grade_practice_answer marks each
  -- row as it lands, by the grader that marked v_marked and from the same
  -- reading of the answers, so the rows add up to the session's marks.
  INSERT INTO public.practice_answers (
    session_id,
    question_id,
    selected_options,
    text_answer,
    response,
    is_correct
  )
  SELECT
    v_session_id,
    a.question_id,
    a.selected_options,
    a.text_answer,
    a.response,
    FALSE
  FROM app.stage_answers(p_stage_id, p_answers) AS a;

  RETURN v_marked;
END;
$$;

ALTER FUNCTION public.submit_practice_session(uuid, uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_practice_session(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_practice_session(uuid, uuid, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.submit_practice_session(uuid, uuid, jsonb) IS
  'Records one finished practice session of the caller on a stage, in a '
  'classroom, and hands back how it was marked. p_answers = [{question_id, '
  'selected_options, text_answer, response}], read as app.stage_answers reads '
  'them: every question of the stage counts and one left out earns nothing. '
  'Returns app.mark_stage_answers'' {marks, total, questions: [{question_id, '
  'correct, total, marks, tips}]}, never a right answer. Refused unless the '
  'caller is a student of that classroom, it is live, the stage is of its '
  'subject and has a question.';


-- ------------------------------------------------------------
-- 5. Who reads a classroom's practice (D3)
-- ------------------------------------------------------------

DROP POLICY "Read practice sessions: self, admin, same-org staff" ON public.practice_sessions;
CREATE POLICY "Read practice sessions: self, admin, classroom staff"
  ON public.practice_sessions FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR (SELECT app.is_admin())
    OR app.is_classroom_staff(classroom_id)
  );

-- What belongs to a session is read by whoever reads the session: the
-- session's own policy answers inside this.
DROP POLICY "Read practice answers: self, admin, same-org staff" ON public.practice_answers;
CREATE POLICY "Read practice answers: whoever reads the session"
  ON public.practice_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.practice_sessions ps
      WHERE ps.id = practice_answers.session_id
    )
  );


-- ------------------------------------------------------------
-- 6. What only the old practice used (D7)
-- ------------------------------------------------------------

DROP FUNCTION public.get_practice_questions(uuid[]);
DROP FUNCTION public.get_practice_session_questions(uuid);
DROP FUNCTION public.get_stage_answered_counts();

DROP TABLE public.session_questions;
DROP TABLE public.student_question_progress;

ALTER TABLE public.practice_sessions DROP COLUMN total_time_seconds;
ALTER TABLE public.practice_answers DROP COLUMN time_spent_seconds;
