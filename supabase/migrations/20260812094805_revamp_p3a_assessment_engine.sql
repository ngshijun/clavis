-- ============================================================
-- Clavis 2.0 revamp — P3a part 2/2: assessment engine
--
-- Decisions 25-29:
--   * assessments / assessment_questions (bank row XOR ad-hoc JSONB
--     payload) / assessment_assignments (class XOR student target)
--   * one attempt per (assessment, student), resumable, with a
--     per-attempt question-order snapshot (attempt_questions)
--   * server-owned grading: a BEFORE trigger on attempt_answers
--     recomputes is_correct from the bank row or the payload — the
--     client is never trusted, exactly like practice_answers
--   * server-enforced time limit (started_at + limit + 30s grace) on
--     answer writes; due date enforced at start only
--   * lifecycle RPCs start_assessment_attempt /
--     complete_assessment_attempt (SECURITY DEFINER, row-locked,
--     idempotent); direct writes to attempts are revoked
--
-- Access model (decision 29): teacher AND manager build assessments,
-- org-scoped — manager org-wide, teacher over what they created /
-- their own classes. Platform admin sees everything.
-- ============================================================

CREATE TYPE public.assessment_status AS ENUM ('draft', 'published');

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
CREATE TABLE public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  status public.assessment_status NOT NULL DEFAULT 'draft',
  time_limit_seconds integer
    CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
  shuffle_questions boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assessments OWNER TO postgres;

COMMENT ON TABLE public.assessments IS
  'Org-scoped assessment built by a teacher or manager. Only published assessments are visible to assigned students.';

CREATE INDEX idx_assessments_organization ON public.assessments USING btree (organization_id);
CREATE INDEX idx_assessments_created_by ON public.assessments USING btree (created_by);

CREATE TRIGGER update_assessments_updated_at
  BEFORE UPDATE ON public.assessments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- A question is EITHER a reference to the global bank OR a self-contained
-- ad-hoc payload — never both, never neither.
CREATE TABLE public.assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL
    REFERENCES public.assessments(id) ON DELETE CASCADE,
  question_id uuid
    REFERENCES public.questions(id) ON DELETE RESTRICT,
  payload jsonb,
  position integer NOT NULL CHECK (position >= 0),
  points integer NOT NULL DEFAULT 1 CHECK (points > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_questions_one_source
    CHECK (num_nonnulls(question_id, payload) = 1),
  CONSTRAINT assessment_questions_payload_shape
    CHECK (
      payload IS NULL
      OR (
        jsonb_typeof(payload) = 'object'
        AND COALESCE(payload->>'type', '') IN ('mcq', 'mrq', 'short_answer')
      )
    )
);

ALTER TABLE public.assessment_questions OWNER TO postgres;

COMMENT ON TABLE public.assessment_questions IS
  'Ordered questions of an assessment. Exactly one of question_id (global bank) or payload (ad-hoc) is set.';
COMMENT ON COLUMN public.assessment_questions.payload IS
  'Ad-hoc question: {type: mcq|mrq|short_answer, question: text, options: [{text, is_correct}], answer: text, explanation: text}. Correct MCQ/MRQ option numbers are the 1-based ordinals of the options array.';

CREATE INDEX idx_assessment_questions_assessment
  ON public.assessment_questions USING btree (assessment_id, position);
CREATE INDEX idx_assessment_questions_question
  ON public.assessment_questions USING btree (question_id);

-- A student's assigned set is the union of direct + class targets.
CREATE TABLE public.assessment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL
    REFERENCES public.assessments(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  due_at timestamptz,
  assigned_by uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_assignments_one_target
    CHECK (num_nonnulls(class_id, student_id) = 1)
);

ALTER TABLE public.assessment_assignments OWNER TO postgres;

COMMENT ON TABLE public.assessment_assignments IS
  'Assignment of an assessment to exactly one target: a class or a single student.';

