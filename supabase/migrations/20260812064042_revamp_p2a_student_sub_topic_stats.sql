-- ============================================================
-- Clavis 2.0 revamp — P2a part 2/2: student_sub_topic_stats
--
-- Per-student, per-sub-topic progress for the learning map.
-- Stars are NOT stored: the map derives them from best_score_percent
-- on the client (`starsForScore`), so thresholds change without a
-- migration. Node state is derived too:
--   no row        -> not started
--   row, 0 stars  -> in progress
--   row, >=1 star -> completed
-- Nothing is ever locked — there is no gating column by design.
--
-- Writes happen ONLY inside complete_practice_session (SECURITY
-- DEFINER, owner postgres). authenticated has SELECT and nothing else.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
CREATE TABLE public.student_sub_topic_stats (
  student_id uuid NOT NULL
    REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  sub_topic_id uuid NOT NULL
    REFERENCES public.sub_topics(id) ON DELETE CASCADE,
  best_score_percent integer NOT NULL DEFAULT 0
    CHECK (best_score_percent BETWEEN 0 AND 100),
  sessions_completed integer NOT NULL DEFAULT 0
    CHECK (sessions_completed >= 0),
  last_completed_at timestamptz,
  PRIMARY KEY (student_id, sub_topic_id)
);

ALTER TABLE public.student_sub_topic_stats OWNER TO postgres;

COMMENT ON TABLE public.student_sub_topic_stats IS
  'Learning-map progress per student per sub-topic. Written only by complete_practice_session; stars are derived from best_score_percent on the client, never stored.';

-- Sub-topic-wide lookups (teacher/manager cohort views).
CREATE INDEX idx_student_sub_topic_stats_sub_topic
  ON public.student_sub_topic_stats USING btree (sub_topic_id);

-- ------------------------------------------------------------
-- 2. Grants: read-only for clients. Supabase's default privileges
--    grant ALL on new public tables to anon/authenticated, so the
--    write privileges must be revoked explicitly.
-- ------------------------------------------------------------
REVOKE ALL ON TABLE public.student_sub_topic_stats FROM PUBLIC;
REVOKE ALL ON TABLE public.student_sub_topic_stats FROM anon;
REVOKE ALL ON TABLE public.student_sub_topic_stats FROM authenticated;

GRANT SELECT ON TABLE public.student_sub_topic_stats TO authenticated;
GRANT ALL ON TABLE public.student_sub_topic_stats TO service_role;

-- ------------------------------------------------------------
-- 3. RLS: student reads own; same-org staff read their org's
--    students; platform admin reads all. No write policies —
--    the RPC is SECURITY DEFINER and bypasses RLS.
-- ------------------------------------------------------------
ALTER TABLE public.student_sub_topic_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read sub-topic stats: self, admin, same-org staff"
  ON public.student_sub_topic_stats
  FOR SELECT
  TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR (SELECT app.is_admin())
    OR (
      (SELECT app.is_org_staff())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = public.student_sub_topic_stats.student_id
          AND p.organization_id = (SELECT app.current_org_id())
      )
    )
  );

-- ------------------------------------------------------------
-- 4. complete_practice_session: same completion logic and return
--    shape {correct_count, total}, now also upserting the map stats.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_practice_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid;
  v_sub_topic_id uuid;
  v_completed_at timestamptz;
  v_total_questions integer;
  v_correct_count integer;
  v_total_time_seconds integer;
  v_score_percent integer;
BEGIN
  SELECT student_id, sub_topic_id, completed_at, total_questions
  INTO v_student_id, v_sub_topic_id, v_completed_at, v_total_questions
  FROM practice_sessions
  WHERE id = p_session_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF v_student_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Cannot complete another student''s session';
  END IF;

  IF v_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Session already completed: %', p_session_id;
  END IF;

  -- Count correct answers from the server-graded answer rows
  SELECT
    COUNT(*) FILTER (WHERE is_correct = TRUE),
    COALESCE(SUM(time_spent_seconds), 0)
  INTO v_correct_count, v_total_time_seconds
  FROM practice_answers
  WHERE session_id = p_session_id;

  UPDATE practice_sessions
  SET
    completed_at = NOW(),
    total_time_seconds = v_total_time_seconds,
    correct_count = v_correct_count
  WHERE id = p_session_id;

  -- Learning-map progress. Score is a whole percentage of the session's
  -- question count; best_score_percent only ever moves up.
  v_score_percent := COALESCE(
    round((100.0 * v_correct_count) / NULLIF(v_total_questions, 0))::integer,
    0
  );

  INSERT INTO student_sub_topic_stats AS s (
    student_id,
    sub_topic_id,
    best_score_percent,
    sessions_completed,
    last_completed_at
  )
  VALUES (v_student_id, v_sub_topic_id, v_score_percent, 1, NOW())
  ON CONFLICT (student_id, sub_topic_id) DO UPDATE
  SET
    best_score_percent = GREATEST(s.best_score_percent, EXCLUDED.best_score_percent),
    sessions_completed = s.sessions_completed + 1,
    last_completed_at = EXCLUDED.last_completed_at;

  RETURN jsonb_build_object(
    'correct_count', v_correct_count,
    'total', v_total_questions
  );
END;
$$;

ALTER FUNCTION public.complete_practice_session(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.complete_practice_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_practice_session(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_practice_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_practice_session(uuid) TO service_role;
