-- ============================================================
-- Clavis revamp — P18a: generate an assessment from the bank
--
-- Decision 90. A teacher can have the system draw questions from the admin
-- bank without ever browsing it: they describe what they want as a SPEC — a
-- list of lines, each a sub-topic, an optional set of learning-point tags,
-- an optional difficulty and a count — and get back a draft assessment in
-- their classroom holding random picks that match. Each question can then be
-- regenerated on its own: another random pick from the same line's pool,
-- excluding everything already in the assessment.
--
-- The bank stays admin-only at the RLS layer. The RPCs below run as owner and
-- return only what they picked, never more than the counts asked for; the
-- picked rows are COPIED into `assessment_questions` exactly as a clone
-- copies, so the teacher owns them and a later bank edit reaches no attempt.
--
-- Provenance, so regeneration can work:
--   * assessments.generation_spec       — the spec the draft was built from
--   * assessment_questions.generation_line — which line a question came from
--   * assessment_questions.bank_question_id — which bank row it copied
--     (ON DELETE SET NULL; the copy outlives the bank row). It is provenance
--     only: nothing propagates through it.
-- All three are written by the RPCs alone — the column grants below keep
-- them out of reach of a direct client write.
--
-- Spec shape (validated by app.validate_generation_spec):
--   [{"sub_topic_id": uuid, "tag_ids": [uuid, ...], "difficulty": "low" |
--     "medium" | "high" | null, "count": 1..50}, ...]   (1..20 lines)
-- Tags are OR-ed: a question qualifies when it carries ANY of the line's
-- tags. A short pool returns what exists, and the shortfall is reported.
--
-- The admin gets the same generator for templates, writing references
-- instead of copies.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Provenance columns
-- ------------------------------------------------------------
ALTER TABLE public.assessments
  ADD COLUMN generation_spec jsonb;

COMMENT ON COLUMN public.assessments.generation_spec IS
  'The spec this draft was generated from (decision 90), or NULL for a hand-built assessment. Written only by generate_assessment_from_bank.';

ALTER TABLE public.assessment_questions
  ADD COLUMN generation_line smallint CHECK (generation_line >= 0),
  ADD COLUMN bank_question_id uuid
    REFERENCES public.assessment_bank_questions(id) ON DELETE SET NULL;

CREATE INDEX idx_assessment_questions_bank_question
  ON public.assessment_questions USING btree (bank_question_id)
  WHERE bank_question_id IS NOT NULL;

COMMENT ON COLUMN public.assessment_questions.generation_line IS
  'Index into the assessment''s generation_spec this question was drawn for, or NULL for a hand-written question. Lets regenerate_assessment_question draw from the same pool.';

COMMENT ON COLUMN public.assessment_questions.bank_question_id IS
  'The bank row this generated question copied — provenance only, so regeneration can exclude it. NULL once the bank row is gone; nothing propagates through it.';

-- The client keeps writing the authoring columns; the provenance columns are
-- the RPCs' alone (same column-list pattern P9b used on assessments).
REVOKE INSERT, UPDATE ON TABLE public.assessment_questions FROM authenticated;
GRANT INSERT (id, assessment_id, payload, position, points, created_at)
  ON TABLE public.assessment_questions TO authenticated;
GRANT UPDATE (id, assessment_id, payload, position, points, created_at)
  ON TABLE public.assessment_questions TO authenticated;

