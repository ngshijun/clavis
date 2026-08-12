-- ============================================================
-- Clavis 2.2 revamp — P6a part 2/2: dashboard RPC rework (decision 51)
--
-- The P4a aggregation RPCs keyed the teacher scope on classes.teacher_id.
-- With the classroom model that column is gone: a teacher's scope is now
-- the classrooms they are a member of (classroom_teachers), a classroom
-- has many teachers, and its roster comes from classroom_students.
--
--   * get_class_rollups   -> one row per CLASSROOM. teacher_id/teacher_name
--                            (a single teacher) are replaced by teacher_count
--                            plus the classroom's grade/subject. Scope:
--                            teacher -> classrooms they teach; manager -> org;
--                            admin -> p_organization_id.
--   * get_student_rollups -> argument p_class_id renamed p_classroom_id;
--                            membership + teacher scope via classroom_students
--                            / classroom_teachers.
--   * get_assessment_completion -> reached students via classroom_students.
--   * get_org_overview / get_platform_totals -> class_count column becomes
--                            classroom_count, counted from classrooms.
--
-- Tenancy is still enforced IN THE BODY (definer bypasses RLS); the at-risk
-- rule and seat counts are unchanged. All 5 were dropped in part 1 (arg /
-- return-column changes CREATE OR REPLACE cannot express).
-- ============================================================

