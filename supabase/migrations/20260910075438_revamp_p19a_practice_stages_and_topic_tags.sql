-- ============================================================
-- Clavis revamp — P19a: the curriculum trunk stops at the topic.
--
-- Until now ONE level, `sub_topics`, was the leaf for both products:
-- practice filed its questions, sessions, cycle progress and learning-map
-- stats there, and the assessment bank filed its questions there too. The
-- two want different granularity, so the trunk
--
--     grade_level -> subject -> topic
--
-- becomes genuinely global and BRANCHES at the topic:
--
--     topic -> stages      (practice: an ordered path a student climbs,
--                           each stage holding its own question pool and
--                           its own star/mastery row)
--     topic -> sub_topics  (assessment: a filing dimension the generator
--                           draws pools from — no path, no stars)
--
-- A learning-point tag has to mean something on BOTH sides, so its scope
-- moves up to the shared level: `tag_topics` replaces P18b's
-- `tag_sub_topics`.
--
-- Conversion is 1:1 and lossless. Every existing sub-topic becomes a stage
-- REUSING ITS ID, so repointing practice is pure metadata — no value
-- rewrite, no id map, and the copied `cover_image_path` strings keep
-- resolving to the same storage objects. Launched practice content and
-- every student's history survive exactly as they are. The assessment bank
-- is untouched: `sub_topics` keeps the same rows and ids.
--
-- Nothing here is a compatibility layer: the sub-topic practice columns are
-- renamed, not duplicated, and `tag_sub_topics` is dropped.
-- ============================================================

-- ------------------------------------------------------------
-- 1. stages — the practice path under a topic
--
-- Same shape as sub_topics (a stage IS what a practice sub-topic was), but
-- SELECT is granted to `authenticated` only: sub_topics' legacy
-- "viewable by everyone" policy let anon read the curriculum, and there is
-- no reason to carry that into a new table.
-- ------------------------------------------------------------
CREATE TABLE public.stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  cover_image_path text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stages OWNER TO postgres;

COMMENT ON TABLE public.stages IS
  'The practice path under a topic: ordered stages, each holding its own practice questions. Practice questions, sessions, cycle progress and learning-map stats all reference stages. display_order defines the map order. Assessment questions are filed under sub_topics instead.';

CREATE INDEX idx_stages_topic_id ON public.stages USING btree (topic_id);
CREATE INDEX idx_stages_display_order ON public.stages USING btree (display_order);

CREATE TRIGGER update_stages_updated_at
  BEFORE UPDATE ON public.stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can insert stages" ON public.stages
  FOR INSERT TO authenticated WITH CHECK ((SELECT app.is_admin()));
CREATE POLICY "Admins can update stages" ON public.stages
  FOR UPDATE TO authenticated USING ((SELECT app.is_admin()));
CREATE POLICY "Admins can delete stages" ON public.stages
  FOR DELETE TO authenticated USING ((SELECT app.is_admin()));
CREATE POLICY "Read stages: authenticated" ON public.stages
  FOR SELECT TO authenticated USING (true);

-- Supabase's default privileges grant ALL on new public tables to
-- anon/authenticated, so the revokes below are load-bearing.
REVOKE ALL ON TABLE public.stages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stages TO authenticated;
GRANT ALL ON TABLE public.stages TO service_role;

-- ------------------------------------------------------------
-- 2. Every sub-topic becomes a stage, keeping its id
-- ------------------------------------------------------------
INSERT INTO public.stages (
  id, topic_id, name, cover_image_path, display_order, created_at, updated_at
)
SELECT
  st.id,
  st.topic_id,
  st.name,
  st.cover_image_path,
  COALESCE(st.display_order, 0),
  COALESCE(st.created_at, now()),
  COALESCE(st.updated_at, now())
FROM public.sub_topics st;