-- ------------------------------------------------------------
-- 2. Spec validation and the pool
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.validate_generation_spec(p_spec jsonb, p_subject_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_line jsonb;
  v_tag jsonb;
  v_count numeric;
BEGIN
  IF jsonb_typeof(p_spec) <> 'array' OR jsonb_array_length(p_spec) = 0 THEN
    RAISE EXCEPTION 'Generation spec must be a non-empty list';
  END IF;
  IF jsonb_array_length(p_spec) > 20 THEN
    RAISE EXCEPTION 'Generation spec has too many lines';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_spec) LOOP
    IF jsonb_typeof(v_line) <> 'object'
       OR jsonb_typeof(v_line->'sub_topic_id') <> 'string'
       OR (v_line->>'sub_topic_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(v_line->'count') <> 'number'
       OR jsonb_typeof(v_line->'tag_ids') <> 'array'
       OR NOT (
         v_line->'difficulty' IS NULL
         OR jsonb_typeof(v_line->'difficulty') = 'null'
         OR (v_line->>'difficulty') IN ('low', 'medium', 'high')
       )
    THEN
      RAISE EXCEPTION 'Generation spec line is invalid';
    END IF;

    v_count := (v_line->>'count')::numeric;
    IF v_count <> floor(v_count) OR v_count < 1 OR v_count > 50 THEN
      RAISE EXCEPTION 'Generation spec line is invalid';
    END IF;

    FOR v_tag IN SELECT value FROM jsonb_array_elements(v_line->'tag_ids') LOOP
      IF jsonb_typeof(v_tag) <> 'string'
         OR (v_tag #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION 'Generation spec line is invalid';
      END IF;
    END LOOP;

    IF NOT EXISTS (
      SELECT 1
      FROM public.sub_topics st
      JOIN public.topics tp ON tp.id = st.topic_id
      WHERE st.id = (v_line->>'sub_topic_id')::uuid
        AND tp.subject_id = p_subject_id
    ) THEN
      RAISE EXCEPTION 'Sub-topic does not belong to this subject';
    END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION app.validate_generation_spec(jsonb, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.validate_generation_spec(jsonb, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.validate_generation_spec(jsonb, uuid) IS
  'Raises unless p_spec is a well-formed generation spec whose every sub-topic belongs to p_subject_id. Internal to the generator RPCs.';

/** Random bank picks for one spec line, excluding what is already in use. */
CREATE OR REPLACE FUNCTION app.pick_bank_questions(
  p_sub_topic_id uuid,
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
  WHERE bq.sub_topic_id = p_sub_topic_id
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

ALTER FUNCTION app.pick_bank_questions(uuid, uuid[], public.question_difficulty, uuid[], integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.pick_bank_questions(uuid, uuid[], public.question_difficulty, uuid[], integer) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.pick_bank_questions(uuid, uuid[], public.question_difficulty, uuid[], integer) IS
  'Up to p_count random bank questions filed under p_sub_topic_id, at p_difficulty (NULL = any), carrying ANY of p_tag_ids (empty = any), not in p_exclude. Internal to the generator RPCs.';

/** The typed view of one spec line, shared by the RPCs. */
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

ALTER FUNCTION app.generation_line_tags(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.generation_line_tags(jsonb) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Teacher: generate a draft assessment in a classroom
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
    FOR v_pick IN
      SELECT * FROM app.pick_bank_questions(
        (v_line->>'sub_topic_id')::uuid,
        app.generation_line_tags(v_line),
        (v_line->>'difficulty')::question_difficulty,
        v_used,
        (v_line->>'count')::integer
      )
    LOOP
      INSERT INTO assessment_questions (
        assessment_id, payload, position, points, generation_line, bank_question_id
      )
      VALUES (v_new_id, v_pick.payload, v_position, v_pick.points, v_index, v_pick.id);
      v_used := v_used || v_pick.id;
      v_position := v_position + 1;
      v_picked := v_picked + 1;
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

ALTER FUNCTION public.generate_assessment_from_bank(uuid, text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.generate_assessment_from_bank(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_assessment_from_bank(uuid, text, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.generate_assessment_from_bank(uuid, text, jsonb) IS
  'Decision 90: builds a draft assessment in the caller''s classroom from random bank picks matching each spec line (copies, with provenance). Returns {assessment_id, shortfalls:[{line, requested, picked}]}.';

-- ------------------------------------------------------------
-- 4. Teacher: regenerate one question in place
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

  SELECT * INTO v_pick
  FROM app.pick_bank_questions(
    (v_line->>'sub_topic_id')::uuid,
    app.generation_line_tags(v_line),
    (v_line->>'difficulty')::question_difficulty,
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

ALTER FUNCTION public.regenerate_assessment_question(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.regenerate_assessment_question(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_assessment_question(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.regenerate_assessment_question(uuid) IS
  'Decision 90: replaces one generated question of a DRAFT assessment with another random pick from its spec line, excluding every bank question already in the assessment. Returns the new {id, payload, points, bank_question_id}.';

-- ------------------------------------------------------------
-- 5. Admin: generate a template (references, not copies)
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
    FOR v_pick IN
      SELECT * FROM app.pick_bank_questions(
        (v_line->>'sub_topic_id')::uuid,
        app.generation_line_tags(v_line),
        (v_line->>'difficulty')::question_difficulty,
        v_used,
        (v_line->>'count')::integer
      )
    LOOP
      INSERT INTO assessment_template_questions (template_id, bank_question_id, position)
      VALUES (v_new_id, v_pick.id, v_position);
      v_used := v_used || v_pick.id;
      v_position := v_position + 1;
      v_picked := v_picked + 1;
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

ALTER FUNCTION public.generate_template_from_bank(text, uuid, uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.generate_template_from_bank(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_template_from_bank(text, uuid, uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.generate_template_from_bank(text, uuid, uuid, jsonb) IS
  'Decision 90, admin variant: builds a draft template from random bank picks matching each spec line, as references. Returns {template_id, shortfalls:[{line, requested, picked}]}.';