CREATE INDEX idx_assessment_assignments_assessment
  ON public.assessment_assignments USING btree (assessment_id);
CREATE INDEX idx_assessment_assignments_class
  ON public.assessment_assignments USING btree (class_id);
CREATE INDEX idx_assessment_assignments_student
  ON public.assessment_assignments USING btree (student_id);
CREATE INDEX idx_assessment_assignments_assigned_by
  ON public.assessment_assignments USING btree (assigned_by);

-- The same target may only be assigned once per assessment.
CREATE UNIQUE INDEX uq_assessment_assignments_class
  ON public.assessment_assignments (assessment_id, class_id)
  WHERE class_id IS NOT NULL;
CREATE UNIQUE INDEX uq_assessment_assignments_student
  ON public.assessment_assignments (assessment_id, student_id)
  WHERE student_id IS NOT NULL;

-- Decision 26: one attempt per (assessment, student). Retakes are future work.
CREATE TABLE public.assessment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL
    REFERENCES public.assessments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL
    REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  correct_count integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  total_questions integer NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
  score_percent integer NOT NULL DEFAULT 0 CHECK (score_percent BETWEEN 0 AND 100),
  current_question_index integer NOT NULL DEFAULT 0 CHECK (current_question_index >= 0),
  CONSTRAINT assessment_attempts_one_per_student UNIQUE (assessment_id, student_id)
);

ALTER TABLE public.assessment_attempts OWNER TO postgres;

COMMENT ON TABLE public.assessment_attempts IS
  'One resumable attempt per (assessment, student). Created and scored only by start_assessment_attempt / complete_assessment_attempt; the client may only advance current_question_index.';

CREATE INDEX idx_assessment_attempts_student
  ON public.assessment_attempts USING btree (student_id);

-- Per-attempt question order snapshot: shuffled at start when the
-- assessment says so, otherwise the builder's position order.
CREATE TABLE public.attempt_questions (
  attempt_id uuid NOT NULL
    REFERENCES public.assessment_attempts(id) ON DELETE CASCADE,
  assessment_question_id uuid NOT NULL
    REFERENCES public.assessment_questions(id) ON DELETE CASCADE,
  question_order integer NOT NULL,
  PRIMARY KEY (attempt_id, assessment_question_id),
  CONSTRAINT attempt_questions_unique_order UNIQUE (attempt_id, question_order)
);

ALTER TABLE public.attempt_questions OWNER TO postgres;

COMMENT ON TABLE public.attempt_questions IS
  'Frozen question order for one attempt. Written only by start_assessment_attempt.';

CREATE INDEX idx_attempt_questions_assessment_question
  ON public.attempt_questions USING btree (assessment_question_id);

CREATE TABLE public.attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL
    REFERENCES public.assessment_attempts(id) ON DELETE CASCADE,
  assessment_question_id uuid NOT NULL
    REFERENCES public.assessment_questions(id) ON DELETE CASCADE,
  selected_options integer[],
  text_answer text,
  is_correct boolean NOT NULL DEFAULT false,
  time_spent_seconds integer CHECK (time_spent_seconds IS NULL OR time_spent_seconds >= 0),
  answered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attempt_answers_one_per_question UNIQUE (attempt_id, assessment_question_id)
);

ALTER TABLE public.attempt_answers OWNER TO postgres;

COMMENT ON TABLE public.attempt_answers IS
  'One answer per attempt question (upsert on (attempt_id, assessment_question_id) while the attempt is open). is_correct is server-owned: grade_attempt_answer overwrites whatever arrives.';

CREATE INDEX idx_attempt_answers_assessment_question
  ON public.attempt_answers USING btree (assessment_question_id);