-- ------------------------------------------------------------
-- 3. Practice points at stages
--
-- The values already satisfy the new foreign keys (step 2 copied the ids),
-- so each repoint is a rename plus a constraint swap. Column-level grants
-- and RLS policies are stored by attribute number / parse tree, so they
-- follow the rename untouched — only the names people read are refreshed.
-- ------------------------------------------------------------
ALTER TABLE public.questions RENAME COLUMN sub_topic_id TO stage_id;
ALTER TABLE public.questions DROP CONSTRAINT questions_sub_topic_id_fkey;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_stage_id_fkey
  FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;
ALTER INDEX public.idx_questions_sub_topic RENAME TO idx_questions_stage;

COMMENT ON TABLE public.questions IS
  'Practice question bank, filed under a stage. `authenticated` may SELECT content columns only; answer, option_N_is_correct and option_N_tip are column-revoked. Students read session content through get_practice_session_questions(); admins read keys through get_bank_questions()/get_bank_question().';

ALTER TABLE public.practice_sessions RENAME COLUMN sub_topic_id TO stage_id;
ALTER TABLE public.practice_sessions DROP CONSTRAINT practice_sessions_sub_topic_id_fkey;
ALTER TABLE public.practice_sessions
  ADD CONSTRAINT practice_sessions_stage_id_fkey
  FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;
ALTER INDEX public.idx_practice_sessions_sub_topic RENAME TO idx_practice_sessions_stage;

ALTER TABLE public.student_question_progress RENAME COLUMN sub_topic_id TO stage_id;
ALTER TABLE public.student_question_progress
  DROP CONSTRAINT student_question_progress_sub_topic_id_fkey;
ALTER TABLE public.student_question_progress
  ADD CONSTRAINT student_question_progress_stage_id_fkey
  FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;
ALTER INDEX public.idx_student_question_progress_sub_topic_id
  RENAME TO idx_student_question_progress_stage_id;

ALTER TABLE public.student_sub_topic_stats RENAME TO student_stage_stats;
ALTER TABLE public.student_stage_stats RENAME COLUMN sub_topic_id TO stage_id;
ALTER TABLE public.student_stage_stats
  DROP CONSTRAINT student_sub_topic_stats_sub_topic_id_fkey;
ALTER TABLE public.student_stage_stats
  ADD CONSTRAINT student_stage_stats_stage_id_fkey
  FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;
ALTER TABLE public.student_stage_stats
  RENAME CONSTRAINT student_sub_topic_stats_pkey TO student_stage_stats_pkey;
ALTER TABLE public.student_stage_stats
  RENAME CONSTRAINT student_sub_topic_stats_student_id_fkey
  TO student_stage_stats_student_id_fkey;
ALTER INDEX public.idx_student_sub_topic_stats_sub_topic
  RENAME TO idx_student_stage_stats_stage;
ALTER POLICY "Read sub-topic stats: self, admin, same-org staff"
  ON public.student_stage_stats
  RENAME TO "Read stage stats: self, admin, same-org staff";

COMMENT ON TABLE public.student_stage_stats IS
  'Learning-map progress per student per stage. Written only by submit_practice_session; stars are derived from best_score_percent on the client, never stored.';

-- ------------------------------------------------------------
-- 4. sub_topics is assessment filing only
--
-- cover_image_path existed for the learning map, which is the stages' job
-- now. The stage rows carry the same paths, so no storage object is
-- orphaned by this drop.
-- ------------------------------------------------------------
ALTER TABLE public.sub_topics DROP COLUMN cover_image_path;

COMMENT ON TABLE public.sub_topics IS
  'Sub-topics within a topic — the ASSESSMENT bank''s filing level (assessment_bank_questions.sub_topic_id) and what a generation spec line draws its pools from. Practice uses stages instead. display_order is the admin''s preferred listing order.';

