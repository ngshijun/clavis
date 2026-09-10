-- ============================================================
-- Clavis revamp — P18b: mixed generation lines, difficulty ratios,
--                       and sub-topic-scoped learning points
--
-- Three changes to decision 90's generator, all in the spec:
--
--   1. A line names MANY sub-topics, not one. Its questions are drawn from
--      the union of their pools, so one line can mix a whole topic.
--
--   2. Difficulty is a RATIO, not a single level. A line carries a mix of
--      integer percentages over low/medium/high summing to 100 (the MOE
--      UASA default is 50/30/20), and the line's count is split across the
--      three buckets by the largest-remainder method, so the picks match the
--      requested ratio as closely as an integer count allows.
--
--      The bucket a question was drawn for is recorded on the row
--      (assessment_questions.generation_difficulty), so regenerating one
--      question replaces it at the SAME difficulty and the ratio survives.
--
--   3. A learning-point tag is SCOPED to the sub-topics it applies to
--      (public.tag_sub_topics). Every tag picker filters by the sub-topic in
--      context, so a teacher choosing learning points for a line sees only
--      the ones that mean something there.
--
-- New spec shape (validated by app.validate_generation_spec):
--   [{"sub_topic_ids": [uuid, ...],            -- 1..20, all in the subject
--     "tag_ids": [uuid, ...],                  -- OR-ed; empty = any
--     "difficulty_mix": {"low": 50, "medium": 30, "high": 20},
--     "count": 1..50}, ...]                    -- 1..20 lines
--
-- The old single-sub-topic shape is gone, not accepted alongside. The specs
-- already stored on generated drafts are in that shape, so their provenance
-- is cleared below: those questions stay exactly as they are, they simply
-- stop offering "regenerate" (the same as a hand-written question).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Learning points are scoped to sub-topics
-- ------------------------------------------------------------
CREATE TABLE public.tag_sub_topics (
  tag_id       uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  sub_topic_id uuid NOT NULL REFERENCES public.sub_topics(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, sub_topic_id)
);

COMMENT ON TABLE public.tag_sub_topics IS
  'Which sub-topics a learning-point tag applies to. A tag picker in the context of a sub-topic offers only the tags linked to it; a tag with no rows here is offered nowhere.';

-- The PK covers tag_id lookups; this covers the other direction (the pickers).
CREATE INDEX idx_tag_sub_topics_sub_topic
  ON public.tag_sub_topics USING btree (sub_topic_id);

ALTER TABLE public.tag_sub_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tag sub-topics"
  ON public.tag_sub_topics
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Read tag sub-topics: authenticated"
  ON public.tag_sub_topics
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tag_sub_topics TO authenticated;

-- ------------------------------------------------------------
-- 2. The difficulty bucket a generated question was drawn for
-- ------------------------------------------------------------
ALTER TABLE public.assessment_questions
  ADD COLUMN generation_difficulty public.question_difficulty;

COMMENT ON COLUMN public.assessment_questions.generation_difficulty IS
  'The difficulty bucket of its spec line this question was drawn for, or NULL for a hand-written one. Regeneration draws its replacement from the same bucket, so the line''s ratio survives.';

-- Provenance stays the RPCs' alone (the P18a column-list grants).
REVOKE INSERT, UPDATE ON TABLE public.assessment_questions FROM authenticated;
GRANT INSERT (id, assessment_id, payload, position, points, created_at)
  ON TABLE public.assessment_questions TO authenticated;
GRANT UPDATE (id, assessment_id, payload, position, points, created_at)
  ON TABLE public.assessment_questions TO authenticated;

-- Specs written in the old shape can no longer be drawn from. Drop the
-- provenance rather than carry a second shape through the generator: the
-- questions are untouched, they just stop offering "regenerate".
UPDATE public.assessment_questions aq
SET generation_line = NULL,
    bank_question_id = NULL
WHERE aq.generation_line IS NOT NULL;

