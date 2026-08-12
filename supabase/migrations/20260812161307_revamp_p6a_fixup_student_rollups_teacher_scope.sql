-- P6a verifier fixup (orchestrator, 2026-08-13):
-- get_student_rollups(p_classroom_id, ...) authorized a classroom argument on
-- ORG membership only, so any same-org teacher could read the roster + mastery
-- of a classroom they do not teach — looser than the raw-table RLS on
-- classroom_students (which restricts a teacher to classrooms they teach) and
-- contrary to the Revamp 2.2 model where teachers are scoped to their assigned
-- classrooms. Tighten the guard: a teacher must actually teach the classroom.
-- Only the authorization block changes; the projection is byte-identical.
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
    -- Teacher must teach this classroom; manager must own its org; admin unrestricted.
    IF NOT (
         v_role = 'admin'
      OR (v_role = 'manager' AND v_org = v_classroom_org)
      OR (v_role = 'teacher' AND (SELECT app.is_classroom_teacher(p_classroom_id)))
    ) THEN
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