-- ------------------------------------------------------------
-- 5. reorder_stages — the practice map order
--
-- Mirrors reorder_sub_topics (P9a): admin-only, writes display_order and
-- nothing else, p_ids must be a permutation of the topic's stages.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_stages(p_topic_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_children bigint;
  v_matched bigint;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can reorder stages';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM topics WHERE id = p_topic_id) THEN
    RAISE EXCEPTION 'Topic not found: %', p_topic_id;
  END IF;

  SELECT count(*) INTO v_children
  FROM stages s WHERE s.topic_id = p_topic_id;

  SELECT count(*) INTO v_matched
  FROM stages s WHERE s.topic_id = p_topic_id AND s.id = ANY (p_ids);

  PERFORM app.assert_reorder_permutation('stages', p_ids, v_children, v_matched);

  UPDATE stages s
  SET display_order = i.ord
  FROM unnest(p_ids) WITH ORDINALITY AS i(id, ord)
  WHERE s.id = i.id
    AND s.topic_id = p_topic_id;
END;
$$;

ALTER FUNCTION public.reorder_stages(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reorder_stages(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_stages(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_stages(uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION public.reorder_stages(uuid, uuid[]) IS
  'Admin-only positional reorder of one topic''s practice stages: display_order = 1-based index of p_ids. Touches no other column.';

COMMENT ON FUNCTION public.reorder_sub_topics(uuid, uuid[]) IS
  'Admin-only positional reorder of one topic''s assessment sub-topics: display_order = 1-based index of p_ids.';

-- ------------------------------------------------------------
-- 6. A learning point is scoped to TOPICS
--
-- P18b scoped tags to sub-topics, which only existed on the assessment
-- side. The topic is the level both products share, so a tag scoped there
-- is offerable in a practice authoring surface and an assessment
-- generation line alike.
-- ------------------------------------------------------------
CREATE TABLE public.tag_topics (
  tag_id     uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  topic_id   uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, topic_id)
);

ALTER TABLE public.tag_topics OWNER TO postgres;

COMMENT ON TABLE public.tag_topics IS
  'Which topics a learning-point tag applies to. A tag picker in the context of a topic offers only the tags linked to it; a tag with no rows here is offered nowhere.';

-- The PK covers tag_id lookups; this covers the other direction (the pickers).
CREATE INDEX idx_tag_topics_topic ON public.tag_topics USING btree (topic_id);

ALTER TABLE public.tag_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tag topics"
  ON public.tag_topics
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Read tag topics: authenticated"
  ON public.tag_topics
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.tag_topics FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tag_topics TO authenticated;
GRANT ALL ON TABLE public.tag_topics TO service_role;

-- A tag scoped to a sub-topic is now scoped to that sub-topic's topic.
INSERT INTO public.tag_topics (tag_id, topic_id)
SELECT DISTINCT tst.tag_id, st.topic_id
FROM public.tag_sub_topics tst
JOIN public.sub_topics st ON st.id = tst.sub_topic_id;

DROP TABLE public.tag_sub_topics;

-- ------------------------------------------------------------
-- 7. Practice functions, rewritten for stages
--
-- Bodies are stored as text, so every function that named sub_topic_id is
-- recreated here. Signature changes (a renamed argument is a new signature
-- to PostgREST, which calls by name) are DROPped first.
-- ------------------------------------------------------------

-- 7.1 Denormalized hierarchy on write: stage -> topic -> subject -> grade
CREATE OR REPLACE FUNCTION public.populate_question_hierarchy()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SELECT s.id, s.grade_level_id INTO NEW.subject_id, NEW.grade_level_id
  FROM public.stages sg
  JOIN public.topics t ON sg.topic_id = t.id
  JOIN public.subjects s ON t.subject_id = s.id
  WHERE sg.id = NEW.stage_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.populate_session_hierarchy()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SELECT s.id, s.grade_level_id INTO NEW.subject_id, NEW.grade_level_id
  FROM public.stages sg
  JOIN public.topics t ON sg.topic_id = t.id
  JOIN public.subjects s ON t.subject_id = s.id
  WHERE sg.id = NEW.stage_id;
  RETURN NEW;
END;
$$;

-- 7.2 How many distinct questions of each stage the caller has answered
DROP FUNCTION public.get_subtopic_answered_counts();

CREATE FUNCTION public.get_stage_answered_counts()
RETURNS TABLE(stage_id uuid, answered_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ps.stage_id, count(DISTINCT pa.question_id) AS answered_count
  FROM public.practice_answers pa
  JOIN public.practice_sessions ps ON ps.id = pa.session_id
  WHERE ps.student_id = (SELECT auth.uid())
    AND pa.question_id IS NOT NULL
  GROUP BY ps.stage_id;
$$;

ALTER FUNCTION public.get_stage_answered_counts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_stage_answered_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_answered_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stage_answered_counts() TO service_role;

COMMENT ON FUNCTION public.get_stage_answered_counts() IS
  'Per stage, how many distinct questions the calling student has ever answered. Drives the practice cycle (a cycle is complete when the stage''s pool is exhausted).';

-- 7.3 Sanitized practice content by question id
CREATE OR REPLACE FUNCTION public.get_practice_questions(p_question_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      (ids.ord - 1)::int AS question_order,
      jsonb_build_object(
        'question_id', q.id,
        'question_order', (ids.ord - 1)::int,
        'type', q.type::text,
        'question', q.question,
        'image_path', q.image_path,
        'stage_id', q.stage_id,
        'subject_id', q.subject_id,
        'grade_level_id', q.grade_level_id,
        'options', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'number', o.opt_number,
                'text', o.opt_text,
                'image_path', o.opt_image
              )
              ORDER BY o.opt_number
            ),
            '[]'::jsonb
          )
          FROM (
            VALUES
              (1, q.option_1_text, q.option_1_image_path),
              (2, q.option_2_text, q.option_2_image_path),
              (3, q.option_3_text, q.option_3_image_path),
              (4, q.option_4_text, q.option_4_image_path)
          ) AS o(opt_number, opt_text, opt_image)
          WHERE btrim(COALESCE(o.opt_text, '')) <> '' OR o.opt_image IS NOT NULL
        )
      ) AS item
    FROM unnest(p_question_ids) WITH ORDINALITY AS ids(question_id, ord)
    JOIN questions q ON q.id = ids.question_id
  ) x;

  RETURN v_result;
