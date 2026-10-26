-- ============================================================
-- Clavis revamp — P42a: the teacher's dashboard.
--
-- A teacher's home sums up the live classrooms they teach. What it shows
-- is worked out here from what is on record, and nothing of it is stored
-- (R9.1). Each function takes the classrooms asked for and answers only
-- for those the caller teaches and that are live, so a dashboard of one
-- classroom and of all of them are one call.
--
--   D1  app.taught_classrooms: the caller's live classrooms among those
--       asked for.
--   D2  dashboard_students: everyone enrolled, and whether they finished a
--       practice in the last seven days and in the seven before.
--   D3  dashboard_stage_bests: each student's best session on each stage
--       they have practised, from which their average and stars come.
--   D4  dashboard_learning_points: how each student does on each learning
--       point. A question counts once, by its latest answer, and only the
--       ten questions a student answered last on a learning point count,
--       so the figure is where they stand now. It runs as its owner,
--       since a student's marks question by question are not
--       column-readable (P23b); the others run as the caller.
--   D5  dashboard_weeks: practice finished in each of the last eight
--       weeks, with its average score.
--   D6  dashboard_activity: the latest practice finished.
--
-- Practice is counted only in the classroom it was done in (R8.4), and
-- only of students still enrolled there.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The classrooms a dashboard answers for (D1)
-- ------------------------------------------------------------