-- ------------------------------------------------------------
-- 2. RLS helpers (schema app, SECURITY DEFINER STABLE, owner postgres).
--    Definer on purpose: they let policies reach parent rows without
--    triggering the referenced table's own policies, which keeps every
--    policy below flat and cycle-free.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.assessment_org_id(p_assessment_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT organization_id FROM public.assessments WHERE id = p_assessment_id;
$$;

-- Admin, manager of the assessment's org, or the teacher who created it.
CREATE OR REPLACE FUNCTION app.can_write_assessment(p_assessment_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id = p_assessment_id
      AND (
        app.is_admin()
        OR (
          a.organization_id = app.current_org_id()
          AND (app.is_manager() OR a.created_by = auth.uid())
        )
      )
  );
$$;

-- Published AND assigned to the caller, directly or through a class.
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
          SELECT 1 FROM public.class_members cm
          WHERE cm.class_id = aa.class_id
            AND cm.student_id = auth.uid()
        )
      )
  );
$$;

-- The attempt's owner, a platform admin, or staff of the assessment's org.
CREATE OR REPLACE FUNCTION app.can_read_attempt(p_attempt_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assessment_attempts att
    JOIN public.assessments a ON a.id = att.assessment_id
    WHERE att.id = p_attempt_id
      AND (
        att.student_id = auth.uid()
        OR app.is_admin()
        OR (app.is_org_staff() AND a.organization_id = app.current_org_id())
      )
  );
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'app.assessment_org_id(uuid)',
    'app.can_write_assessment(uuid)',
    'app.student_assessment_visible(uuid)',
    'app.can_read_attempt(uuid)'
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
-- 3. Grants. Supabase's default privileges grant ALL on new public
--    tables to anon/authenticated, so every revoke below is
--    load-bearing.
-- ------------------------------------------------------------
REVOKE ALL ON TABLE public.assessments FROM PUBLIC;
REVOKE ALL ON TABLE public.assessments FROM anon;
REVOKE ALL ON TABLE public.assessments FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessments TO authenticated;
GRANT ALL ON TABLE public.assessments TO service_role;

REVOKE ALL ON TABLE public.assessment_questions FROM PUBLIC;
REVOKE ALL ON TABLE public.assessment_questions FROM anon;
REVOKE ALL ON TABLE public.assessment_questions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessment_questions TO authenticated;
GRANT ALL ON TABLE public.assessment_questions TO service_role;

REVOKE ALL ON TABLE public.assessment_assignments FROM PUBLIC;
REVOKE ALL ON TABLE public.assessment_assignments FROM anon;
REVOKE ALL ON TABLE public.assessment_assignments FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessment_assignments TO authenticated;
GRANT ALL ON TABLE public.assessment_assignments TO service_role;

-- Attempts are RPC-owned. The only client-writable column is the
-- resumable cursor; correct_count / score_percent / total_questions /
-- completed_at stay server-owned, mirroring practice_sessions.
REVOKE ALL ON TABLE public.assessment_attempts FROM PUBLIC;
REVOKE ALL ON TABLE public.assessment_attempts FROM anon;
REVOKE ALL ON TABLE public.assessment_attempts FROM authenticated;
GRANT SELECT ON TABLE public.assessment_attempts TO authenticated;
GRANT UPDATE (current_question_index) ON TABLE public.assessment_attempts TO authenticated;
GRANT ALL ON TABLE public.assessment_attempts TO service_role;

-- The order snapshot is written by start_assessment_attempt only.
REVOKE ALL ON TABLE public.attempt_questions FROM PUBLIC;
REVOKE ALL ON TABLE public.attempt_questions FROM anon;
REVOKE ALL ON TABLE public.attempt_questions FROM authenticated;
GRANT SELECT ON TABLE public.attempt_questions TO authenticated;
GRANT ALL ON TABLE public.attempt_questions TO service_role;

