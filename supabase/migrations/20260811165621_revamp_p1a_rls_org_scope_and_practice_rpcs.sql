-- ============================================================
-- Clavis 2.0 revamp — P1a part 3/3: org-scoped RLS + practice RPCs
--
-- * SECURITY DEFINER STABLE helpers in schema `app`
--   (always called wrapped in (SELECT ...) inside policies so they
--   evaluate once per statement, per CLAUDE.md).
-- * Recreates every policy dropped in parts 1-2, org-scoped:
--   - platform admin keeps full management access
--   - managers/teachers read their own org's students & practice data
--   - students keep self-only access (audit lockdowns preserved:
--     restricted student_profiles/questions SELECT, server-owned
--     is_correct/correct_count)
-- * No self-signup: the INSERT-own-profile policies are dropped;
--   provisioning goes through the service-role create-user edge
--   function (P1c).
-- * create_practice_session rewritten without the daily session limit;
--   complete_practice_session rewritten without XP/coins/badges/streak
--   side-effects, returning {correct_count, total}. Both now enforce
--   caller ownership.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RLS helper functions
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;

GRANT USAGE ON SCHEMA app TO authenticated;
GRANT USAGE ON SCHEMA app TO service_role;

-- True when the caller is a platform admin.
CREATE OR REPLACE FUNCTION app.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_type = 'admin'
  );
$$;

-- The caller's organization (NULL for platform admins / anon).
CREATE OR REPLACE FUNCTION app.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

-- True when the caller is org staff (manager or teacher).
CREATE OR REPLACE FUNCTION app.is_org_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_type IN ('manager', 'teacher')
  );
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['app.is_admin()', 'app.current_org_id()', 'app.is_org_staff()'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 2. organizations policies (admin CRUD; members read their own org)
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;

CREATE POLICY "Admins manage organizations"
  ON public.organizations
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Members read own organization"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (id = (SELECT app.current_org_id()));

-- ------------------------------------------------------------
-- 3. profiles: kill the world-readable SELECT; self / admin /
--    same-org staff. No self-INSERT (provisioning is service-role).
-- ------------------------------------------------------------
DROP POLICY "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY "Users can insert own profile" ON public.profiles;
REVOKE ALL ON TABLE public.profiles FROM anon;

CREATE POLICY "Read profiles: self, admin, same-org staff"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (SELECT app.is_admin())
    OR ((SELECT app.is_org_staff()) AND organization_id = (SELECT app.current_org_id()))
  );

-- ------------------------------------------------------------
-- 4. student_profiles: self / admin / same-org staff read; self
--    update. No self-INSERT.
-- ------------------------------------------------------------
DROP POLICY "Students can insert own student profile" ON public.student_profiles;
REVOKE ALL ON TABLE public.student_profiles FROM anon;

CREATE POLICY "Read student profiles: self, admin, same-org staff"
  ON public.student_profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (SELECT app.is_admin())
    OR (
      (SELECT app.is_org_staff())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = public.student_profiles.id
          AND p.organization_id = (SELECT app.current_org_id())
      )
    )
  );

-- ------------------------------------------------------------
-- 5. Practice data: self / admin / same-org staff read
-- ------------------------------------------------------------
CREATE POLICY "Read practice sessions: self, admin, same-org staff"
  ON public.practice_sessions
  FOR SELECT
  TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR (SELECT app.is_admin())
    OR (
      (SELECT app.is_org_staff())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = public.practice_sessions.student_id
          AND p.organization_id = (SELECT app.current_org_id())
      )
    )
  );

CREATE POLICY "Read practice answers: self, admin, same-org staff"
  ON public.practice_answers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.practice_sessions ps
      WHERE ps.id = public.practice_answers.session_id
        AND ps.student_id = (SELECT auth.uid())
    )
    OR (SELECT app.is_admin())
    OR (
      (SELECT app.is_org_staff())
      AND EXISTS (
        SELECT 1
        FROM public.practice_sessions ps
        JOIN public.profiles p ON p.id = ps.student_id
        WHERE ps.id = public.practice_answers.session_id
          AND p.organization_id = (SELECT app.current_org_id())
      )
    )
  );

