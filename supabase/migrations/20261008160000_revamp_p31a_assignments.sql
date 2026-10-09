-- ============================================================
-- Clavis revamp — P31a: assignments, their notifications, and a finished
-- practice session read back.
--
--   D1  A teacher assigns a stage of a classroom's subject to students of
--       that classroom, with or without a due date (`assignments`, and one
--       row a student in `assignment_students`). The students are the ones
--       named when it is assigned: someone who joins the classroom later is
--       not given what was assigned before, and someone who leaves it takes
--       their row with them.
--   D2  An assignment is done by finishing its stage once, in its classroom,
--       after it was assigned, whatever the score. submit_practice_session
--       records the session that did it (`assignment_students.session_id`).
--       A due date closes nothing: a session finished after it does the
--       assignment all the same, and is late.
--   D3  Every teacher of the classroom reads its assignments and may delete
--       one; a student reads the ones given to them. The managers of the
--       organization read them as they read the classroom's practice.
--   D4  The teacher who assigned a stage is told of each student who does it.
--       Nothing more is stored for that than whether they have seen it
--       (`assignment_students.seen_at`): a notification is a done row of an
--       assignment the caller made. list_notifications reads them and
--       mark_notifications_seen marks them.
--   D5  Whoever may read a finished practice session may read it back as
--       the page a pupil is shown when they finish: the stage, the answers
--       given and how each was marked (review_practice_session). Its student
--       is never handed a right answer, there as on that page. The staff who
--       read it are: they are handed the answer key of each question too.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The tables (D1)
-- ------------------------------------------------------------

CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms (id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.stages (id) ON DELETE CASCADE,
  -- The assignment outlives the account of the teacher who made it.
  assigned_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- What assignment_students refers to, so that a row there is of the
  -- assignment's own classroom.
  CONSTRAINT assignments_id_classroom_key UNIQUE (id, classroom_id),
  CONSTRAINT assignments_due_after_assigned CHECK (due_at IS NULL OR due_at > created_at)
);

CREATE INDEX idx_assignments_classroom ON public.assignments (classroom_id);
CREATE INDEX idx_assignments_stage ON public.assignments (stage_id);
CREATE INDEX idx_assignments_assigned_by ON public.assignments (assigned_by);

COMMENT ON TABLE public.assignments IS
  'A stage a teacher has assigned in a classroom. Who it was given to is in '
  'assignment_students.';
COMMENT ON COLUMN public.assignments.due_at IS
  'The moment it is due; NULL for none. It closes nothing: an assignment '
  'done after it is late.';

CREATE TABLE public.assignment_students (
  assignment_id uuid NOT NULL,
  classroom_id uuid NOT NULL,
  student_id uuid NOT NULL,
  session_id uuid REFERENCES public.practice_sessions (id) ON DELETE SET NULL,
  seen_at timestamptz,
  PRIMARY KEY (assignment_id, student_id),
  CONSTRAINT assignment_students_assignment_fkey
    FOREIGN KEY (assignment_id, classroom_id)
    REFERENCES public.assignments (id, classroom_id) ON DELETE CASCADE,
  -- Only a student of the classroom is given its assignments, and one who
  -- leaves it is no longer counted among those who have yet to do them.
  CONSTRAINT assignment_students_student_fkey
    FOREIGN KEY (classroom_id, student_id)
    REFERENCES public.classroom_students (classroom_id, student_id) ON DELETE CASCADE
);

CREATE INDEX idx_assignment_students_student
  ON public.assignment_students (classroom_id, student_id);
CREATE INDEX idx_assignment_students_session ON public.assignment_students (session_id);

COMMENT ON TABLE public.assignment_students IS
  'One student an assignment was given to.';
COMMENT ON COLUMN public.assignment_students.session_id IS
  'The practice session that did the assignment: the student''s first of its '
  'stage in its classroom after it was assigned. NULL until then.';