END;
$$;

-- 7.4 Sanitized content of a stored session, in its frozen order
CREATE OR REPLACE FUNCTION public.get_practice_session_questions(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_student_id uuid;
  v_result jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT student_id INTO v_student_id
  FROM practice_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF v_student_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Cannot read another student''s session';
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      sq.question_order,
      jsonb_build_object(
        'question_id', q.id,
        'question_order', sq.question_order,
        'type', q.type::text,
        'question', q.question,
        'image_path', q.image_path,
        'stage_id', q.stage_id,
        'subject_id', q.subject_id,
        'grade_level_id', q.grade_level_id,
        'options', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'number', o.opt_number,
                'text', o.opt_text,
                'image_path', o.opt_image
              )
              ORDER BY o.opt_number
            ),
            '[]'::jsonb
          )
          FROM (
            VALUES
              (1, q.option_1_text, q.option_1_image_path),
              (2, q.option_2_text, q.option_2_image_path),
              (3, q.option_3_text, q.option_3_image_path),
              (4, q.option_4_text, q.option_4_image_path)
          ) AS o(opt_number, opt_text, opt_image)
          WHERE btrim(COALESCE(o.opt_text, '')) <> '' OR o.opt_image IS NOT NULL
        )
      ) AS item
    FROM session_questions sq
    JOIN questions q ON q.id = sq.question_id
    WHERE sq.session_id = p_session_id
  ) x;

  RETURN v_result;
END;
$$;

-- 7.5 Submit a whole practice attempt in one transaction
DROP FUNCTION public.submit_practice_session(uuid, integer, jsonb);