CREATE POLICY "Read session questions: self, admin, same-org staff"
  ON public.session_questions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.practice_sessions ps
      WHERE ps.id = public.session_questions.session_id
        AND ps.student_id = (SELECT auth.uid())
    )
    OR (SELECT app.is_admin())
    OR (
      (SELECT app.is_org_staff())
      AND EXISTS (
        SELECT 1
        FROM public.practice_sessions ps
        JOIN public.profiles p ON p.id = ps.student_id
        WHERE ps.id = public.session_questions.session_id
          AND p.organization_id = (SELECT app.current_org_id())
      )
    )
  );

-- ------------------------------------------------------------
-- 6. Curriculum + questions: recreate admin management policies
-- ------------------------------------------------------------
CREATE POLICY "Admins can insert grade levels" ON public.grade_levels
  FOR INSERT TO authenticated WITH CHECK ((SELECT app.is_admin()));
CREATE POLICY "Admins can update grade levels" ON public.grade_levels
  FOR UPDATE TO authenticated USING ((SELECT app.is_admin()));
CREATE POLICY "Admins can delete grade levels" ON public.grade_levels
  FOR DELETE TO authenticated USING ((SELECT app.is_admin()));

CREATE POLICY "Admins can insert subjects" ON public.subjects
  FOR INSERT TO authenticated WITH CHECK ((SELECT app.is_admin()));
CREATE POLICY "Admins can update subjects" ON public.subjects
  FOR UPDATE TO authenticated USING ((SELECT app.is_admin()));
CREATE POLICY "Admins can delete subjects" ON public.subjects
  FOR DELETE TO authenticated USING ((SELECT app.is_admin()));

CREATE POLICY "Admins can insert topics" ON public.topics
  FOR INSERT TO authenticated WITH CHECK ((SELECT app.is_admin()));
CREATE POLICY "Admins can update topics" ON public.topics
  FOR UPDATE TO authenticated USING ((SELECT app.is_admin()));
CREATE POLICY "Admins can delete topics" ON public.topics
  FOR DELETE TO authenticated USING ((SELECT app.is_admin()));

CREATE POLICY "Admins can insert sub topics" ON public.sub_topics
  FOR INSERT TO authenticated WITH CHECK ((SELECT app.is_admin()));
CREATE POLICY "Admins can update sub topics" ON public.sub_topics
  FOR UPDATE TO authenticated USING ((SELECT app.is_admin()));
CREATE POLICY "Admins can delete sub topics" ON public.sub_topics
  FOR DELETE TO authenticated USING ((SELECT app.is_admin()));

CREATE POLICY "Admins can insert questions" ON public.questions
  FOR INSERT TO authenticated WITH CHECK ((SELECT app.is_admin()));
CREATE POLICY "Admins can update questions" ON public.questions
  FOR UPDATE TO authenticated USING ((SELECT app.is_admin()));
CREATE POLICY "Admins can delete questions" ON public.questions
  FOR DELETE TO authenticated USING ((SELECT app.is_admin()));

-- ------------------------------------------------------------
-- 7. Announcements: admins manage everything; other roles read
--    non-expired rows for their audience. 'parents_only' rows stay
--    admin-visible only (legacy audience value, cleaned up in P4).
-- ------------------------------------------------------------
CREATE POLICY "Admins can insert announcements" ON public.announcements
  FOR INSERT TO authenticated WITH CHECK ((SELECT app.is_admin()));
CREATE POLICY "Admins can update announcements" ON public.announcements
  FOR UPDATE TO authenticated USING ((SELECT app.is_admin()));
CREATE POLICY "Admins can delete announcements" ON public.announcements
  FOR DELETE TO authenticated USING ((SELECT app.is_admin()));
CREATE POLICY "Admins can view all announcements" ON public.announcements
  FOR SELECT TO authenticated USING ((SELECT app.is_admin()));

CREATE POLICY "Org members can view relevant announcements"
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (
    (expires_at IS NULL OR expires_at > now())
    AND (
      (
        target_audience = ANY (ARRAY['all'::public.announcement_audience, 'students_only'::public.announcement_audience])
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.user_type = 'student'::public.user_role
        )
      )
      OR (
        target_audience = 'all'::public.announcement_audience
        AND (SELECT app.is_org_staff())
      )
    )
  );