-- is_correct is deliberately absent from both column lists: the client
-- cannot send it at all, and the grading trigger owns it.
REVOKE ALL ON TABLE public.attempt_answers FROM PUBLIC;
REVOKE ALL ON TABLE public.attempt_answers FROM anon;
REVOKE ALL ON TABLE public.attempt_answers FROM authenticated;
GRANT SELECT ON TABLE public.attempt_answers TO authenticated;
GRANT INSERT (attempt_id, assessment_question_id, selected_options, text_answer, time_spent_seconds, answered_at)
  ON TABLE public.attempt_answers TO authenticated;
GRANT UPDATE (attempt_id, assessment_question_id, selected_options, text_answer, time_spent_seconds, answered_at)
  ON TABLE public.attempt_answers TO authenticated;
GRANT ALL ON TABLE public.attempt_answers TO service_role;

-- ------------------------------------------------------------
-- 4. RLS: assessments
-- ------------------------------------------------------------
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage assessments"
  ON public.assessments
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Read assessments: org staff, assigned students"
  ON public.assessments
  FOR SELECT
  TO authenticated
  USING (
    ((SELECT app.is_org_staff()) AND organization_id = (SELECT app.current_org_id()))
    OR app.student_assessment_visible(id)
  );

CREATE POLICY "Create assessments: org staff in own org"
  ON public.assessments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app.is_org_staff())
    AND organization_id = (SELECT app.current_org_id())
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY "Update assessments: manager org-wide, teacher own"
  ON public.assessments
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = (SELECT app.current_org_id())
    AND ((SELECT app.is_manager()) OR created_by = (SELECT auth.uid()))
  )
  WITH CHECK (
    organization_id = (SELECT app.current_org_id())
    AND ((SELECT app.is_manager()) OR created_by = (SELECT auth.uid()))
  );

CREATE POLICY "Delete assessments: manager org-wide, teacher own"
  ON public.assessments
  FOR DELETE
  TO authenticated
  USING (
    organization_id = (SELECT app.current_org_id())
    AND ((SELECT app.is_manager()) OR created_by = (SELECT auth.uid()))
  );

-- ------------------------------------------------------------
-- 5. RLS: assessment_questions
-- ------------------------------------------------------------
ALTER TABLE public.assessment_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read assessment questions: org staff, assigned students"
  ON public.assessment_questions
  FOR SELECT
  TO authenticated
  USING (
    (SELECT app.is_admin())
    OR (
      (SELECT app.is_org_staff())
      AND app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    )
    OR app.student_assessment_visible(assessment_id)
  );

CREATE POLICY "Write assessment questions: assessment writers"
  ON public.assessment_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (app.can_write_assessment(assessment_id));

CREATE POLICY "Update assessment questions: assessment writers"
  ON public.assessment_questions
  FOR UPDATE
  TO authenticated
  USING (app.can_write_assessment(assessment_id))
  WITH CHECK (app.can_write_assessment(assessment_id));

CREATE POLICY "Delete assessment questions: assessment writers"
  ON public.assessment_questions
  FOR DELETE
  TO authenticated
  USING (app.can_write_assessment(assessment_id));

-- ------------------------------------------------------------
-- 6. RLS: assessment_assignments
-- ------------------------------------------------------------
ALTER TABLE public.assessment_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage assignments"
  ON public.assessment_assignments
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

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
    OR app.is_class_member(class_id)
  );

-- Decision 29: manager targets any org class/student; teacher targets
-- their own classes / students of their org.
CREATE POLICY "Create assignments: manager org-wide, teacher own classes"
  ON public.assessment_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app.is_org_staff())
    AND assigned_by = (SELECT auth.uid())
    AND app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    AND (
      class_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = public.assessment_assignments.class_id
          AND c.organization_id = (SELECT app.current_org_id())
          AND ((SELECT app.is_manager()) OR c.teacher_id = (SELECT auth.uid()))
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
      class_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = public.assessment_assignments.class_id
          AND c.organization_id = (SELECT app.current_org_id())
          AND ((SELECT app.is_manager()) OR c.teacher_id = (SELECT auth.uid()))
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
-- 7. RLS: attempts and their children
-- ------------------------------------------------------------
ALTER TABLE public.assessment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read attempts: self, admin, assessment-org staff"
  ON public.assessment_attempts
  FOR SELECT
  TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR (SELECT app.is_admin())
    OR (
      (SELECT app.is_org_staff())
      AND app.assessment_org_id(assessment_id) = (SELECT app.current_org_id())
    )
  );

