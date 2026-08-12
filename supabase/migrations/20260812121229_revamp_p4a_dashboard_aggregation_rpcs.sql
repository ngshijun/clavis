-- ============================================================
-- Clavis 2.0 revamp — P4a: dashboard aggregation RPCs + seat counts
--
-- Decisions 34–37. Read-only, SECURITY DEFINER, SET search_path public
-- aggregation RPCs that avoid client N+1 across students. Because
-- SECURITY DEFINER bypasses RLS, EACH function enforces tenancy
-- INTERNALLY: it resolves the caller's profile via auth.uid(), branches
-- on user_type, and scopes results:
--   teacher -> only their own classes / the students in them
--   manager -> their whole organization
--   admin   -> all orgs (org-overview); per-class / per-student / per-
--              assessment RPCs still require an org/class/assessment arg
--              and validate the caller may see it
--   student -> denied (these are staff surfaces)
--
-- No new writable state. EXECUTE granted to `authenticated` only
-- (PUBLIC/anon revoked); the function body is the tenancy gate.
--
-- A "seat" is one student profile in an organization (decision 34): the
-- org-overview / platform-totals student_count columns ARE the seat/usage
-- counter.
--
-- At-risk rule (decision 36), thresholds centralised in
-- get_student_rollups as SQL constants:
--   at_risk = overdue-incomplete assessment
--          OR map mastery (avg best_score) < 50
--          OR no practice session in the last 14 days
-- ============================================================