COMMENT ON COLUMN public.assignment_students.seen_at IS
  'When the teacher who assigned it saw that this student had done it; NULL '
  'until then.';

-- ------------------------------------------------------------
-- 2. Who reads and deletes them (D3)
-- ------------------------------------------------------------
-- Neither table is written to directly: assign_stage gives an assignment,
-- submit_practice_session does one and mark_notifications_seen marks it seen.

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_students ENABLE ROW LEVEL SECURITY;

-- This policy names its classroom itself and never reads `assignments`: the
-- policy on `assignments` reads this table, and two policies that read each
-- other do not run.
CREATE POLICY "Read assignment students: self, classroom staff"
  ON public.assignment_students FOR SELECT TO authenticated
  USING (
    (student_id = (SELECT auth.uid()) AND app.is_classroom_student(classroom_id))
    OR app.is_classroom_staff(classroom_id)
  );

CREATE POLICY "Read assignments: classroom staff, a student given it"
  ON public.assignments FOR SELECT TO authenticated
  USING (
    app.is_classroom_staff(classroom_id)
    OR EXISTS (
      SELECT 1
      FROM public.assignment_students s
      WHERE s.assignment_id = assignments.id
        AND s.student_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Delete assignments: classroom teacher"
  ON public.assignments FOR DELETE TO authenticated
  USING (app.is_classroom_teacher(classroom_id));

REVOKE ALL ON TABLE public.assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.assignments TO authenticated;
GRANT ALL ON TABLE public.assignments TO service_role;

REVOKE ALL ON TABLE public.assignment_students FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.assignment_students TO authenticated;
GRANT ALL ON TABLE public.assignment_students TO service_role;

-- ------------------------------------------------------------
-- 3. Assigning a stage (D1)
-- ------------------------------------------------------------

CREATE FUNCTION public.assign_stage(
  p_classroom_id uuid,
  p_stage_id uuid,
  p_student_ids uuid[],
  p_due_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_assignment_id uuid;
BEGIN
  IF NOT app.is_classroom_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'Not a teacher of classroom %', p_classroom_id;
  END IF;

  -- A classroom is assigned the stages its students can practise there:
  -- those of its own subject that have a question.
  IF NOT EXISTS (
    SELECT 1
    FROM public.stages sg
    JOIN public.topics t ON t.id = sg.topic_id
    JOIN public.classrooms c ON c.subject_id = t.subject_id
    WHERE sg.id = p_stage_id
      AND c.id = p_classroom_id
      AND EXISTS (SELECT 1 FROM public.questions q WHERE q.stage_id = sg.id)
  ) THEN
    RAISE EXCEPTION 'Stage % cannot be practised in classroom %', p_stage_id, p_classroom_id;
  END IF;

  IF COALESCE(cardinality(p_student_ids), 0) = 0 THEN
    RAISE EXCEPTION 'An assignment is given to at least one student';
  END IF;

  INSERT INTO public.assignments (classroom_id, stage_id, assigned_by, due_at)
  VALUES (p_classroom_id, p_stage_id, (SELECT auth.uid()), p_due_at)
  RETURNING id INTO v_assignment_id;

  -- The foreign key refuses anyone who is not a student of the classroom.
  INSERT INTO public.assignment_students (assignment_id, classroom_id, student_id)
  SELECT DISTINCT v_assignment_id, p_classroom_id, s.student_id
  FROM unnest(p_student_ids) AS s(student_id);

  RETURN v_assignment_id;
END;
$$;

ALTER FUNCTION public.assign_stage(uuid, uuid, uuid[], timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_stage(uuid, uuid, uuid[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_stage(uuid, uuid, uuid[], timestamptz)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.assign_stage(uuid, uuid, uuid[], timestamptz) IS
  'Assigns a stage in a classroom to the students named, due at p_due_at or '
  'never when it is NULL, and returns the assignment''s id. Refused unless '
  'the caller is a teacher of the classroom, the classroom is live, the stage '
  'is of its subject and has a question, and every student named is a '
  'student of it.';

-- ------------------------------------------------------------
-- 4. Doing an assignment (D2)
-- ------------------------------------------------------------
-- submit_practice_session as P26a wrote it, and then the assignments the
-- session does.

CREATE OR REPLACE FUNCTION public.submit_practice_session(
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

  -- The session does every assignment of this stage that the student was
  -- given in this classroom and had yet to do. One already done keeps the
  -- session that did it.
  UPDATE public.assignment_students s
  SET session_id = v_session_id
  FROM public.assignments a
  WHERE a.id = s.assignment_id
    AND a.stage_id = p_stage_id
    AND s.classroom_id = p_classroom_id
    AND s.student_id = (SELECT auth.uid())
    AND s.session_id IS NULL;

  RETURN v_marked;
END;
$$;

COMMENT ON FUNCTION public.submit_practice_session(uuid, uuid, jsonb) IS
  'Records one finished practice session of the caller on a stage, in a '
  'classroom, and hands back how it was marked. p_answers = [{question_id, '
  'selected_options, text_answer, response}], read as app.stage_answers reads '
  'them: every question of the stage counts and one left out earns nothing. '
  'Returns app.mark_stage_answers'' {marks, total, questions: [{question_id, '
  'correct, total, right, marks, tips}]}, never a right answer. The session '
  'does every assignment of the stage the caller was given in the classroom '
  'and had yet to do. Refused unless the caller is a student of the '
  'classroom, the classroom is live and the stage is of its subject.';

-- ------------------------------------------------------------
-- 5. Notifications (D4)
-- ------------------------------------------------------------

-- It runs as the caller, so it reads what they may read and no more: an
-- assignment in a classroom they no longer teach is not among them.
CREATE FUNCTION public.list_notifications()
RETURNS TABLE (
  assignment_id uuid,
  classroom_id uuid,
  student_id uuid,
  student_name text,
  stage_name text,
  marks numeric,
  total integer,
  done_at timestamptz,
  seen boolean,
  unread bigint
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    a.id,
    a.classroom_id,
    s.student_id,
    p.name,
    sg.name,
    ps.marks,
    ps.total_questions,
    ps.completed_at,
    s.seen_at IS NOT NULL,
    -- Counted over every one of them, before the latest are taken.
    count(*) FILTER (WHERE s.seen_at IS NULL) OVER ()
  FROM public.assignments a
  JOIN public.assignment_students s ON s.assignment_id = a.id
  JOIN public.practice_sessions ps ON ps.id = s.session_id
  JOIN public.profiles p ON p.id = s.student_id
  JOIN public.stages sg ON sg.id = a.stage_id
  WHERE a.assigned_by = (SELECT auth.uid())
  ORDER BY ps.completed_at DESC
  LIMIT 30;
$$;

REVOKE ALL ON FUNCTION public.list_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_notifications() TO authenticated, service_role;

COMMENT ON FUNCTION public.list_notifications() IS
  'The caller''s notifications, the latest thirty: one for each student who '
  'has done an assignment the caller made, with the score of the session '
  'that did it. `unread` is how many the caller has not seen, the same on '
  'every row and counted beyond the thirty.';

CREATE FUNCTION public.mark_notifications_seen(p_assignment_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.assignment_students s
  SET seen_at = now()
  FROM public.assignments a
  WHERE a.id = s.assignment_id
    AND a.assigned_by = (SELECT auth.uid())
    AND (p_assignment_id IS NULL OR a.id = p_assignment_id)
    AND s.session_id IS NOT NULL
    AND s.seen_at IS NULL;
$$;

ALTER FUNCTION public.mark_notifications_seen(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_notifications_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_seen(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.mark_notifications_seen(uuid) IS
  'Marks the caller''s notifications as seen: those of one assignment, or '
  'all of them when p_assignment_id is NULL. Only an assignment the caller '
  'made is touched.';

-- ------------------------------------------------------------
-- 6. A finished session, read back (D5)
-- ------------------------------------------------------------

CREATE FUNCTION public.review_practice_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.practice_sessions;
  v_answers jsonb;
  v_marked jsonb;
  v_key jsonb;
BEGIN
  -- Whoever the read policy on practice_sessions lets read the session.
  SELECT ps.*
  INTO v_session
  FROM public.practice_sessions ps
  WHERE ps.id = p_session_id
    AND ps.completed_at IS NOT NULL
    AND (
      ps.student_id = (SELECT auth.uid())
      OR (SELECT app.is_admin())
      OR app.is_classroom_staff(ps.classroom_id)
    );

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- The answers as they were handed in. A question deleted since is left
  -- out: there is nothing left to show it by.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('question_id', pa.question_id)
      || CASE WHEN pa.selected_options IS NULL THEN '{}'::jsonb
              ELSE jsonb_build_object('selected_options', to_jsonb(pa.selected_options)) END
      || CASE WHEN pa.text_answer IS NULL THEN '{}'::jsonb
              ELSE jsonb_build_object('text_answer', pa.text_answer) END
      || CASE WHEN pa.response IS NULL THEN '{}'::jsonb
              ELSE jsonb_build_object('response', pa.response) END
    ),
    '[]'::jsonb
  )
  INTO v_answers
  FROM public.practice_answers pa
  WHERE pa.session_id = p_session_id
    AND pa.question_id IS NOT NULL;

  -- Marked again, for which parts were right and for the tips, neither of
  -- which is stored. A question that came into the stage after the session
  -- is not one of the session's.
  v_marked := app.mark_stage_answers(v_session.stage_id, v_answers);

  -- The answer key is for the staff who follow the session. Its student is
  -- never handed the answer to a question, here or anywhere.
  IF v_session.student_id IS DISTINCT FROM (SELECT auth.uid())
     AND ((SELECT app.is_admin()) OR app.is_classroom_staff(v_session.classroom_id))
  THEN
    SELECT COALESCE(jsonb_object_agg(q.id, q.payload), '{}'::jsonb)
    INTO v_key
    FROM public.questions q
    WHERE q.id IN (
      SELECT pa.question_id
      FROM public.practice_answers pa
      WHERE pa.session_id = p_session_id
    );
  END IF;

  RETURN jsonb_build_object(
    'student_id', v_session.student_id,
    'classroom_id', v_session.classroom_id,
    'completed_at', v_session.completed_at,
    -- Dealt by the session's own id, so it reads the same every time.
    'run', app.serve_stage(v_session.stage_id, p_session_id::text),
    'answers', v_answers,
    'key', v_key,
    'marked', jsonb_build_object(
      -- The score is the one on record.
      'marks', v_session.marks,
      'total', v_session.total_questions,
      'questions', COALESCE(
        (
          SELECT jsonb_agg(q.elem ORDER BY q.ord)
          FROM jsonb_array_elements(v_marked->'questions') WITH ORDINALITY AS q(elem, ord)
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements(v_answers) AS a(elem)
            WHERE a.elem->>'question_id' = q.elem->>'question_id'
          )
        ),
        '[]'::jsonb
      )
    )
  );
END;
$$;

ALTER FUNCTION public.review_practice_session(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.review_practice_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_practice_session(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.review_practice_session(uuid) IS
  'A finished practice session as the page a pupil is shown on finishing: '
  '{student_id, classroom_id, completed_at, run (app.serve_stage), answers '
  '(as submit_practice_session takes them), marked (app.mark_stage_answers), '
  'key}. NULL unless the caller may read the session: its student, a teacher '
  'of its classroom, a manager of its organization or an admin. The score is '
  'the one on record; the questions are read as they stand now, so one changed '
  'since is marked by what it now says and one deleted since is left out. '
  '`key` is the payload of each question the session answered, by its id, '
  'answer key included: it is handed to staff and is NULL for the student, '
  'who is never handed a right answer.';