UPDATE public.assessments
SET generation_spec = NULL
WHERE generation_spec IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Spec validation, for the new shape
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.validate_generation_spec(p_spec jsonb, p_subject_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_line    jsonb;
  v_uuid    jsonb;
  v_mix     jsonb;
  v_level   text;
  v_share   numeric;
  v_total   numeric;
  v_count   numeric;
  v_sub_ids uuid[];
BEGIN
  IF jsonb_typeof(p_spec) <> 'array' OR jsonb_array_length(p_spec) = 0 THEN
    RAISE EXCEPTION 'Generation spec must be a non-empty list';
  END IF;
  IF jsonb_array_length(p_spec) > 20 THEN
    RAISE EXCEPTION 'Generation spec has too many lines';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_spec) LOOP
    IF jsonb_typeof(v_line) <> 'object'
       OR jsonb_typeof(v_line->'sub_topic_ids') <> 'array'
       OR jsonb_array_length(v_line->'sub_topic_ids') = 0
       OR jsonb_array_length(v_line->'sub_topic_ids') > 20
       OR jsonb_typeof(v_line->'tag_ids') <> 'array'
       OR jsonb_typeof(v_line->'count') <> 'number'
       OR jsonb_typeof(v_line->'difficulty_mix') <> 'object'
    THEN
      RAISE EXCEPTION 'Generation spec line is invalid';
    END IF;

    v_count := (v_line->>'count')::numeric;
    IF v_count <> floor(v_count) OR v_count < 1 OR v_count > 50 THEN
      RAISE EXCEPTION 'Generation spec line is invalid';
    END IF;

    FOR v_uuid IN
      SELECT value FROM jsonb_array_elements(v_line->'sub_topic_ids')
      UNION ALL
      SELECT value FROM jsonb_array_elements(v_line->'tag_ids')
    LOOP
      IF jsonb_typeof(v_uuid) <> 'string'
         OR (v_uuid #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION 'Generation spec line is invalid';
      END IF;
    END LOOP;

    -- The mix carries exactly the three levels, as integer percentages
    -- summing to 100.
    v_mix := v_line->'difficulty_mix';
    IF (SELECT count(*) FROM jsonb_object_keys(v_mix)) <> 3 THEN
      RAISE EXCEPTION 'Generation spec line is invalid';
    END IF;

    v_total := 0;
    FOREACH v_level IN ARRAY ARRAY['low', 'medium', 'high'] LOOP
      IF jsonb_typeof(v_mix->v_level) <> 'number' THEN
        RAISE EXCEPTION 'Generation spec line is invalid';
      END IF;
      v_share := (v_mix->>v_level)::numeric;
      IF v_share <> floor(v_share) OR v_share < 0 OR v_share > 100 THEN
        RAISE EXCEPTION 'Generation spec line is invalid';
      END IF;
      v_total := v_total + v_share;
    END LOOP;

    IF v_total <> 100 THEN
      RAISE EXCEPTION 'Difficulty percentages must add up to 100';
    END IF;

    SELECT array_agg((value #>> '{}')::uuid) INTO v_sub_ids
    FROM jsonb_array_elements(v_line->'sub_topic_ids');

    IF EXISTS (
      SELECT 1
      FROM unnest(v_sub_ids) AS requested(id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.sub_topics st
        JOIN public.topics tp ON tp.id = st.topic_id
        WHERE st.id = requested.id
          AND tp.subject_id = p_subject_id
      )
    ) THEN
      RAISE EXCEPTION 'Sub-topic does not belong to this subject';
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION app.validate_generation_spec(jsonb, uuid) IS
  'Raises unless p_spec is a well-formed generation spec — each line naming 1..20 sub-topics of p_subject_id, a difficulty mix of three integer percentages summing to 100, and a count of 1..50. Internal to the generator RPCs.';

-- ------------------------------------------------------------
-- 4. The pool, over a set of sub-topics
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS app.pick_bank_questions(uuid, uuid[], public.question_difficulty, uuid[], integer);

CREATE FUNCTION app.pick_bank_questions(
  p_sub_topic_ids uuid[],
  p_tag_ids uuid[],
  p_difficulty public.question_difficulty,
  p_exclude uuid[],
  p_count integer
)
RETURNS SETOF public.assessment_bank_questions
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT bq.*
  FROM public.assessment_bank_questions bq
  WHERE bq.sub_topic_id = ANY (p_sub_topic_ids)
    AND (p_difficulty IS NULL OR bq.difficulty = p_difficulty)
    AND (
      cardinality(p_tag_ids) = 0
      OR EXISTS (
        SELECT 1 FROM public.assessment_bank_question_tags bt
        WHERE bt.assessment_bank_question_id = bq.id
          AND bt.tag_id = ANY (p_tag_ids)
      )
    )
    AND NOT (bq.id = ANY (p_exclude))
  ORDER BY random()
  LIMIT p_count;
$$;

ALTER FUNCTION app.pick_bank_questions(uuid[], uuid[], public.question_difficulty, uuid[], integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.pick_bank_questions(uuid[], uuid[], public.question_difficulty, uuid[], integer) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.pick_bank_questions(uuid[], uuid[], public.question_difficulty, uuid[], integer) IS
  'Up to p_count random bank questions filed under ANY of p_sub_topic_ids, at p_difficulty (NULL = any), carrying ANY of p_tag_ids (empty = any), not in p_exclude. Internal to the generator RPCs.';

-- ------------------------------------------------------------
-- 5. Typed views of one spec line
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.generation_line_tags(p_line jsonb)
RETURNS uuid[]
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(
    (SELECT array_agg((value #>> '{}')::uuid) FROM jsonb_array_elements(p_line->'tag_ids')),
    '{}'::uuid[]
  );
$$;

CREATE OR REPLACE FUNCTION app.generation_line_sub_topics(p_line jsonb)
RETURNS uuid[]
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(
    (SELECT array_agg((value #>> '{}')::uuid) FROM jsonb_array_elements(p_line->'sub_topic_ids')),
    '{}'::uuid[]
  );
$$;

ALTER FUNCTION app.generation_line_sub_topics(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.generation_line_sub_topics(jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.generation_line_sub_topics(jsonb) IS
  'The sub-topic ids of one generation spec line. Internal to the generator RPCs.';

/**
 * One spec line's count split across the three difficulty buckets by its
 * percentage mix, using the largest-remainder method so the parts always sum
 * back to p_count. Buckets that come out empty are not returned.
 */
CREATE OR REPLACE FUNCTION app.allocate_difficulty_mix(p_count integer, p_mix jsonb)
RETURNS TABLE (difficulty public.question_difficulty, n integer)
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  WITH shares AS (
    SELECT
      bucket.difficulty,
      bucket.ord,
      (p_count * COALESCE((p_mix->>(bucket.difficulty::text))::numeric, 0)) / 100 AS share
    FROM (VALUES
      ('low'::public.question_difficulty, 1),
      ('medium'::public.question_difficulty, 2),
      ('high'::public.question_difficulty, 3)
    ) AS bucket(difficulty, ord)
  ),
  floored AS (
    SELECT
      difficulty,
      ord,
      floor(share)::integer AS base,
      share - floor(share) AS remainder
    FROM shares
  ),
  ranked AS (
    SELECT
      difficulty,
      base,
      p_count - (SUM(base) OVER ())::integer AS leftover,
      row_number() OVER (ORDER BY remainder DESC, ord) AS rk
    FROM floored
  )
  SELECT difficulty, base + CASE WHEN rk <= leftover THEN 1 ELSE 0 END
  FROM ranked
  WHERE base + CASE WHEN rk <= leftover THEN 1 ELSE 0 END > 0;
$$;

ALTER FUNCTION app.allocate_difficulty_mix(integer, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.allocate_difficulty_mix(integer, jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.allocate_difficulty_mix(integer, jsonb) IS
  'Splits p_count across low/medium/high by the integer percentages in p_mix (largest remainder, so the parts sum to p_count). Empty buckets are omitted. Internal to the generator RPCs.';

-- ------------------------------------------------------------
-- 6. Teacher: generate a draft assessment in a classroom
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_assessment_from_bank(
  p_classroom_id uuid,
  p_title text,
  p_spec jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller     uuid := (SELECT auth.uid());
  v_org_id     uuid;
  v_subject_id uuid;
  v_new_id     uuid;
  v_line       jsonb;
  v_index      integer;
  v_position   integer := 0;
  v_used       uuid[] := '{}';
  v_picked     integer;
  v_bucket     record;
  v_pick       assessment_bank_questions%ROWTYPE;
  v_shortfalls jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT app.is_teacher() THEN
    RAISE EXCEPTION 'Only teachers can generate assessments';
  END IF;

  IF NOT app.is_classroom_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'You do not teach this classroom';
  END IF;

  v_org_id := app.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no organization';
  END IF;

  IF btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  SELECT c.subject_id INTO v_subject_id FROM classrooms c WHERE c.id = p_classroom_id;

  PERFORM app.validate_generation_spec(p_spec, v_subject_id);

  INSERT INTO assessments (
    organization_id, created_by, title, status, classroom_id, generation_spec
  )
  VALUES (v_org_id, v_caller, btrim(p_title), 'draft', p_classroom_id, p_spec)
  RETURNING id INTO v_new_id;

  FOR v_line, v_index IN
    SELECT value, ordinality - 1 FROM jsonb_array_elements(p_spec) WITH ORDINALITY
  LOOP
    v_picked := 0;

    -- Easiest bucket first, so a paper reads low → medium → high.
    FOR v_bucket IN
      SELECT * FROM app.allocate_difficulty_mix(
        (v_line->>'count')::integer,
        v_line->'difficulty_mix'
      )
    LOOP
      FOR v_pick IN
        SELECT * FROM app.pick_bank_questions(
          app.generation_line_sub_topics(v_line),
          app.generation_line_tags(v_line),
          v_bucket.difficulty,
          v_used,
          v_bucket.n
        )
      LOOP
        INSERT INTO assessment_questions (
          assessment_id, payload, position, points,
          generation_line, generation_difficulty, bank_question_id
        )
        VALUES (
          v_new_id, v_pick.payload, v_position, v_pick.points,
          v_index, v_bucket.difficulty, v_pick.id
        );
        v_used := v_used || v_pick.id;
        v_position := v_position + 1;
        v_picked := v_picked + 1;
      END LOOP;
    END LOOP;

    IF v_picked < (v_line->>'count')::integer THEN
      v_shortfalls := v_shortfalls || jsonb_build_object(
        'line', v_index,
        'requested', (v_line->>'count')::integer,
        'picked', v_picked
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('assessment_id', v_new_id, 'shortfalls', v_shortfalls);
END;
$$;

COMMENT ON FUNCTION public.generate_assessment_from_bank(uuid, text, jsonb) IS
  'Decision 90: builds a draft assessment in the caller''s classroom from random bank picks matching each spec line — drawn across the line''s sub-topics and split by its difficulty ratio (copies, with provenance). Returns {assessment_id, shortfalls:[{line, requested, picked}]}.';

-- ------------------------------------------------------------
-- 7. Teacher: regenerate one question, at its own difficulty
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regenerate_assessment_question(p_question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_question assessment_questions%ROWTYPE;
  v_spec     jsonb;
  v_status   assessment_status;
  v_line     jsonb;
  v_used     uuid[];
  v_pick     assessment_bank_questions%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_question FROM assessment_questions WHERE id = p_question_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found: %', p_question_id;
  END IF;

  IF NOT app.can_write_assessment(v_question.assessment_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this assessment';
  END IF;

  SELECT a.generation_spec, a.status INTO v_spec, v_status
  FROM assessments a WHERE a.id = v_question.assessment_id;

  -- Published assessments are locked: attempts snapshot these rows.
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft assessments can be regenerated';
  END IF;

  IF v_question.generation_line IS NULL OR v_spec IS NULL THEN
    RAISE EXCEPTION 'Question was not generated';
  END IF;

  v_line := v_spec -> v_question.generation_line;

  -- Everything the assessment already holds is off the table, including
  -- the question being replaced.
  SELECT COALESCE(array_agg(aq.bank_question_id), '{}') INTO v_used
  FROM assessment_questions aq
  WHERE aq.assessment_id = v_question.assessment_id
    AND aq.bank_question_id IS NOT NULL;

  -- Same bucket as the question it replaces, so the line's ratio holds.
  SELECT * INTO v_pick
  FROM app.pick_bank_questions(
    app.generation_line_sub_topics(v_line),
    app.generation_line_tags(v_line),
    v_question.generation_difficulty,
    v_used,
    1
  );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No other bank question matches these criteria';
  END IF;

  UPDATE assessment_questions
  SET payload = v_pick.payload,
      points = v_pick.points,
      bank_question_id = v_pick.id
  WHERE id = p_question_id;

  RETURN jsonb_build_object(
    'id', p_question_id,
    'payload', v_pick.payload,
    'points', v_pick.points,
    'bank_question_id', v_pick.id
  );
END;
$$;

COMMENT ON FUNCTION public.regenerate_assessment_question(uuid) IS
  'Decision 90: replaces one generated question of a DRAFT assessment with another random pick from its spec line at the SAME difficulty, excluding every bank question already in the assessment. Returns the new {id, payload, points, bank_question_id}.';

-- ------------------------------------------------------------
-- 8. Admin: generate a template (references, not copies)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_template_from_bank(
  p_title text,
  p_grade_level_id uuid,
  p_subject_id uuid,
  p_spec jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller     uuid := (SELECT auth.uid());
  v_new_id     uuid;
  v_line       jsonb;
  v_index      integer;
  v_position   integer := 0;
  v_used       uuid[] := '{}';
  v_picked     integer;
  v_bucket     record;
  v_pick       assessment_bank_questions%ROWTYPE;
  v_shortfalls jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only admins can generate templates';
  END IF;

  IF btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM subjects s WHERE s.id = p_subject_id AND s.grade_level_id = p_grade_level_id
  ) THEN
    RAISE EXCEPTION 'Subject does not belong to this grade level';
  END IF;

  PERFORM app.validate_generation_spec(p_spec, p_subject_id);

  INSERT INTO assessment_templates (title, grade_level_id, subject_id, created_by)
  VALUES (btrim(p_title), p_grade_level_id, p_subject_id, v_caller)
  RETURNING id INTO v_new_id;

  FOR v_line, v_index IN
    SELECT value, ordinality - 1 FROM jsonb_array_elements(p_spec) WITH ORDINALITY
  LOOP
    v_picked := 0;

    FOR v_bucket IN
      SELECT * FROM app.allocate_difficulty_mix(
        (v_line->>'count')::integer,
        v_line->'difficulty_mix'
      )
    LOOP
      FOR v_pick IN
        SELECT * FROM app.pick_bank_questions(
          app.generation_line_sub_topics(v_line),
          app.generation_line_tags(v_line),
          v_bucket.difficulty,
          v_used,
          v_bucket.n
        )
      LOOP
        INSERT INTO assessment_template_questions (template_id, bank_question_id, position)
        VALUES (v_new_id, v_pick.id, v_position);
        v_used := v_used || v_pick.id;
        v_position := v_position + 1;
        v_picked := v_picked + 1;
      END LOOP;
    END LOOP;

    IF v_picked < (v_line->>'count')::integer THEN
      v_shortfalls := v_shortfalls || jsonb_build_object(
        'line', v_index,
        'requested', (v_line->>'count')::integer,
        'picked', v_picked
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('template_id', v_new_id, 'shortfalls', v_shortfalls);
END;
$$;

COMMENT ON FUNCTION public.generate_template_from_bank(text, uuid, uuid, jsonb) IS
  'Decision 90, admin variant: builds a draft template from random bank picks matching each spec line — across the line''s sub-topics, split by its difficulty ratio — as references. Returns {template_id, shortfalls:[{line, requested, picked}]}.';