CREATE OR REPLACE FUNCTION public.get_unread_announcement_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer
  FROM announcements a
  WHERE (a.expires_at IS NULL OR a.expires_at > NOW())
    AND (
      (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND user_type = 'student')
       AND a.target_audience IN ('all', 'students_only'))
      OR (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND user_type IN ('manager', 'teacher'))
          AND a.target_audience = 'all')
    )
    AND NOT EXISTS (
      SELECT 1 FROM announcement_reads ar
      WHERE ar.announcement_id = a.id AND ar.user_id = (SELECT auth.uid())
    );
$$;

-- ------------------------------------------------------------
-- 8. question_feedback: reporter or admin reads; admin manages
-- ------------------------------------------------------------
CREATE POLICY "View feedback: reporter or admin" ON public.question_feedback
  FOR SELECT TO authenticated
  USING (reported_by = (SELECT auth.uid()) OR (SELECT app.is_admin()));
CREATE POLICY "Admins can update feedback" ON public.question_feedback
  FOR UPDATE TO authenticated USING ((SELECT app.is_admin()));
CREATE POLICY "Admins can delete feedback" ON public.question_feedback
  FOR DELETE TO authenticated USING ((SELECT app.is_admin()));

-- ------------------------------------------------------------
-- 9. payment_history: detached financial archive, admin-only read
-- ------------------------------------------------------------
CREATE POLICY "Admins can read payment history" ON public.payment_history
  FOR SELECT TO authenticated USING ((SELECT app.is_admin()));

-- ------------------------------------------------------------
-- 10. create_practice_session: no daily limit, caller must be the
--     student. Question assignment bookkeeping unchanged.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_practice_session(
  p_student_id uuid,
  p_topic_id uuid,
  p_grade_level_id uuid,
  p_subject_id uuid,
  p_questions jsonb,
  p_cycle_number integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session_id uuid;
  v_total_questions int;
BEGIN
  IF p_student_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Cannot create a practice session for another student';
  END IF;

  v_total_questions := jsonb_array_length(p_questions);

  IF v_total_questions = 0 THEN
    RAISE EXCEPTION 'Questions array cannot be empty';
  END IF;

  INSERT INTO practice_sessions (
    student_id,
    topic_id,
    grade_level_id,
    subject_id,
    total_questions,
    current_question_index,
    correct_count
  )
  VALUES (
    p_student_id,
    p_topic_id,
    p_grade_level_id,
    p_subject_id,
    v_total_questions,
    0,
    0
  )
  RETURNING id INTO v_session_id;

  -- Preserve question order
  INSERT INTO session_questions (session_id, question_id, question_order)
  SELECT
    v_session_id,
    (q->>'question_id')::uuid,
    (q->>'question_order')::int
  FROM jsonb_array_elements(p_questions) AS q;

  -- Track which questions were used (cycle-based selection)
  INSERT INTO student_question_progress (student_id, topic_id, question_id, cycle_number)
  SELECT
    p_student_id,
    p_topic_id,
    (q->>'question_id')::uuid,
    p_cycle_number
  FROM jsonb_array_elements(p_questions) AS q
  ON CONFLICT (student_id, topic_id, question_id, cycle_number) DO NOTHING;

  RETURN v_session_id;
END;
$$;

ALTER FUNCTION public.create_practice_session(uuid, uuid, uuid, uuid, jsonb, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_practice_session(uuid, uuid, uuid, uuid, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_practice_session(uuid, uuid, uuid, uuid, jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_practice_session(uuid, uuid, uuid, uuid, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_practice_session(uuid, uuid, uuid, uuid, jsonb, integer) TO service_role;

-- ------------------------------------------------------------
-- 11. complete_practice_session: grading stays (correct_count is
--     recomputed from server-graded practice_answers), rewards are
--     gone. Returns {correct_count, total}.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_practice_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid;
  v_completed_at timestamptz;
  v_total_questions integer;
  v_correct_count integer;
  v_total_time_seconds integer;
BEGIN
  SELECT student_id, completed_at, total_questions
  INTO v_student_id, v_completed_at, v_total_questions
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