-- ------------------------------------------------------------
-- A. get_class_rollups — one row per class with student count,
--    average map mastery, average assessment score, and assigned vs
--    completed assessment attempts.
--
--    teacher -> own classes (classes.teacher_id = auth.uid())
--    manager -> all classes in own org
--    admin   -> classes of p_organization_id (required)
--    student -> denied
--
--    assigned_attempts = (# assessments assigned to the class) x
--                        (# members)  -- expected attempts
--    completed_attempts = completed attempts by members on those
--                         class-assigned assessments
--    avg_map_mastery   = average over members of each member's own
--                        average best_score_percent (equal weight per
--                        student); NULL when no member has practiced
--    avg_assessment_score = average score_percent of the completed
--                        attempts counted above; NULL when none
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_class_rollups(p_organization_id uuid DEFAULT NULL)
RETURNS TABLE (
  class_id             uuid,
  class_name           text,
  teacher_id           uuid,
  teacher_name         text,
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
    SELECT c.id, c.name, c.teacher_id
    FROM classes c
    WHERE (v_role = 'admin'   AND c.organization_id = p_organization_id)
       OR (v_role = 'manager' AND c.organization_id = v_org)
       OR (v_role = 'teacher' AND c.teacher_id = v_uid)
  ),
  mem AS (
    SELECT cm.class_id, cm.student_id
    FROM class_members cm
    JOIN cls ON cls.id = cm.class_id
  ),
  student_counts AS (
    SELECT m.class_id, COUNT(*) AS n FROM mem m GROUP BY m.class_id
  ),
  per_student AS (
    SELECT m.class_id, m.student_id, AVG(st.best_score_percent) AS mastery
    FROM mem m
    JOIN student_sub_topic_stats st ON st.student_id = m.student_id
    GROUP BY m.class_id, m.student_id
  ),
  class_mastery AS (
    SELECT ps.class_id, ROUND(AVG(ps.mastery), 1) AS avg_mastery
    FROM per_student ps GROUP BY ps.class_id
  ),
  class_assessments AS (
    SELECT aa.class_id, COUNT(DISTINCT aa.assessment_id) AS n_assessments
    FROM assessment_assignments aa
    JOIN cls ON cls.id = aa.class_id
    WHERE aa.class_id IS NOT NULL
    GROUP BY aa.class_id
  ),
  class_completed AS (
    SELECT m.class_id,
           COUNT(*) FILTER (WHERE at.completed_at IS NOT NULL) AS completed,
           ROUND(AVG(at.score_percent) FILTER (WHERE at.completed_at IS NOT NULL), 1) AS avg_score
    FROM mem m
    JOIN assessment_attempts at ON at.student_id = m.student_id
    JOIN assessment_assignments aa
      ON aa.class_id = m.class_id AND aa.assessment_id = at.assessment_id
    GROUP BY m.class_id
  )
  SELECT
    c.id,
    c.name,
    c.teacher_id,
    tp.name,
    COALESCE(sc.n, 0)::integer,
    cm2.avg_mastery,
    cc.avg_score,
    (COALESCE(ca.n_assessments, 0) * COALESCE(sc.n, 0))::integer,
    COALESCE(cc.completed, 0)::integer
  FROM cls c
  JOIN profiles tp ON tp.id = c.teacher_id
  LEFT JOIN student_counts   sc  ON sc.class_id  = c.id
  LEFT JOIN class_mastery    cm2 ON cm2.class_id = c.id
  LEFT JOIN class_assessments ca ON ca.class_id  = c.id
  LEFT JOIN class_completed  cc  ON cc.class_id  = c.id
  ORDER BY c.name;
END;
$$;

ALTER FUNCTION public.get_class_rollups(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_class_rollups(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_class_rollups(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_class_rollups(uuid) TO authenticated;

-- ------------------------------------------------------------
-- B. get_student_rollups — one row per student with learning-map
--    mastery, practice recency, assessment completion, and at_risk.
--
--    p_class_id given -> that class's members (caller must be admin, or
--                        staff of the class's org)
--    p_class_id NULL:
--      teacher -> distinct students across the teacher's OWN classes
--      manager -> all students in own org
--      admin   -> all students of p_organization_id (required)
--    student -> denied
--
--    map_mastery      = avg best_score_percent over attempted sub-topics
--    sub_topics_completed = # sub-topics with >=1 star (best_score >= 60)
--    last_practice_at = most recent practice_sessions.created_at
--    assigned_count   = distinct assessments assigned (direct + class)
--    completed_count  = student's completed attempts
--    avg_assessment_score = avg score_percent over completed attempts
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_rollups(
  p_class_id        uuid DEFAULT NULL,
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
  v_uid       uuid := (SELECT auth.uid());
  v_role      public.user_role;
  v_org       uuid;
  v_class_org uuid;
  -- At-risk thresholds (decision 36) — tune here.
  c_mastery_floor constant numeric  := 50;                -- avg best_score below this = at risk
  c_stale_window  constant interval := interval '14 days'; -- no practice in this window = at risk
  c_star_floor    constant integer  := 60;                -- best_score >= this = >=1 star (completed)
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

  IF p_class_id IS NOT NULL THEN
    SELECT c.organization_id INTO v_class_org FROM classes c WHERE c.id = p_class_id;
    IF v_class_org IS NULL THEN
      RAISE EXCEPTION 'Class not found: %', p_class_id;
    END IF;
    IF NOT (v_role = 'admin' OR v_org = v_class_org) THEN
      RAISE EXCEPTION 'Not authorized to view this class';
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
      (p_class_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM class_members cm
                    WHERE cm.class_id = p_class_id AND cm.student_id = sp.id))
      OR
      (p_class_id IS NULL AND (
           (v_role = 'admin'   AND p.organization_id = p_organization_id)
        OR (v_role = 'manager' AND p.organization_id = v_org)
        OR (v_role = 'teacher' AND EXISTS (
              SELECT 1 FROM class_members cm
              JOIN classes c ON c.id = cm.class_id
              WHERE cm.student_id = sp.id AND c.teacher_id = v_uid))
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
            OR aa.class_id IN (SELECT cm.class_id FROM class_members cm
                               WHERE cm.student_id = t.student_id)) AS assigned_count,
      (SELECT COUNT(*)::integer
         FROM assessment_attempts at
         WHERE at.student_id = t.student_id AND at.completed_at IS NOT NULL) AS completed_count,
      (SELECT ROUND(AVG(at.score_percent), 1)
         FROM assessment_attempts at
         WHERE at.student_id = t.student_id AND at.completed_at IS NOT NULL) AS avg_assessment_score,
      EXISTS (
        SELECT 1 FROM assessment_assignments aa
        WHERE (aa.student_id = t.student_id
               OR aa.class_id IN (SELECT cm.class_id FROM class_members cm
                                  WHERE cm.student_id = t.student_id))
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
-- C. get_assessment_completion — completion + score distribution for a
--    single assessment.
--
--    admin -> any assessment; manager/teacher -> own-org assessments;
--    student -> denied.
--
--    assigned_count    = distinct students the assessment reaches
--                        (direct + members of assigned classes) = seats
--    completed_count   = distinct students who completed
--    in_progress_count = started-but-not-completed attempts
--    avg_score         = avg score_percent over completed attempts
--    buckets           = completed-attempt score bands
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
    SELECT DISTINCT COALESCE(aa.student_id, cm.student_id) AS student_id
    FROM assessment_assignments aa
    LEFT JOIN class_members cm ON cm.class_id = aa.class_id
    WHERE aa.assessment_id = p_assessment_id
      AND COALESCE(aa.student_id, cm.student_id) IS NOT NULL
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
-- D. get_org_overview — platform-admin only. One row per organization:
--    staff counts, seat count (students), assessment/class counts, and
--    last-activity recency. This is the seat/usage counter (decision 34).
--    student_count = # student profiles in the org = SEATS.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_org_overview()
RETURNS TABLE (
  organization_id   uuid,
  organization_name text,
  teacher_count     integer,
  manager_count     integer,
  student_count     integer,
  assessment_count  integer,
  class_count       integer,
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
    (SELECT COUNT(*)::integer FROM classes c WHERE c.organization_id = o.id),
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
-- E. get_platform_totals — platform-admin only grand totals across all
--    organizations (companion to get_org_overview). student_count = total
--    SEATS in use across the platform.
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
    'class_count',      (SELECT COUNT(*) FROM classes),
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