CREATE FUNCTION public.submit_practice_session(
  p_stage_id uuid,
  p_cycle_number integer,
  p_answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid := (SELECT auth.uid());
  v_session_id uuid;
  v_grade_level_id uuid;
  v_subject_id uuid;
  v_total_questions int;
  v_distinct_questions int;
  v_matching_questions int;
  v_correct_count int;
  v_total_time_seconds int;
  v_score_percent int;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Sessions are a student-only domain: a staff caller would fail the
  -- student_stage_stats FK below, so refuse up front.
  IF NOT EXISTS (SELECT 1 FROM student_profiles WHERE id = v_student_id) THEN
    RAISE EXCEPTION 'Only students can submit practice sessions';
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'Answers must be a json array';
  END IF;

  v_total_questions := jsonb_array_length(p_answers);

  IF v_total_questions = 0 THEN
    RAISE EXCEPTION 'Answers array cannot be empty';
  END IF;

  -- Resolve the curriculum ancestry server-side rather than trusting the
  -- client's copy: stage -> topic -> subject -> grade_level.
  SELECT s.id, s.grade_level_id
  INTO v_subject_id, v_grade_level_id
  FROM stages sg
  JOIN topics t ON t.id = sg.topic_id
  JOIN subjects s ON s.id = t.subject_id
  WHERE sg.id = p_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found: %', p_stage_id;
  END IF;

  -- Every answered question must be a distinct question of THIS stage.
  -- Without this a client could submit another stage's questions (or the
  -- same question repeatedly) and steer the stats row it lands in.
  SELECT
    COUNT(DISTINCT (a->>'question_id')::uuid)
  INTO v_distinct_questions
  FROM jsonb_array_elements(p_answers) AS a;

  IF v_distinct_questions <> v_total_questions THEN
    RAISE EXCEPTION 'Answers contain duplicate questions';
  END IF;

  SELECT COUNT(*)
  INTO v_matching_questions
  FROM jsonb_array_elements(p_answers) AS a
  JOIN questions q ON q.id = (a->>'question_id')::uuid
  WHERE q.stage_id = p_stage_id;

  IF v_matching_questions <> v_total_questions THEN
    RAISE EXCEPTION 'Answers reference questions outside stage %', p_stage_id;
  END IF;

  INSERT INTO practice_sessions (
    student_id,
    stage_id,
    grade_level_id,
    subject_id,
    total_questions,
    correct_count
  )
  VALUES (
    v_student_id,
    p_stage_id,
    v_grade_level_id,
    v_subject_id,
    v_total_questions,
    0
  )
  RETURNING id INTO v_session_id;

  INSERT INTO session_questions (session_id, question_id, question_order)
  SELECT
    v_session_id,
    (a.value->>'question_id')::uuid,
    (a.ordinality - 1)::int
  FROM jsonb_array_elements(p_answers) WITH ORDINALITY AS a(value, ordinality);

  INSERT INTO student_question_progress (student_id, stage_id, question_id, cycle_number)
  SELECT
    v_student_id,
    p_stage_id,
    (a->>'question_id')::uuid,
    p_cycle_number
  FROM jsonb_array_elements(p_answers) AS a
  ON CONFLICT (student_id, stage_id, question_id, cycle_number) DO NOTHING;

  -- is_correct is a placeholder: trg_grade_practice_answer overwrites it
  -- from the answer key before the row lands.
  INSERT INTO practice_answers (
    session_id,
    question_id,
    selected_options,
    text_answer,
    is_correct,
    time_spent_seconds
  )
  SELECT
    v_session_id,
    (a->>'question_id')::uuid,
    CASE
      WHEN jsonb_typeof(a->'selected_options') = 'array'
        AND jsonb_array_length(a->'selected_options') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(a->'selected_options')::int)
      ELSE NULL
    END,
    NULLIF(btrim(COALESCE(a->>'text_answer', '')), ''),
    FALSE,
    NULLIF(a->>'time_spent_seconds', '')::int
  FROM jsonb_array_elements(p_answers) AS a;

  SELECT
    COUNT(*) FILTER (WHERE is_correct = TRUE),
    COALESCE(SUM(time_spent_seconds), 0)
  INTO v_correct_count, v_total_time_seconds
  FROM practice_answers
  WHERE session_id = v_session_id;

  UPDATE practice_sessions
  SET
    completed_at = NOW(),
    total_time_seconds = v_total_time_seconds,
    correct_count = v_correct_count
  WHERE id = v_session_id;

  v_score_percent := COALESCE(
    round((100.0 * v_correct_count) / NULLIF(v_total_questions, 0))::integer,
    0
  );

  INSERT INTO student_stage_stats AS s (
    student_id,
    stage_id,
    best_score_percent,
    sessions_completed,
    last_completed_at
  )
  VALUES (v_student_id, p_stage_id, v_score_percent, 1, NOW())
  ON CONFLICT (student_id, stage_id) DO UPDATE
  SET
    best_score_percent = GREATEST(s.best_score_percent, EXCLUDED.best_score_percent),
    sessions_completed = s.sessions_completed + 1,
    last_completed_at = EXCLUDED.last_completed_at;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'correct_count', v_correct_count,
    'total', v_total_questions
  );