-- The resumable cursor is the only thing a client may write, and only
-- while the attempt is open. Everything else is RPC-owned (and the
-- column grants above make that structural, not just policy-deep).
CREATE POLICY "Advance own open attempt"
  ON public.assessment_attempts
  FOR UPDATE
  TO authenticated
  USING (student_id = (SELECT auth.uid()) AND completed_at IS NULL)
  WITH CHECK (student_id = (SELECT auth.uid()) AND completed_at IS NULL);

ALTER TABLE public.attempt_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read attempt questions: whoever may read the attempt"
  ON public.attempt_questions
  FOR SELECT
  TO authenticated
  USING (app.can_read_attempt(attempt_id));

ALTER TABLE public.attempt_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read attempt answers: whoever may read the attempt"
  ON public.attempt_answers
  FOR SELECT
  TO authenticated
  USING (app.can_read_attempt(attempt_id));

-- Answer writes: own attempt, still open, and the question must belong
-- to that attempt's frozen snapshot (mirrors the practice_answers
-- session-membership rule, so a score can never exceed the total).
CREATE POLICY "Answer own open attempt"
  ON public.attempt_answers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessment_attempts att
      WHERE att.id = public.attempt_answers.attempt_id
        AND att.student_id = (SELECT auth.uid())
        AND att.completed_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.attempt_questions atq
      WHERE atq.attempt_id = public.attempt_answers.attempt_id
        AND atq.assessment_question_id = public.attempt_answers.assessment_question_id
    )
  );

CREATE POLICY "Revise own open attempt answer"
  ON public.attempt_answers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_attempts att
      WHERE att.id = public.attempt_answers.attempt_id
        AND att.student_id = (SELECT auth.uid())
        AND att.completed_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessment_attempts att
      WHERE att.id = public.attempt_answers.attempt_id
        AND att.student_id = (SELECT auth.uid())
        AND att.completed_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.attempt_questions atq
      WHERE atq.attempt_id = public.attempt_answers.attempt_id
        AND atq.assessment_question_id = public.attempt_answers.assessment_question_id
    )
  );

-- ------------------------------------------------------------
-- 8. Server-side grading (decision 28)
--
-- Mirrors grade_practice_answer: short answer is a trimmed,
-- case-insensitive equality; MCQ/MRQ is exact set equality over the
-- selected option numbers. The answer key comes from the bank row when
-- question_id is set, otherwise from the ad-hoc JSONB payload — which
-- is author-supplied, so it is validated defensively: anything
-- malformed grades FALSE instead of raising.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grade_attempt_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_question_id uuid;
  v_payload jsonb;
  v_type text;
  v_answer text;
  v_correct_options integer[];
  v_opt_1 boolean;
  v_opt_2 boolean;
  v_opt_3 boolean;
  v_opt_4 boolean;