-- ------------------------------------------------------------
-- A. get_class_rollups — one row per classroom.
--
--    teacher -> classrooms they teach (classroom_teachers)
--    manager -> all classrooms in own org
--    admin   -> classrooms of p_organization_id (required)
--    student -> denied
--
--    teacher_count      = # teachers in classroom_teachers
--    student_count      = # classroom_students
--    avg_map_mastery    = average over members of each member's own average
--                         best_score_percent (equal weight per student);
--                         NULL when no member has practiced
--    avg_assessment_score = average score_percent of the completed attempts
--                         counted in completed_attempts; NULL when none
--    assigned_attempts  = (# assessments assigned to the classroom) x
--                         (# members)  -- expected attempts
--    completed_attempts = completed attempts by members on those
--                         classroom-assigned assessments
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_class_rollups(p_organization_id uuid DEFAULT NULL)
RETURNS TABLE (
  classroom_id         uuid,
  classroom_name       text,
  grade_level_id       uuid,
  grade_level_name     text,
  subject_id           uuid,
  subject_name         text,
  teacher_count        integer,
  student_count        integer,
  avg_map_mastery      numeric,
  avg_assessment_score numeric,
  assigned_attempts    integer,
  completed_attempts   integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role public.user_role;
  v_org  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.user_type, p.organization_id INTO v_role, v_org
  FROM profiles p WHERE p.id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_role NOT IN ('admin', 'manager', 'teacher') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_role = 'admin' AND p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required for platform admins';
  END IF;

  RETURN QUERY
  WITH cls AS (
    SELECT c.id, c.name, c.grade_level_id, c.subject_id
    FROM classrooms c
    WHERE (v_role = 'admin'   AND c.organization_id = p_organization_id)
       OR (v_role = 'manager' AND c.organization_id = v_org)
       OR (v_role = 'teacher' AND EXISTS (
             SELECT 1 FROM classroom_teachers ct
             WHERE ct.classroom_id = c.id AND ct.teacher_id = v_uid))
  ),
  mem AS (
    SELECT cs.classroom_id, cs.student_id
    FROM classroom_students cs
    JOIN cls ON cls.id = cs.classroom_id
  ),
  student_counts AS (
    SELECT m.classroom_id, COUNT(*) AS n FROM mem m GROUP BY m.classroom_id
  ),
  teacher_counts AS (
    SELECT ct.classroom_id, COUNT(*) AS n
    FROM classroom_teachers ct
    JOIN cls ON cls.id = ct.classroom_id
    GROUP BY ct.classroom_id
  ),
  per_student AS (
    SELECT m.classroom_id, m.student_id, AVG(st.best_score_percent) AS mastery
    FROM mem m
    JOIN student_sub_topic_stats st ON st.student_id = m.student_id
    GROUP BY m.classroom_id, m.student_id
  ),
  class_mastery AS (
    SELECT ps.classroom_id, ROUND(AVG(ps.mastery), 1) AS avg_mastery
    FROM per_student ps GROUP BY ps.classroom_id
  ),
  class_assessments AS (
    SELECT aa.classroom_id, COUNT(DISTINCT aa.assessment_id) AS n_assessments
    FROM assessment_assignments aa
    JOIN cls ON cls.id = aa.classroom_id
    WHERE aa.classroom_id IS NOT NULL
    GROUP BY aa.classroom_id
  ),
  class_completed AS (
    SELECT m.classroom_id,
           COUNT(*) FILTER (WHERE at.completed_at IS NOT NULL) AS completed,
           ROUND(AVG(at.score_percent) FILTER (WHERE at.completed_at IS NOT NULL), 1) AS avg_score
    FROM mem m
    JOIN assessment_attempts at ON at.student_id = m.student_id
    JOIN assessment_assignments aa
      ON aa.classroom_id = m.classroom_id AND aa.assessment_id = at.assessment_id
    GROUP BY m.classroom_id
  )
  SELECT
    c.id,
    c.name,
    c.grade_level_id,
    gl.name,
    c.subject_id,
    s.name,
    COALESCE(tc.n, 0)::integer,
    COALESCE(sc.n, 0)::integer,
    cm2.avg_mastery,
    cc.avg_score,
    (COALESCE(ca.n_assessments, 0) * COALESCE(sc.n, 0))::integer,
    COALESCE(cc.completed, 0)::integer
  FROM cls c
  JOIN grade_levels gl ON gl.id = c.grade_level_id
  JOIN subjects s ON s.id = c.subject_id
  LEFT JOIN student_counts    sc  ON sc.classroom_id  = c.id
  LEFT JOIN teacher_counts    tc  ON tc.classroom_id  = c.id
  LEFT JOIN class_mastery     cm2 ON cm2.classroom_id = c.id
  LEFT JOIN class_assessments ca  ON ca.classroom_id  = c.id
  LEFT JOIN class_completed   cc  ON cc.classroom_id  = c.id
  ORDER BY c.name;
END;
$$;

ALTER FUNCTION public.get_class_rollups(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_class_rollups(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_class_rollups(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_class_rollups(uuid) TO authenticated;

-- ------------------------------------------------------------
-- B. get_student_rollups — one row per student. Argument renamed
--    p_class_id -> p_classroom_id; membership + teacher scope via the
--    classroom join tables.
--
--    p_classroom_id given -> that classroom's members (caller must be
--                            admin, or staff of the classroom's org)
--    p_classroom_id NULL:
--      teacher -> distinct students across the teacher's classrooms
--      manager -> all students in own org
--      admin   -> all students of p_organization_id (required)
--    student -> denied
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_rollups(
  p_classroom_id    uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  student_id           uuid,
  student_name         text,
  username             text,
  map_mastery          numeric,
  sub_topics_attempted integer,
  sub_topics_completed integer,
  last_practice_at     timestamptz,
  assigned_count       integer,
  completed_count      integer,
  avg_assessment_score numeric,
  at_risk              boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid           uuid := (SELECT auth.uid());
  v_role          public.user_role;
  v_org           uuid;
  v_classroom_org uuid;
  -- At-risk thresholds (decision 36) — tune here.
  c_mastery_floor constant numeric  := 50;                 -- avg best_score below this = at risk
  c_stale_window  constant interval := interval '14 days'; -- no practice in this window = at risk
  c_star_floor    constant integer  := 60;                 -- best_score >= this = >=1 star (completed)
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.user_type, p.organization_id INTO v_role, v_org
  FROM profiles p WHERE p.id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_role NOT IN ('admin', 'manager', 'teacher') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_classroom_id IS NOT NULL THEN
    SELECT c.organization_id INTO v_classroom_org FROM classrooms c WHERE c.id = p_classroom_id;
    IF v_classroom_org IS NULL THEN
      RAISE EXCEPTION 'Classroom not found: %', p_classroom_id;
    END IF;
    IF NOT (v_role = 'admin' OR v_org = v_classroom_org) THEN
      RAISE EXCEPTION 'Not authorized to view this classroom';
    END IF;
  ELSIF v_role = 'admin' AND p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required for platform admins';
  END IF;

  RETURN QUERY
  WITH targets AS (
    SELECT sp.id AS student_id, p.name AS student_name, sp.username AS username
    FROM student_profiles sp
    JOIN profiles p ON p.id = sp.id
    WHERE
      (p_classroom_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM classroom_students cs
                    WHERE cs.classroom_id = p_classroom_id AND cs.student_id = sp.id))
      OR
      (p_classroom_id IS NULL AND (
           (v_role = 'admin'   AND p.organization_id = p_organization_id)
        OR (v_role = 'manager' AND p.organization_id = v_org)
        OR (v_role = 'teacher' AND EXISTS (
              SELECT 1 FROM classroom_students cs
              JOIN classroom_teachers ct ON ct.classroom_id = cs.classroom_id
              WHERE cs.student_id = sp.id AND ct.teacher_id = v_uid))
      ))
  ),
  base AS (
    SELECT
      t.student_id,
      t.student_name,
      t.username,
      (SELECT ROUND(AVG(st.best_score_percent), 1)
         FROM student_sub_topic_stats st WHERE st.student_id = t.student_id) AS map_mastery,
      (SELECT COUNT(*)::integer
         FROM student_sub_topic_stats st WHERE st.student_id = t.student_id) AS sub_topics_attempted,
      (SELECT COUNT(*)::integer
         FROM student_sub_topic_stats st
         WHERE st.student_id = t.student_id
           AND st.best_score_percent >= c_star_floor) AS sub_topics_completed,
      (SELECT MAX(ps.created_at)
         FROM practice_sessions ps WHERE ps.student_id = t.student_id) AS last_practice_at,
      (SELECT COUNT(DISTINCT aa.assessment_id)::integer
         FROM assessment_assignments aa
         WHERE aa.student_id = t.student_id
            OR aa.classroom_id IN (SELECT cs.classroom_id FROM classroom_students cs
                                   WHERE cs.student_id = t.student_id)) AS assigned_count,
      (SELECT COUNT(*)::integer
         FROM assessment_attempts at
         WHERE at.student_id = t.student_id AND at.completed_at IS NOT NULL) AS completed_count,
      (SELECT ROUND(AVG(at.score_percent), 1)
         FROM assessment_attempts at
         WHERE at.student_id = t.student_id AND at.completed_at IS NOT NULL) AS avg_assessment_score,
      EXISTS (
        SELECT 1 FROM assessment_assignments aa
        WHERE (aa.student_id = t.student_id
               OR aa.classroom_id IN (SELECT cs.classroom_id FROM classroom_students cs
                                      WHERE cs.student_id = t.student_id))
          AND aa.due_at IS NOT NULL
          AND aa.due_at < now()
          AND NOT EXISTS (
            SELECT 1 FROM assessment_attempts at
            WHERE at.assessment_id = aa.assessment_id
              AND at.student_id = t.student_id
              AND at.completed_at IS NOT NULL)
      ) AS overdue_incomplete
    FROM targets t
  )
  SELECT
    b.student_id,
    b.student_name,
    b.username,
    b.map_mastery,
    b.sub_topics_attempted,
    b.sub_topics_completed,
    b.last_practice_at,
    b.assigned_count,
    b.completed_count,
    b.avg_assessment_score,
    (
      b.overdue_incomplete
      OR (b.map_mastery IS NOT NULL AND b.map_mastery < c_mastery_floor)
      OR (b.last_practice_at IS NULL OR b.last_practice_at < now() - c_stale_window)
    ) AS at_risk
  FROM base b
  ORDER BY b.student_name;
END;
$$;

ALTER FUNCTION public.get_student_rollups(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_student_rollups(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_rollups(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_rollups(uuid, uuid) TO authenticated;

-- ------------------------------------------------------------
-- C. get_assessment_completion — reached students now come from
--    classroom_students (via aa.classroom_id). Scoping unchanged.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_assessment_completion(p_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid            uuid := (SELECT auth.uid());
  v_role           public.user_role;
  v_org            uuid;
  v_assessment_org uuid;
  v_title          text;
  v_status         public.assessment_status;
  v_result         jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.user_type, p.organization_id INTO v_role, v_org
  FROM profiles p WHERE p.id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  SELECT a.organization_id, a.title, a.status
  INTO v_assessment_org, v_title, v_status
  FROM assessments a WHERE a.id = p_assessment_id;

  IF v_assessment_org IS NULL THEN
    RAISE EXCEPTION 'Assessment not found: %', p_assessment_id;
  END IF;

  IF NOT (v_role = 'admin'
          OR (v_role IN ('manager', 'teacher') AND v_org = v_assessment_org)) THEN
    RAISE EXCEPTION 'Not authorized to view this assessment';
  END IF;

  WITH reached AS (
    SELECT DISTINCT COALESCE(aa.student_id, cs.student_id) AS student_id
    FROM assessment_assignments aa
    LEFT JOIN classroom_students cs ON cs.classroom_id = aa.classroom_id
    WHERE aa.assessment_id = p_assessment_id
      AND COALESCE(aa.student_id, cs.student_id) IS NOT NULL
  ),
  attempts AS (
    SELECT at.completed_at, at.score_percent
    FROM assessment_attempts at
    WHERE at.assessment_id = p_assessment_id
  )
  SELECT jsonb_build_object(
    'assessment_id', p_assessment_id,
    'title', v_title,
    'status', v_status,
    'assigned_count',    (SELECT COUNT(*) FROM reached),
    'completed_count',   (SELECT COUNT(*) FROM attempts WHERE completed_at IS NOT NULL),
    'in_progress_count', (SELECT COUNT(*) FROM attempts WHERE completed_at IS NULL),
    'avg_score',         (SELECT ROUND(AVG(score_percent), 1) FROM attempts WHERE completed_at IS NOT NULL),
    'buckets', jsonb_build_object(
      '0-49',   (SELECT COUNT(*) FROM attempts WHERE completed_at IS NOT NULL AND score_percent < 50),
      '50-59',  (SELECT COUNT(*) FROM attempts WHERE completed_at IS NOT NULL AND score_percent BETWEEN 50 AND 59),
      '60-79',  (SELECT COUNT(*) FROM attempts WHERE completed_at IS NOT NULL AND score_percent BETWEEN 60 AND 79),
      '80-100', (SELECT COUNT(*) FROM attempts WHERE completed_at IS NOT NULL AND score_percent BETWEEN 80 AND 100)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_assessment_completion(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_assessment_completion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_assessment_completion(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_assessment_completion(uuid) TO authenticated;

-- ------------------------------------------------------------
-- D. get_org_overview — platform-admin only. class_count -> classroom_count
--    (counted from classrooms); everything else unchanged.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_org_overview()
RETURNS TABLE (
  organization_id   uuid,
  organization_name text,
  teacher_count     integer,
  manager_count     integer,
  student_count     integer,
  assessment_count  integer,
  classroom_count   integer,
  last_activity_at  timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role public.user_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.user_type INTO v_role FROM profiles p WHERE p.id = v_uid;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only platform admins may view the organization overview';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    (SELECT COUNT(*)::integer FROM profiles p WHERE p.organization_id = o.id AND p.user_type = 'teacher'),
    (SELECT COUNT(*)::integer FROM profiles p WHERE p.organization_id = o.id AND p.user_type = 'manager'),
    (SELECT COUNT(*)::integer FROM profiles p WHERE p.organization_id = o.id AND p.user_type = 'student'),
    (SELECT COUNT(*)::integer FROM assessments a WHERE a.organization_id = o.id),
    (SELECT COUNT(*)::integer FROM classrooms c WHERE c.organization_id = o.id),
    GREATEST(
      (SELECT MAX(ps.created_at) FROM practice_sessions ps
         JOIN profiles p ON p.id = ps.student_id WHERE p.organization_id = o.id),
      (SELECT MAX(at.started_at) FROM assessment_attempts at
         JOIN assessments a ON a.id = at.assessment_id WHERE a.organization_id = o.id)
    )
  FROM organizations o
  ORDER BY o.name;
END;
$$;

ALTER FUNCTION public.get_org_overview() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_org_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_org_overview() TO authenticated;

-- ------------------------------------------------------------
-- E. get_platform_totals — platform-admin only grand totals.
--    class_count -> classroom_count (counted from classrooms).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_totals()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role public.user_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.user_type INTO v_role FROM profiles p WHERE p.id = v_uid;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only platform admins may view platform totals';
  END IF;

  RETURN jsonb_build_object(
    'org_count',        (SELECT COUNT(*) FROM organizations),
    'manager_count',    (SELECT COUNT(*) FROM profiles WHERE user_type = 'manager'),
    'teacher_count',    (SELECT COUNT(*) FROM profiles WHERE user_type = 'teacher'),
    'student_count',    (SELECT COUNT(*) FROM profiles WHERE user_type = 'student'),
    'assessment_count', (SELECT COUNT(*) FROM assessments),
    'classroom_count',  (SELECT COUNT(*) FROM classrooms),
    'last_activity_at', GREATEST(
      (SELECT MAX(created_at) FROM practice_sessions),
      (SELECT MAX(started_at) FROM assessment_attempts)
    )
  );
END;
$$;

ALTER FUNCTION public.get_platform_totals() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_platform_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_platform_totals() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_platform_totals() TO authenticated;
