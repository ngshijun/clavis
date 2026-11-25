-- ============================================================
-- Clavis revamp — P45a: a manager's dashboard, and a manager's hand on
-- the people of their organization.
--
-- The dashboard a teacher has of the classrooms they teach, a manager now
-- has of every live classroom of their organization. And whoever opens an
-- account can put right what they typed: its name, and a student's grade
-- level.
--
--   D1  app.dashboard_classrooms replaces app.taught_classrooms: the live
--       classrooms among those asked for that the caller teaches or, as a
--       manager, has in their organization. A manager reaches archived
--       classrooms too (P43a), and a dashboard is of the live ones.
--   D2  The five dashboard functions are made again as they stood, asking
--       the new function. A teacher's answers are what they were.
--   D3  A manager renames a teacher or a student of their organization,
--       and an admin a manager. The columns `authenticated` may write are
--       unchanged (name, avatar_path), so nothing else of a profile can
--       be touched this way.
--   D4  A manager sets the grade level of a student of their
--       organization. The one column that may be written is
--       grade_level_id, as before.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The classrooms a dashboard answers for (D1)
-- ------------------------------------------------------------

CREATE FUNCTION app.dashboard_classrooms(p_classroom_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id
  FROM public.classrooms c
  WHERE c.id = ANY ((SELECT app.staff_classroom_ids())::uuid[])
    AND c.archived_at IS NULL
    AND (p_classroom_ids IS NULL OR c.id = ANY (p_classroom_ids));
$$;

ALTER FUNCTION app.dashboard_classrooms(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.dashboard_classrooms(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.dashboard_classrooms(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION app.dashboard_classrooms(uuid[]) IS
  'Of the classrooms named, the live ones the caller teaches or, as a '
  'manager, has in their organization; every one of them for NULL.';


-- ------------------------------------------------------------
-- 2. The dashboard, asking it (D2)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dashboard_students(p_classroom_ids uuid[])
 RETURNS TABLE(classroom_id uuid, student_id uuid, name text, this_week boolean, last_week boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  WHERE cs.classroom_id IN (SELECT app.dashboard_classrooms(p_classroom_ids))
  ORDER BY p.name;
$function$

;

CREATE OR REPLACE FUNCTION public.dashboard_stage_bests(p_classroom_ids uuid[])
 RETURNS TABLE(classroom_id uuid, student_id uuid, stage_id uuid, marks numeric, total integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT DISTINCT ON (ps.classroom_id, ps.student_id, ps.stage_id)
    ps.classroom_id,
    ps.student_id,
    ps.stage_id,
    ps.marks,
    ps.total_questions
  FROM public.practice_sessions ps
  JOIN public.classroom_students cs
    ON cs.classroom_id = ps.classroom_id AND cs.student_id = ps.student_id
  WHERE ps.classroom_id IN (SELECT app.dashboard_classrooms(p_classroom_ids))
    AND ps.completed_at IS NOT NULL
    AND ps.total_questions > 0
  ORDER BY
    ps.classroom_id,
    ps.student_id,
    ps.stage_id,
    ps.marks / ps.total_questions DESC,
    ps.completed_at DESC;
$function$

;

CREATE OR REPLACE FUNCTION public.dashboard_learning_points(p_classroom_ids uuid[])
 RETURNS TABLE(classroom_id uuid, student_id uuid, learning_point_id uuid, name text, score numeric, questions integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    WHERE ps.classroom_id IN (SELECT app.dashboard_classrooms(p_classroom_ids))
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
$function$

;

CREATE OR REPLACE FUNCTION public.dashboard_weeks(p_classroom_ids uuid[])
 RETURNS TABLE(weeks_ago integer, sessions integer, average numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
    ON ps.classroom_id IN (SELECT app.dashboard_classrooms(p_classroom_ids))
    AND ps.total_questions > 0
    AND ps.completed_at > now() - (w.weeks_ago + 1) * interval '7 days'
    AND ps.completed_at <= now() - w.weeks_ago * interval '7 days'
  GROUP BY w.weeks_ago
  ORDER BY w.weeks_ago;
$function$

;

CREATE OR REPLACE FUNCTION public.dashboard_activity(p_classroom_ids uuid[])
 RETURNS TABLE(session_id uuid, classroom_id uuid, student_id uuid, student_name text, topic_name text, stage_name text, marks numeric, total integer, completed_at timestamp with time zone, did_assignment boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  WHERE ps.classroom_id IN (SELECT app.dashboard_classrooms(p_classroom_ids))
    AND ps.completed_at IS NOT NULL
  ORDER BY ps.completed_at DESC
  LIMIT 8;
$function$

;

DROP FUNCTION app.taught_classrooms(uuid[]);


-- ------------------------------------------------------------
-- 3. Renaming a person (D3)
-- ------------------------------------------------------------

CREATE POLICY "Update profiles: manager own org staff and students, admin managers"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    (
      (SELECT app.is_manager())
      AND organization_id = (SELECT app.current_org_id())
      AND user_type IN ('teacher', 'student')
    )
    OR ((SELECT app.is_admin()) AND user_type = 'manager')
  )
  WITH CHECK (
    (
      (SELECT app.is_manager())
      AND organization_id = (SELECT app.current_org_id())
      AND user_type IN ('teacher', 'student')
    )
    OR ((SELECT app.is_admin()) AND user_type = 'manager')
  );


-- ------------------------------------------------------------
-- 4. A student's grade level (D4)
-- ------------------------------------------------------------

CREATE POLICY "Update student profiles: manager own org"
  ON public.student_profiles
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT app.is_manager())
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = student_profiles.id
        AND p.organization_id = (SELECT app.current_org_id())
    )
  )
  WITH CHECK (
    (SELECT app.is_manager())
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = student_profiles.id
        AND p.organization_id = (SELECT app.current_org_id())
    )
  );