BEGIN
  -- Default deny: whatever the client sent is discarded here.
  NEW.is_correct := FALSE;

  SELECT aq.question_id, aq.payload
  INTO v_question_id, v_payload
  FROM assessment_questions aq
  WHERE aq.id = NEW.assessment_question_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_question_id IS NOT NULL THEN
    SELECT
      q.type::text,
      q.answer,
      q.option_1_is_correct,
      q.option_2_is_correct,
      q.option_3_is_correct,
      q.option_4_is_correct
    INTO v_type, v_answer, v_opt_1, v_opt_2, v_opt_3, v_opt_4
    FROM questions q
    WHERE q.id = v_question_id;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    v_correct_options := ARRAY(
      SELECT opt_num FROM (
        VALUES (1, v_opt_1), (2, v_opt_2), (3, v_opt_3), (4, v_opt_4)
      ) AS o(opt_num, is_correct)
      WHERE o.is_correct IS TRUE
      ORDER BY opt_num
    );
  ELSE
    BEGIN
      IF jsonb_typeof(v_payload) IS DISTINCT FROM 'object' THEN
        RETURN NEW;
      END IF;

      v_type := v_payload->>'type';
      v_answer := v_payload->>'answer';

      IF v_type IS NULL OR v_type NOT IN ('mcq', 'mrq', 'short_answer') THEN
        RETURN NEW;
      END IF;

      IF v_type IN ('mcq', 'mrq') THEN
        IF jsonb_typeof(v_payload->'options') IS DISTINCT FROM 'array' THEN
          RETURN NEW;
        END IF;

        -- Option numbers are the 1-based ordinals of the options array,
        -- matching the bank's option_1..option_4 numbering.
        v_correct_options := ARRAY(
          SELECT o.ord::integer
          FROM jsonb_array_elements(v_payload->'options') WITH ORDINALITY AS o(elem, ord)
          WHERE jsonb_typeof(o.elem) = 'object'
            AND o.elem->'is_correct' = 'true'::jsonb
          ORDER BY o.ord
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- A malformed payload must never brick an attempt.
      NEW.is_correct := FALSE;
      RETURN NEW;
    END;
  END IF;

  IF v_type = 'short_answer' THEN
    NEW.is_correct := (
      v_answer IS NOT NULL
      AND btrim(v_answer) <> ''
      AND NEW.text_answer IS NOT NULL
      AND lower(btrim(NEW.text_answer)) = lower(btrim(v_answer))
    );
  ELSIF v_type IN ('mcq', 'mrq') THEN
    -- A question with no correct option cannot be answered correctly.
    NEW.is_correct := (
      NEW.selected_options IS NOT NULL
      AND COALESCE(array_length(v_correct_options, 1), 0) > 0
      AND ARRAY(SELECT DISTINCT unnest(NEW.selected_options) ORDER BY 1) = v_correct_options
    );
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.grade_attempt_answer() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.grade_attempt_answer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grade_attempt_answer() FROM anon;
REVOKE ALL ON FUNCTION public.grade_attempt_answer() FROM authenticated;

-- ------------------------------------------------------------
-- 9. Server-side time limit (decision 27)
--
-- Answer writes are rejected past started_at + time_limit_seconds + 30s
-- of grace (clock skew / in-flight requests). Completion is allowed at
-- any time — only answering is time-boxed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_attempt_time_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_time_limit integer;
BEGIN
  SELECT att.started_at, att.completed_at, a.time_limit_seconds
  INTO v_started_at, v_completed_at, v_time_limit
  FROM assessment_attempts att
  JOIN assessments a ON a.id = att.assessment_id
  WHERE att.id = NEW.attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found: %', NEW.attempt_id;
  END IF;

  IF v_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Attempt already completed: %', NEW.attempt_id;
  END IF;

  IF v_time_limit IS NOT NULL
     AND now() > v_started_at + make_interval(secs => v_time_limit + 30) THEN
    RAISE EXCEPTION 'Assessment time limit exceeded';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_attempt_time_limit() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_attempt_time_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_attempt_time_limit() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_attempt_time_limit() FROM authenticated;

-- Trigger names put the time-limit check first (triggers on the same
-- event fire in name order), so an expired write is rejected before any
-- grading work happens.
CREATE TRIGGER trg_attempt_answer_time_limit
  BEFORE INSERT OR UPDATE ON public.attempt_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_attempt_time_limit();

CREATE TRIGGER trg_grade_attempt_answer
  BEFORE INSERT OR UPDATE OF selected_options, text_answer, assessment_question_id, is_correct
  ON public.attempt_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.grade_attempt_answer();

-- ------------------------------------------------------------
-- 10. Lifecycle RPCs (decision 27)
-- ------------------------------------------------------------

-- Starts — or resumes — the caller's single attempt at an assessment.
--
-- Returns {attempt_id, started_at, total_questions, current_question_index,
--          time_limit_seconds, expires_at, resumed}.
-- expires_at excludes the 30s server grace on purpose: it is the deadline
-- the client should display and count down to.
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
            SELECT 1 FROM class_members cm
            WHERE cm.class_id = aa.class_id
              AND cm.student_id = v_student_id
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
            SELECT 1 FROM class_members cm
            WHERE cm.class_id = aa.class_id
              AND cm.student_id = v_student_id
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

-- Scores and closes the caller's attempt.
--
-- Returns {correct_count, total, score_percent, already_completed}.
-- Idempotent: re-completing returns the stored result instead of raising,
-- so a timer auto-submit racing a manual submit cannot surface an error.
-- score_percent is points-weighted (assessment_questions.points), which
-- equals the plain correct/total ratio while every question is worth 1.
CREATE OR REPLACE FUNCTION public.complete_assessment_attempt(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid;
  v_completed_at timestamptz;
  v_correct_count integer;
  v_total_questions integer;
  v_score_percent integer;
  v_earned_points integer;
  v_total_points integer;
BEGIN
  -- FOR UPDATE serializes concurrent completions of the same attempt.
  SELECT student_id, completed_at, correct_count, total_questions, score_percent
  INTO v_student_id, v_completed_at, v_correct_count, v_total_questions, v_score_percent
  FROM assessment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found: %', p_attempt_id;
  END IF;

  IF v_student_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Cannot complete another student''s attempt';
  END IF;

  IF v_completed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'correct_count', v_correct_count,
      'total', v_total_questions,
      'score_percent', v_score_percent,
      'already_completed', true
    );
  END IF;

  -- Score from the frozen snapshot and the server-graded answer rows.
  -- Unanswered questions simply have no attempt_answers row.
  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(aq.points), 0)::integer,
    COUNT(*) FILTER (WHERE ans.is_correct)::integer,
    COALESCE(SUM(aq.points) FILTER (WHERE ans.is_correct), 0)::integer
  INTO v_total_questions, v_total_points, v_correct_count, v_earned_points
  FROM attempt_questions atq
  JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
  LEFT JOIN attempt_answers ans
    ON ans.attempt_id = atq.attempt_id
   AND ans.assessment_question_id = atq.assessment_question_id
  WHERE atq.attempt_id = p_attempt_id;

  v_score_percent := COALESCE(
    round((100.0 * v_earned_points) / NULLIF(v_total_points, 0))::integer,
    0
  );

  UPDATE assessment_attempts
  SET
    completed_at = now(),
    correct_count = v_correct_count,
    total_questions = v_total_questions,
    score_percent = v_score_percent
  WHERE id = p_attempt_id;

  RETURN jsonb_build_object(
    'correct_count', v_correct_count,
    'total', v_total_questions,
    'score_percent', v_score_percent,
    'already_completed', false
  );
END;
$$;

ALTER FUNCTION public.complete_assessment_attempt(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.complete_assessment_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_assessment_attempt(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_assessment_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_assessment_attempt(uuid) TO service_role;

-- ------------------------------------------------------------
-- 11. Question bank access for org staff (decision 29)
--
-- No policy change is needed and none is added: the audit-era policy
-- "Questions are viewable by authenticated users" (20260530000004) is
-- USING (true) TO authenticated, so managers and teachers already have
-- the SELECT the bank picker needs. The audit fix that policy carries —
-- anon has no grant and no policy on public.questions — must stay in
-- place; adding a duplicate staff policy would only be noise.
-- ------------------------------------------------------------