END;
$$;

ALTER FUNCTION public.submit_practice_session(uuid, integer, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_practice_session(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_practice_session(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_practice_session(uuid, integer, jsonb) TO service_role;

COMMENT ON FUNCTION public.submit_practice_session(uuid, integer, jsonb) IS
  'Writes a finished practice attempt — session, frozen question set, cycle progress, every answer and the completion — in one transaction. The only way a practice session is created; nothing is stored while an attempt is in progress.';

-- 7.6 Admin practice-bank read, keyed on the stage
DROP FUNCTION public.get_bank_questions(uuid);

CREATE FUNCTION public.get_bank_questions(p_stage_id uuid DEFAULT NULL)
RETURNS SETOF public.questions
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (SELECT app.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to read the question bank';
  END IF;

  RETURN QUERY
  SELECT q.*
  FROM questions q
  WHERE p_stage_id IS NULL OR q.stage_id = p_stage_id
  ORDER BY q.created_at DESC;
END;
$$;

ALTER FUNCTION public.get_bank_questions(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_bank_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_questions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bank_questions(uuid) TO service_role;

COMMENT ON FUNCTION public.get_bank_questions(uuid) IS
  'Full practice-bank rows INCLUDING answer/option_N_is_correct/option_N_tip for authoring. Platform admin only. NULL p_stage_id returns the whole bank, newest first.';

-- ------------------------------------------------------------
-- 8. Rollups read stage stats
--
-- get_class_rollups only joins the renamed table (its signature is
-- unchanged); get_student_rollups also renames two output columns, which
-- CREATE OR REPLACE cannot express.
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
    JOIN student_stage_stats st ON st.student_id = m.student_id
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
REVOKE ALL ON FUNCTION public.get_class_rollups(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_rollups(uuid) TO authenticated;

DROP FUNCTION public.get_student_rollups(uuid, uuid);

CREATE FUNCTION public.get_student_rollups(
  p_classroom_id    uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  student_id           uuid,
  student_name         text,
  username             text,
  map_mastery          numeric,
  stages_attempted     integer,
  stages_completed     integer,
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
         FROM student_stage_stats st WHERE st.student_id = t.student_id) AS map_mastery,
      (SELECT COUNT(*)::integer
         FROM student_stage_stats st WHERE st.student_id = t.student_id) AS stages_attempted,
      (SELECT COUNT(*)::integer
         FROM student_stage_stats st
         WHERE st.student_id = t.student_id
           AND st.best_score_percent >= c_star_floor) AS stages_completed,
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
    b.stages_attempted,
    b.stages_completed,
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
REVOKE ALL ON FUNCTION public.get_student_rollups(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_rollups(uuid, uuid) TO authenticated;