CREATE FUNCTION app.taught_classrooms(p_classroom_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ct.classroom_id
  FROM public.classroom_teachers ct
  JOIN public.classrooms c ON c.id = ct.classroom_id
  WHERE ct.teacher_id = (SELECT auth.uid())
    AND c.archived_at IS NULL
    AND ct.classroom_id = ANY (p_classroom_ids);
$$;

ALTER FUNCTION app.taught_classrooms(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.taught_classrooms(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.taught_classrooms(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION app.taught_classrooms(uuid[]) IS
  'Of the classrooms named, those the caller teaches and that are live.';


-- ------------------------------------------------------------
-- 2. The students (D2)
-- ------------------------------------------------------------

CREATE FUNCTION public.dashboard_students(p_classroom_ids uuid[])
RETURNS TABLE (
  classroom_id uuid,
  student_id uuid,
  name text,
  this_week boolean,
  last_week boolean
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    cs.classroom_id,
    cs.student_id,
    p.name,
    EXISTS (
      SELECT 1
      FROM public.practice_sessions ps
      WHERE ps.classroom_id = cs.classroom_id
        AND ps.student_id = cs.student_id
        AND ps.completed_at > now() - interval '7 days'
    ),
    EXISTS (
      SELECT 1
      FROM public.practice_sessions ps
      WHERE ps.classroom_id = cs.classroom_id
        AND ps.student_id = cs.student_id
        AND ps.completed_at > now() - interval '14 days'
        AND ps.completed_at <= now() - interval '7 days'
    )
  FROM public.classroom_students cs
  JOIN public.profiles p ON p.id = cs.student_id
  WHERE cs.classroom_id IN (SELECT app.taught_classrooms(p_classroom_ids))
  ORDER BY p.name;
$$;

REVOKE ALL ON FUNCTION public.dashboard_students(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_students(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.dashboard_students(uuid[]) IS
  'Every student of the caller''s live classrooms among those named, once '
  'for each classroom they are in, with whether they finished a practice '
  'there in the last seven days and in the seven before.';


-- ------------------------------------------------------------
-- 3. Each student's best on each stage (D3)
-- ------------------------------------------------------------

-- The best is the largest share of the stage's marks, and of a tie the
-- latest, as in the app's bestOf.
CREATE FUNCTION public.dashboard_stage_bests(p_classroom_ids uuid[])
RETURNS TABLE (
  classroom_id uuid,
  student_id uuid,
  stage_id uuid,
  marks numeric,
  total integer
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT DISTINCT ON (ps.classroom_id, ps.student_id, ps.stage_id)
    ps.classroom_id,
    ps.student_id,
    ps.stage_id,
    ps.marks,
    ps.total_questions
  FROM public.practice_sessions ps
  JOIN public.classroom_students cs
    ON cs.classroom_id = ps.classroom_id AND cs.student_id = ps.student_id
  WHERE ps.classroom_id IN (SELECT app.taught_classrooms(p_classroom_ids))
    AND ps.completed_at IS NOT NULL
    AND ps.total_questions > 0
  ORDER BY
    ps.classroom_id,
    ps.student_id,
    ps.stage_id,
    ps.marks / ps.total_questions DESC,
    ps.completed_at DESC;
$$;

REVOKE ALL ON FUNCTION public.dashboard_stage_bests(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_stage_bests(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.dashboard_stage_bests(uuid[]) IS
  'The best practice session of each enrolled student on each stage they '
  'have practised, in the caller''s live classrooms among those named.';


-- ------------------------------------------------------------
-- 4. Each student on each learning point (D4)
-- ------------------------------------------------------------

CREATE FUNCTION public.dashboard_learning_points(p_classroom_ids uuid[])
RETURNS TABLE (
  classroom_id uuid,
  student_id uuid,
  learning_point_id uuid,
  name text,
  score numeric,
  questions integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH latest AS (
    -- Each question a student has answered, by the answer they gave last.
    SELECT DISTINCT ON (ps.classroom_id, ps.student_id, pa.question_id)
      ps.classroom_id,
      ps.student_id,
      pa.question_id,
      pa.marks,
      ps.completed_at
    FROM public.practice_answers pa
    JOIN public.practice_sessions ps ON ps.id = pa.session_id
    JOIN public.classroom_students cs
      ON cs.classroom_id = ps.classroom_id AND cs.student_id = ps.student_id
    WHERE ps.classroom_id IN (SELECT app.taught_classrooms(p_classroom_ids))
      AND ps.completed_at IS NOT NULL
      AND pa.question_id IS NOT NULL
    ORDER BY ps.classroom_id, ps.student_id, pa.question_id, ps.completed_at DESC
  ),
  recent AS (
    -- Of those, the ten answered last on each learning point, by the
    -- learning points the questions are filed under now.
    SELECT
      l.classroom_id,
      l.student_id,
      qt.tag_id,
      l.marks,
      row_number() OVER (
        PARTITION BY l.classroom_id, l.student_id, qt.tag_id
        ORDER BY l.completed_at DESC, l.question_id
      ) AS place
    FROM latest l
    JOIN public.question_tags qt ON qt.question_id = l.question_id
  )
  SELECT
    r.classroom_id,
    r.student_id,
    r.tag_id,
    t.name,
    avg(r.marks),
    count(*)::integer
  FROM recent r
  JOIN public.tags t ON t.id = r.tag_id
  WHERE r.place <= 10
  GROUP BY r.classroom_id, r.student_id, r.tag_id, t.name;
$$;

ALTER FUNCTION public.dashboard_learning_points(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dashboard_learning_points(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_learning_points(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.dashboard_learning_points(uuid[]) IS
  'How each enrolled student does on each learning point, in the caller''s '
  'live classrooms among those named: the share of the marks earned on the '
  'ten questions of it they answered last, each question by its latest '
  'answer. `questions` is how many counted, up to ten.';


-- ------------------------------------------------------------
-- 5. Practice week by week (D5)
-- ------------------------------------------------------------

-- A week is seven days back from now: the last seven days are week 0.
CREATE FUNCTION public.dashboard_weeks(p_classroom_ids uuid[])
RETURNS TABLE (
  weeks_ago integer,
  sessions integer,
  average numeric
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    w.weeks_ago,
    count(ps.id)::integer,
    avg(ps.marks / ps.total_questions)
  FROM generate_series(0, 7) AS w (weeks_ago)
  LEFT JOIN (
    public.practice_sessions ps
    JOIN public.classroom_students cs
      ON cs.classroom_id = ps.classroom_id AND cs.student_id = ps.student_id
  )
    ON ps.classroom_id IN (SELECT app.taught_classrooms(p_classroom_ids))
    AND ps.total_questions > 0
    AND ps.completed_at > now() - (w.weeks_ago + 1) * interval '7 days'
    AND ps.completed_at <= now() - w.weeks_ago * interval '7 days'
  GROUP BY w.weeks_ago
  ORDER BY w.weeks_ago;
$$;

REVOKE ALL ON FUNCTION public.dashboard_weeks(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_weeks(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.dashboard_weeks(uuid[]) IS
  'Practice finished by enrolled students in each of the last eight weeks, '
  'week 0 being the last seven days, in the caller''s live classrooms among '
  'those named: how many sessions, and their average share of the marks '
  '(null for a week with none).';


-- ------------------------------------------------------------
-- 6. The latest practice (D6)
-- ------------------------------------------------------------

CREATE FUNCTION public.dashboard_activity(p_classroom_ids uuid[])
RETURNS TABLE (
  session_id uuid,
  classroom_id uuid,
  student_id uuid,
  student_name text,
  topic_name text,
  stage_name text,
  marks numeric,
  total integer,
  completed_at timestamptz,
  did_assignment boolean
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    ps.id,
    ps.classroom_id,
    ps.student_id,
    p.name,
    t.name,
    sg.name,
    ps.marks,
    ps.total_questions,
    ps.completed_at,
    EXISTS (SELECT 1 FROM public.assignment_students s WHERE s.session_id = ps.id)
  FROM public.practice_sessions ps
  JOIN public.classroom_students cs
    ON cs.classroom_id = ps.classroom_id AND cs.student_id = ps.student_id
  JOIN public.profiles p ON p.id = ps.student_id
  JOIN public.stages sg ON sg.id = ps.stage_id
  JOIN public.topics t ON t.id = sg.topic_id
  WHERE ps.classroom_id IN (SELECT app.taught_classrooms(p_classroom_ids))
    AND ps.completed_at IS NOT NULL
  ORDER BY ps.completed_at DESC
  LIMIT 8;
$$;

REVOKE ALL ON FUNCTION public.dashboard_activity(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_activity(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.dashboard_activity(uuid[]) IS
  'The latest eight practice sessions finished by enrolled students in the '
  'caller''s live classrooms among those named, each with whether it did '
  'an assignment.';
