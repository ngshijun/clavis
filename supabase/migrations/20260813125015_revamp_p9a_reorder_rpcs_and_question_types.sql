-- ============================================================
-- Clavis 2.5 revamp — P9a: positional reorder RPCs + new auto-graded
--                          assessment question types
--
-- Decisions 65-68 and 72a:
--
--   72a. Positional reorder RPCs for every orderable entity
--        (grade_levels / subjects / topics / sub_topics /
--        assessment_questions). They take ONLY the parent id and the new
--        id order, verify the caller may write that parent, verify the
--        array is a permutation of exactly that parent's children, and
--        rewrite display_order/position from the array index in ONE
--        statement. This replaces the client's full-row upsert, which
--        re-sent name/payload/points and could overwrite a concurrent
--        rename (flagged by the P2b and P5b verifiers).
--
--   65-67. New question types are ASSESSMENT-ONLY ad-hoc payloads in
--        assessment_questions.payload: true_false, numeric, short_answer
--        (now multi-accept), cloze, matching, ordering, long_answer,
--        alongside the existing mcq/mrq. The practice `questions` bank,
--        the practice runner and the learning map are UNTOUCHED — bank
--        questions stay mcq|mrq|short_answer and keep their binary
--        grading.
--
--   68.  Partial credit: attempt_answers gains `response jsonb` (the
--        structured student answer for cloze/matching/ordering/true_false)
--        and `awarded_points numeric` (server-computed). Neither
--        awarded_points nor is_correct is writable — or readable — by
--        `authenticated`, mirroring the P3a/P5a column-revoke pattern.
--        score_percent becomes SUM(awarded_points)/SUM(points).
--
-- long_answer is MANUAL: the grader leaves is_correct AND awarded_points
-- NULL (pending). P9b owns the marking RPC, the pending-visibility rule
-- and the answer-release gate; this migration only makes pending states
-- representable and tolerated everywhere.
-- ============================================================

-- ============================================================
-- SECTION 1 — Positional reorder RPCs (decision 72a)
-- ============================================================

-- Shared permutation guard. Pure argument arithmetic (no table access), so
-- it is safe to call from every reorder RPC below. It raises — the RPCs
-- never silently reorder a partial list.
CREATE OR REPLACE FUNCTION app.assert_reorder_permutation(
  p_entity text,
  p_ids uuid[],
  p_child_count bigint,
  p_matched_count bigint
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_given integer := COALESCE(array_length(p_ids, 1), 0);
  v_distinct integer;
BEGIN
  IF p_ids IS NULL THEN
    RAISE EXCEPTION 'reorder %: p_ids must not be NULL', p_entity;
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_ids) AS u(id) WHERE u.id IS NULL) THEN
    RAISE EXCEPTION 'reorder %: p_ids must not contain NULL ids', p_entity;
  END IF;

  SELECT count(DISTINCT u.id) INTO v_distinct FROM unnest(p_ids) AS u(id);

  IF v_distinct <> v_given THEN
    RAISE EXCEPTION 'reorder %: p_ids contains duplicate ids', p_entity;
  END IF;

  IF v_given <> p_child_count OR p_matched_count <> p_child_count THEN
    RAISE EXCEPTION
      'reorder %: p_ids must be a permutation of this parent''s children (expected %, got % ids, % of which belong to the parent)',
      p_entity, p_child_count, v_given, p_matched_count;
  END IF;
END;
$$;

ALTER FUNCTION app.assert_reorder_permutation(text, uuid[], bigint, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.assert_reorder_permutation(text, uuid[], bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_reorder_permutation(text, uuid[], bigint, bigint) FROM anon;
REVOKE ALL ON FUNCTION app.assert_reorder_permutation(text, uuid[], bigint, bigint) FROM authenticated;

COMMENT ON FUNCTION app.assert_reorder_permutation(text, uuid[], bigint, bigint) IS
  'Raises unless p_ids is a duplicate-free permutation of exactly the parent''s children. Internal helper of the reorder_* RPCs.';

-- ------------------------------------------------------------
-- 1.1 Curriculum: admin-only, one level per RPC.
--     Writes ONLY display_order (the updated_at triggers on
--     grade_levels/subjects/sub_topics still fire — that is the intent).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_grade_levels(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_children bigint;
  v_matched bigint;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can reorder grade levels';
  END IF;

  SELECT count(*) INTO v_children FROM grade_levels;
  SELECT count(*) INTO v_matched FROM grade_levels g WHERE g.id = ANY (p_ids);

  PERFORM app.assert_reorder_permutation('grade_levels', p_ids, v_children, v_matched);

  UPDATE grade_levels g
  SET display_order = i.ord
  FROM unnest(p_ids) WITH ORDINALITY AS i(id, ord)
  WHERE g.id = i.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_subjects(p_grade_level_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_children bigint;
  v_matched bigint;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can reorder subjects';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM grade_levels WHERE id = p_grade_level_id) THEN
    RAISE EXCEPTION 'Grade level not found: %', p_grade_level_id;
  END IF;

  SELECT count(*) INTO v_children
  FROM subjects s WHERE s.grade_level_id = p_grade_level_id;

  SELECT count(*) INTO v_matched
  FROM subjects s WHERE s.grade_level_id = p_grade_level_id AND s.id = ANY (p_ids);

  PERFORM app.assert_reorder_permutation('subjects', p_ids, v_children, v_matched);

  UPDATE subjects s
  SET display_order = i.ord
  FROM unnest(p_ids) WITH ORDINALITY AS i(id, ord)
  WHERE s.id = i.id
    AND s.grade_level_id = p_grade_level_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_topics(p_subject_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_children bigint;
  v_matched bigint;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can reorder topics';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM subjects WHERE id = p_subject_id) THEN
    RAISE EXCEPTION 'Subject not found: %', p_subject_id;
  END IF;

  SELECT count(*) INTO v_children
  FROM topics t WHERE t.subject_id = p_subject_id;

  SELECT count(*) INTO v_matched
  FROM topics t WHERE t.subject_id = p_subject_id AND t.id = ANY (p_ids);

  PERFORM app.assert_reorder_permutation('topics', p_ids, v_children, v_matched);

  UPDATE topics t
  SET display_order = i.ord
  FROM unnest(p_ids) WITH ORDINALITY AS i(id, ord)
  WHERE t.id = i.id
    AND t.subject_id = p_subject_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_sub_topics(p_topic_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_children bigint;
  v_matched bigint;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can reorder sub-topics';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM topics WHERE id = p_topic_id) THEN
    RAISE EXCEPTION 'Topic not found: %', p_topic_id;
  END IF;

  SELECT count(*) INTO v_children
  FROM sub_topics st WHERE st.topic_id = p_topic_id;

  SELECT count(*) INTO v_matched
  FROM sub_topics st WHERE st.topic_id = p_topic_id AND st.id = ANY (p_ids);

  PERFORM app.assert_reorder_permutation('sub_topics', p_ids, v_children, v_matched);

  UPDATE sub_topics st
  SET display_order = i.ord
  FROM unnest(p_ids) WITH ORDINALITY AS i(id, ord)
  WHERE st.id = i.id
    AND st.topic_id = p_topic_id;
END;
$$;

-- ------------------------------------------------------------
-- 1.2 Assessment questions: reuses the EXISTING write authorization
--     (app.can_write_assessment) — admin anywhere (incl. templates),
--     manager org-wide, teacher on assessments they created. Templates
--     stay admin-only because a template's organization_id is NULL and
--     never equals current_org_id().
--
--     There is no publish-state rule to honour: P3a/P7a/P8a deliberately
--     let a writer edit the questions of a published assessment (an
--     in-flight attempt keeps its frozen attempt_questions snapshot), so
--     reordering follows exactly the same rule as any other question write.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_assessment_questions(p_assessment_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_children bigint;
  v_matched bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM assessments WHERE id = p_assessment_id) THEN
    RAISE EXCEPTION 'Assessment not found: %', p_assessment_id;
  END IF;

  IF NOT app.can_write_assessment(p_assessment_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this assessment';
  END IF;

  SELECT count(*) INTO v_children
  FROM assessment_questions aq WHERE aq.assessment_id = p_assessment_id;

  SELECT count(*) INTO v_matched
  FROM assessment_questions aq
  WHERE aq.assessment_id = p_assessment_id AND aq.id = ANY (p_ids);

  PERFORM app.assert_reorder_permutation('assessment_questions', p_ids, v_children, v_matched);

  UPDATE assessment_questions aq
  SET position = i.ord
  FROM unnest(p_ids) WITH ORDINALITY AS i(id, ord)
  WHERE aq.id = i.id
    AND aq.assessment_id = p_assessment_id;
END;
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.reorder_grade_levels(uuid[])',
    'public.reorder_subjects(uuid, uuid[])',
    'public.reorder_topics(uuid, uuid[])',
    'public.reorder_sub_topics(uuid, uuid[])',
    'public.reorder_assessment_questions(uuid, uuid[])'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.reorder_grade_levels(uuid[]) IS
  'Admin-only positional reorder: display_order = 1-based index of p_ids. p_ids must be a permutation of every grade level. Touches no other column.';
COMMENT ON FUNCTION public.reorder_subjects(uuid, uuid[]) IS
  'Admin-only positional reorder of one grade level''s subjects: display_order = 1-based index of p_ids.';
COMMENT ON FUNCTION public.reorder_topics(uuid, uuid[]) IS
  'Admin-only positional reorder of one subject''s topics: display_order = 1-based index of p_ids.';
COMMENT ON FUNCTION public.reorder_sub_topics(uuid, uuid[]) IS
  'Admin-only positional reorder of one topic''s sub-topics: display_order = 1-based index of p_ids.';
COMMENT ON FUNCTION public.reorder_assessment_questions(uuid, uuid[]) IS
  'Positional reorder of one assessment''s questions (same authz as any question write: app.can_write_assessment): position = 1-based index of p_ids. Touches no other column.';

-- ============================================================
-- SECTION 2 — Ad-hoc payload contract (decisions 65-67)
-- ============================================================

-- Write-time structural validation for assessment_questions.payload.
-- IMMUTABLE + argument-only, so it can back a CHECK constraint. It never
-- raises: anything it does not recognise is simply invalid (false). Every
-- jsonb_array_length / jsonb_array_elements call is preceded by a
-- STATEMENT-level jsonb_typeof guard, because SQL does not promise
-- left-to-right short-circuit inside one expression.
--
-- Every type test reads COALESCE(jsonb_typeof(x), '') on purpose: a MISSING
-- key makes jsonb_typeof() return NULL, and `NULL <> 'string'` is NULL, not
-- true — an unguarded test would let a payload with no `question`/`answer`
-- fall through to RETURN true (and a NULL result would satisfy the CHECK).
--
-- Payload contract (the P9d/P9e authoring + runner contract):
--
--   mcq | mrq     {type, question, options:[{text, is_correct}], explanation?}
--   true_false    {type, question, answer:boolean, explanation?}
--   numeric       {type, question, answer:number, tolerance?:number>=0, unit?:string}
--   short_answer  {type, question, accepted_answers:string[]}
--   cloze         {type, question?, text:"… {{1}} … {{2}} …",
--                  blanks:[{index:int>=1, accepted:string[]}]}
--   matching      {type, question, left:[{id,text}], right:[{id,text}],
--                  pairs:[{left_id,right_id}]}
--   ordering      {type, question, items:[{id,text}], correct_order:[id, …]}
--   long_answer   {type, question, rubric?:string}
--
-- Unknown keys are allowed and ignored (nothing strips them).
CREATE OR REPLACE FUNCTION public.assessment_payload_is_valid(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_type text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN false;
  END IF;

  v_type := p->>'type';
  IF v_type IS NULL THEN
    RETURN false;
  END IF;

  -- A prompt is required for every type except cloze (whose prompt is
  -- `text`); cloze MAY carry an extra `question` lead-in.
  IF v_type <> 'cloze' OR (p ? 'question') THEN
    IF COALESCE(jsonb_typeof(p->'question'), '') <> 'string'
       OR btrim(COALESCE(p->>'question', '')) = ''
    THEN
      RETURN false;
    END IF;
  END IF;

  -- ---- mcq / mrq ------------------------------------------------------
  IF v_type IN ('mcq', 'mrq') THEN
    IF COALESCE(jsonb_typeof(p->'options'), '') <> 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(p->'options') < 2 THEN RETURN false; END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'options') AS e(elem)
      WHERE COALESCE(jsonb_typeof(e.elem), '') <> 'object'
         OR COALESCE(jsonb_typeof(e.elem->'text'), '') <> 'string'
         OR ((e.elem ? 'is_correct') AND COALESCE(jsonb_typeof(e.elem->'is_correct'), '') <> 'boolean')
    ) THEN RETURN false; END IF;

    -- A question with no correct option can never be answered correctly.
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'options') AS e(elem)
      WHERE e.elem->'is_correct' = 'true'::jsonb
    ) THEN RETURN false; END IF;

    RETURN true;
  END IF;

  -- ---- true_false -----------------------------------------------------
  IF v_type = 'true_false' THEN
    RETURN COALESCE(jsonb_typeof(p->'answer'), '') = 'boolean';
  END IF;

  -- ---- numeric --------------------------------------------------------
  IF v_type = 'numeric' THEN
    IF COALESCE(jsonb_typeof(p->'answer'), '') <> 'number' THEN RETURN false; END IF;

    IF (p ? 'tolerance') AND jsonb_typeof(p->'tolerance') <> 'null' THEN
      IF jsonb_typeof(p->'tolerance') <> 'number' THEN RETURN false; END IF;
      -- jsonb number comparison: no cast, so no overflow can raise here.
      IF p->'tolerance' < '0'::jsonb THEN RETURN false; END IF;
    END IF;

    IF (p ? 'unit') AND jsonb_typeof(p->'unit') NOT IN ('string', 'null') THEN
      RETURN false;
    END IF;

    RETURN true;
  END IF;

  -- ---- short_answer (multi-accept) ------------------------------------
  IF v_type = 'short_answer' THEN
    IF COALESCE(jsonb_typeof(p->'accepted_answers'), '') <> 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(p->'accepted_answers') < 1 THEN RETURN false; END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'accepted_answers') AS e(elem)
      WHERE COALESCE(jsonb_typeof(e.elem), '') <> 'string'
         OR btrim(COALESCE(e.elem #>> '{}', '')) = ''
    ) THEN RETURN false; END IF;

    RETURN true;
  END IF;

  -- ---- cloze ----------------------------------------------------------
  IF v_type = 'cloze' THEN
    IF COALESCE(jsonb_typeof(p->'text'), '') <> 'string'
       OR btrim(COALESCE(p->>'text', '')) = ''
    THEN RETURN false; END IF;
    IF COALESCE(jsonb_typeof(p->'blanks'), '') <> 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(p->'blanks') < 1 THEN RETURN false; END IF;

    -- shape of each blank (guards the accepted[] access below)
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'blanks') AS e(elem)
      WHERE COALESCE(jsonb_typeof(e.elem), '') <> 'object'
         OR COALESCE(jsonb_typeof(e.elem->'index'), '') <> 'number'
         OR COALESCE(e.elem->>'index', '') !~ '^[1-9][0-9]*$'
         OR COALESCE(jsonb_typeof(e.elem->'accepted'), '') <> 'array'
    ) THEN RETURN false; END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'blanks') AS e(elem)
      WHERE jsonb_array_length(e.elem->'accepted') < 1
    ) THEN RETURN false; END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'blanks') AS e(elem),
           jsonb_array_elements(e.elem->'accepted') AS a(item)
      WHERE COALESCE(jsonb_typeof(a.item), '') <> 'string'
         OR btrim(COALESCE(a.item #>> '{}', '')) = ''
    ) THEN RETURN false; END IF;

    -- blank indexes are unique (the grader matches on them)
    IF (SELECT count(*) FROM jsonb_array_elements(p->'blanks') AS e(elem))
       <> (SELECT count(DISTINCT e.elem->>'index') FROM jsonb_array_elements(p->'blanks') AS e(elem))
    THEN RETURN false; END IF;

    RETURN true;
  END IF;

  -- ---- matching -------------------------------------------------------
  IF v_type = 'matching' THEN
    IF COALESCE(jsonb_typeof(p->'left'), '') <> 'array'
       OR COALESCE(jsonb_typeof(p->'right'), '') <> 'array'
       OR COALESCE(jsonb_typeof(p->'pairs'), '') <> 'array'
    THEN RETURN false; END IF;

    IF jsonb_array_length(p->'left') < 1 OR jsonb_array_length(p->'right') < 1 THEN
      RETURN false;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM (
        SELECT l.elem FROM jsonb_array_elements(p->'left') AS l(elem)
        UNION ALL
        SELECT r.elem FROM jsonb_array_elements(p->'right') AS r(elem)
      ) AS e(elem)
      WHERE COALESCE(jsonb_typeof(e.elem), '') <> 'object'
         OR COALESCE(jsonb_typeof(e.elem->'id'), '') <> 'string'
         OR btrim(COALESCE(e.elem->>'id', '')) = ''
         OR COALESCE(jsonb_typeof(e.elem->'text'), '') <> 'string'
    ) THEN RETURN false; END IF;

    IF (SELECT count(DISTINCT e.elem->>'id') FROM jsonb_array_elements(p->'left') AS e(elem))
       <> jsonb_array_length(p->'left')
    THEN RETURN false; END IF;

    IF (SELECT count(DISTINCT e.elem->>'id') FROM jsonb_array_elements(p->'right') AS e(elem))
       <> jsonb_array_length(p->'right')
    THEN RETURN false; END IF;

    -- exactly one pair per LEFT item; right items may repeat (many-to-one
    -- classification) and may include distractors that no pair uses.
    IF jsonb_array_length(p->'pairs') <> jsonb_array_length(p->'left') THEN RETURN false; END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'pairs') AS e(elem)
      WHERE COALESCE(jsonb_typeof(e.elem), '') <> 'object'
         OR COALESCE(jsonb_typeof(e.elem->'left_id'), '') <> 'string'
         OR COALESCE(jsonb_typeof(e.elem->'right_id'), '') <> 'string'
         OR NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(p->'left') AS l(elem)
              WHERE l.elem->>'id' = e.elem->>'left_id'
            )
         OR NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(p->'right') AS r(elem)
              WHERE r.elem->>'id' = e.elem->>'right_id'
            )
    ) THEN RETURN false; END IF;

    IF (SELECT count(DISTINCT e.elem->>'left_id') FROM jsonb_array_elements(p->'pairs') AS e(elem))
       <> jsonb_array_length(p->'left')
    THEN RETURN false; END IF;

    RETURN true;
  END IF;

  -- ---- ordering -------------------------------------------------------
  IF v_type = 'ordering' THEN
    IF COALESCE(jsonb_typeof(p->'items'), '') <> 'array'
       OR COALESCE(jsonb_typeof(p->'correct_order'), '') <> 'array'
    THEN
      RETURN false;
    END IF;

    IF jsonb_array_length(p->'items') < 2 THEN RETURN false; END IF;
    IF jsonb_array_length(p->'correct_order') <> jsonb_array_length(p->'items') THEN
      RETURN false;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'items') AS e(elem)
      WHERE COALESCE(jsonb_typeof(e.elem), '') <> 'object'
         OR COALESCE(jsonb_typeof(e.elem->'id'), '') <> 'string'
         OR btrim(COALESCE(e.elem->>'id', '')) = ''
         OR COALESCE(jsonb_typeof(e.elem->'text'), '') <> 'string'
    ) THEN RETURN false; END IF;

    IF (SELECT count(DISTINCT e.elem->>'id') FROM jsonb_array_elements(p->'items') AS e(elem))
       <> jsonb_array_length(p->'items')
    THEN RETURN false; END IF;

    -- correct_order is a permutation of the item ids
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'correct_order') AS e(elem)
      WHERE COALESCE(jsonb_typeof(e.elem), '') <> 'string'
         OR NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(p->'items') AS i(elem)
              WHERE i.elem->>'id' = e.elem #>> '{}'
            )
    ) THEN RETURN false; END IF;

    IF (SELECT count(DISTINCT e.elem #>> '{}') FROM jsonb_array_elements(p->'correct_order') AS e(elem))
       <> jsonb_array_length(p->'correct_order')
    THEN RETURN false; END IF;

    RETURN true;
  END IF;

  -- ---- long_answer (manual marking, decision 69) ----------------------
  IF v_type = 'long_answer' THEN
    IF (p ? 'rubric') AND jsonb_typeof(p->'rubric') NOT IN ('string', 'null') THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  -- Unknown type.
  RETURN false;
END;
$$;

ALTER FUNCTION public.assessment_payload_is_valid(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assessment_payload_is_valid(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assessment_payload_is_valid(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.assessment_payload_is_valid(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assessment_payload_is_valid(jsonb) TO service_role;

COMMENT ON FUNCTION public.assessment_payload_is_valid(jsonb) IS
  'Structural validation of an ad-hoc assessment_questions.payload (decisions 65-67). Backs the assessment_questions_payload_shape CHECK. Never raises: an unrecognised or malformed payload is simply invalid.';

-- One-time data migration: short_answer moves from a single `answer` to
-- `accepted_answers[]` (decision 67). No compatibility layer — the grader
-- below reads accepted_answers only.
UPDATE public.assessment_questions
SET payload = (payload - 'answer')
              || jsonb_build_object('accepted_answers', jsonb_build_array(payload->>'answer'))
WHERE payload->>'type' = 'short_answer'
  AND NOT (payload ? 'accepted_answers')
  AND jsonb_typeof(payload->'answer') = 'string'
  AND btrim(payload->>'answer') <> '';

ALTER TABLE public.assessment_questions
  DROP CONSTRAINT assessment_questions_payload_shape;

ALTER TABLE public.assessment_questions
  ADD CONSTRAINT assessment_questions_payload_shape
  CHECK (payload IS NULL OR public.assessment_payload_is_valid(payload));

COMMENT ON COLUMN public.assessment_questions.payload IS
  'Ad-hoc question, one of: mcq | mrq | true_false | numeric | short_answer | cloze | matching | ordering | long_answer. Shape enforced by assessment_payload_is_valid(); see the P9A handoff for the per-type contract. Staff-read only — students receive sanitized content through get_attempt_questions().';

-- ============================================================
-- SECTION 3 — attempt_answers: response + awarded_points (decision 68)
-- ============================================================

ALTER TABLE public.attempt_answers
  ADD COLUMN response jsonb,
  ADD COLUMN awarded_points numeric,
  ALTER COLUMN is_correct DROP NOT NULL;

ALTER TABLE public.attempt_answers
  ADD CONSTRAINT attempt_answers_response_object
    CHECK (response IS NULL OR jsonb_typeof(response) = 'object'),
  ADD CONSTRAINT attempt_answers_awarded_points_non_negative
    CHECK (awarded_points IS NULL OR awarded_points >= 0);

COMMENT ON COLUMN public.attempt_answers.response IS
  'Structured student answer for the types selected_options/text_answer cannot express: true_false {"value":bool}, cloze {"blanks":[{"index":int,"value":text}]}, matching {"pairs":[{"left_id","right_id"}]}, ordering {"order":[id,…]}. Client-writable.';

COMMENT ON COLUMN public.attempt_answers.awarded_points IS
  'Server-owned points for this answer (0 .. assessment_questions.points, 2 dp). Set by grade_attempt_answer(); NULL = pending manual marking (long_answer). Not writable OR readable by authenticated — served by get_attempt_result().';

COMMENT ON COLUMN public.attempt_answers.is_correct IS
  'Server-owned grade. NULL = pending manual marking (long_answer); for partial-credit types TRUE means every part was right. Not readable by authenticated (no column grant) — correctness is served by get_attempt_result() only.';

-- Grants, restated in full (P3a + P3a-fix + this migration in one place).
-- The two server-owned grade columns appear in NO list: the client can
-- neither write nor read is_correct / awarded_points. `response` joins the
-- student-authored set.
REVOKE ALL ON TABLE public.attempt_answers FROM PUBLIC;
REVOKE ALL ON TABLE public.attempt_answers FROM anon;
REVOKE ALL ON TABLE public.attempt_answers FROM authenticated;

GRANT SELECT (
  id,
  attempt_id,
  assessment_question_id,
  selected_options,
  text_answer,
  response,
  time_spent_seconds,
  answered_at
) ON TABLE public.attempt_answers TO authenticated;

GRANT INSERT (
  attempt_id,
  assessment_question_id,
  selected_options,
  text_answer,
  response,
  time_spent_seconds,
  answered_at
) ON TABLE public.attempt_answers TO authenticated;

GRANT UPDATE (
  attempt_id,
  assessment_question_id,
  selected_options,
  text_answer,
  response,
  time_spent_seconds,
  answered_at
) ON TABLE public.attempt_answers TO authenticated;

GRANT ALL ON TABLE public.attempt_answers TO service_role;

-- ============================================================
-- SECTION 4 — Grading trigger, extended (decisions 66-68)
--
-- Every type resolves to a (correct, total) fraction:
--   binary  (mcq, mrq, true_false, short_answer, numeric)  -> 1/1 or 0/1
--   cloze    -> blanks answered correctly / blanks
--   matching -> pairs matched correctly / pairs
--   ordering -> items in the correct position / items
-- then
--   is_correct     := correct = total          (all parts right)
--   awarded_points := round(points * correct / total, 2)   [half-up]
--
-- long_answer is manual: is_correct AND awarded_points stay NULL.
--
-- Every payload read is defensive: the whole computation runs inside an
-- EXCEPTION block, arrays are jsonb_typeof-guarded before being expanded,
-- and the numeric parse is regex-gated. A hostile payload or response
-- grades 0 — it never raises, and it can never brick an attempt.
-- ============================================================
CREATE OR REPLACE FUNCTION public.grade_attempt_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_question_id uuid;
  v_payload jsonb;
  v_points numeric;
  v_type text;
  v_answer text;
  v_correct_options integer[];
  v_opt_1 boolean;
  v_opt_2 boolean;
  v_opt_3 boolean;
  v_opt_4 boolean;
  v_ok boolean;
  v_total integer := 0;
  v_correct integer := 0;
  v_target numeric;
  v_tolerance numeric;
  v_given numeric;
BEGIN
  -- Default deny: whatever the client sent in the grade columns is discarded.
  NEW.is_correct := FALSE;
  NEW.awarded_points := 0;

  SELECT aq.question_id, aq.payload, aq.points
  INTO v_question_id, v_payload, v_points
  FROM assessment_questions aq
  WHERE aq.id = NEW.assessment_question_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF v_question_id IS NOT NULL THEN
      -- ---- bank question: mcq | mrq | short_answer, always binary -----
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

      IF v_type = 'short_answer' THEN
        v_ok := (
          v_answer IS NOT NULL
          AND btrim(v_answer) <> ''
          AND NEW.text_answer IS NOT NULL
          AND lower(btrim(NEW.text_answer)) = lower(btrim(v_answer))
        );
      ELSIF v_type IN ('mcq', 'mrq') THEN
        v_ok := (
          NEW.selected_options IS NOT NULL
          AND COALESCE(array_length(v_correct_options, 1), 0) > 0
          AND ARRAY(SELECT DISTINCT unnest(NEW.selected_options) ORDER BY 1) = v_correct_options
        );
      ELSE
        RETURN NEW;
      END IF;

      v_total := 1;
      v_correct := CASE WHEN COALESCE(v_ok, false) THEN 1 ELSE 0 END;

    ELSE
      -- ---- ad-hoc payload --------------------------------------------
      IF jsonb_typeof(v_payload) IS DISTINCT FROM 'object' THEN
        RETURN NEW;
      END IF;

      v_type := v_payload->>'type';

      IF v_type IS NULL THEN
        RETURN NEW;
      END IF;

      -- Manual marking (decision 69): pending, never auto-graded.
      IF v_type = 'long_answer' THEN
        NEW.is_correct := NULL;
        NEW.awarded_points := NULL;
        RETURN NEW;
      END IF;

      IF v_type IN ('mcq', 'mrq') THEN
        IF jsonb_typeof(v_payload->'options') IS DISTINCT FROM 'array' THEN
          RETURN NEW;
        END IF;

        -- Option numbers are the 1-based ordinals of the options array.
        v_correct_options := ARRAY(
          SELECT o.ord::integer
          FROM jsonb_array_elements(v_payload->'options') WITH ORDINALITY AS o(elem, ord)
          WHERE jsonb_typeof(o.elem) = 'object'
            AND o.elem->'is_correct' = 'true'::jsonb
          ORDER BY o.ord
        );

        v_ok := (
          NEW.selected_options IS NOT NULL
          AND COALESCE(array_length(v_correct_options, 1), 0) > 0
          AND ARRAY(SELECT DISTINCT unnest(NEW.selected_options) ORDER BY 1) = v_correct_options
        );
        v_total := 1;

      ELSIF v_type = 'short_answer' THEN
        v_ok := (
          NEW.text_answer IS NOT NULL
          AND btrim(NEW.text_answer) <> ''
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(v_payload->'accepted_answers') = 'array'
                   THEN v_payload->'accepted_answers' ELSE '[]'::jsonb END
            ) AS a(elem)
            WHERE jsonb_typeof(a.elem) = 'string'
              AND lower(btrim(a.elem #>> '{}')) = lower(btrim(NEW.text_answer))
          )
        );
        v_total := 1;

      ELSIF v_type = 'true_false' THEN
        v_ok := COALESCE(
          jsonb_typeof(v_payload->'answer') = 'boolean'
          AND jsonb_typeof(NEW.response->'value') = 'boolean'
          AND NEW.response->'value' = v_payload->'answer',
          false
        );
        v_total := 1;

      ELSIF v_type = 'numeric' THEN
        v_ok := false;
        IF jsonb_typeof(v_payload->'answer') = 'number'
           AND NEW.text_answer ~ '^\s*[-+]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?\s*$'
        THEN
          v_target := (v_payload->>'answer')::numeric;
          v_tolerance := CASE
            WHEN jsonb_typeof(v_payload->'tolerance') = 'number'
              THEN (v_payload->>'tolerance')::numeric
            ELSE 0
          END;
          IF v_tolerance < 0 THEN
            v_tolerance := 0;
          END IF;
          v_given := btrim(NEW.text_answer)::numeric;
          v_ok := abs(v_given - v_target) <= v_tolerance;
        END IF;
        v_total := 1;

      ELSIF v_type = 'cloze' THEN
        WITH b AS (
          SELECT
            e.elem->>'index' AS idx,
            CASE WHEN jsonb_typeof(e.elem->'accepted') = 'array'
                 THEN e.elem->'accepted' ELSE '[]'::jsonb END AS accepted
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_payload->'blanks') = 'array'
                 THEN v_payload->'blanks' ELSE '[]'::jsonb END
          ) AS e(elem)
          WHERE jsonb_typeof(e.elem) = 'object'
        ),
        r AS (
          SELECT e.elem->>'index' AS idx, e.elem->>'value' AS val
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(NEW.response->'blanks') = 'array'
                 THEN NEW.response->'blanks' ELSE '[]'::jsonb END
          ) AS e(elem)
          WHERE jsonb_typeof(e.elem) = 'object'
        )
        SELECT count(*)::integer, count(*) FILTER (WHERE m.ok)::integer
        INTO v_total, v_correct
        FROM b
        CROSS JOIN LATERAL (
          SELECT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(b.accepted) AS a(elem)
            JOIN r ON r.idx = b.idx
            WHERE jsonb_typeof(a.elem) = 'string'
              AND btrim(COALESCE(r.val, '')) <> ''
              AND lower(btrim(a.elem #>> '{}')) = lower(btrim(r.val))
          ) AS ok
        ) AS m;

      ELSIF v_type = 'matching' THEN
        WITH p AS (
          SELECT e.elem->>'left_id' AS l, e.elem->>'right_id' AS r
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_payload->'pairs') = 'array'
                 THEN v_payload->'pairs' ELSE '[]'::jsonb END
          ) AS e(elem)
          WHERE jsonb_typeof(e.elem) = 'object'
        ),
        -- One response entry per left item; a student who sends the same
        -- left_id twice scores nothing for it (no shotgun answers).
        sr AS (
          SELECT e.elem->>'left_id' AS l, min(e.elem->>'right_id') AS r
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(NEW.response->'pairs') = 'array'
                 THEN NEW.response->'pairs' ELSE '[]'::jsonb END
          ) AS e(elem)
          WHERE jsonb_typeof(e.elem) = 'object'
            AND e.elem->>'left_id' IS NOT NULL
          GROUP BY 1
          HAVING count(*) = 1
        )
        SELECT
          count(*)::integer,
          count(*) FILTER (
            WHERE p.l IS NOT NULL
              AND p.r IS NOT NULL
              AND EXISTS (SELECT 1 FROM sr WHERE sr.l = p.l AND sr.r = p.r)
          )::integer
        INTO v_total, v_correct
        FROM p;

      ELSIF v_type = 'ordering' THEN
        WITH c AS (
          SELECT e.ord AS pos, e.elem #>> '{}' AS id
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_payload->'correct_order') = 'array'
                 THEN v_payload->'correct_order' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS e(elem, ord)
        ),
        s AS (
          SELECT e.ord AS pos, e.elem #>> '{}' AS id
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(NEW.response->'order') = 'array'
                 THEN NEW.response->'order' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS e(elem, ord)
        )
        SELECT
          count(*)::integer,
          count(*) FILTER (WHERE s.id IS NOT NULL AND c.id IS NOT NULL AND s.id = c.id)::integer
        INTO v_total, v_correct
        FROM c
        LEFT JOIN s ON s.pos = c.pos;

      ELSE
        -- Unknown type: ungradable, 0 points.
        RETURN NEW;
      END IF;

      IF v_type IN ('mcq', 'mrq', 'short_answer', 'true_false', 'numeric') THEN
        v_correct := CASE WHEN COALESCE(v_ok, false) THEN 1 ELSE 0 END;
      END IF;
    END IF;

    v_total := COALESCE(v_total, 0);
    v_correct := LEAST(GREATEST(COALESCE(v_correct, 0), 0), v_total);

    IF v_total <= 0 THEN
      NEW.is_correct := FALSE;
      NEW.awarded_points := 0;
    ELSE
      NEW.is_correct := (v_correct = v_total);
      NEW.awarded_points := round(COALESCE(v_points, 0) * v_correct::numeric / v_total, 2);
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- A malformed payload or response must never brick an attempt.
    NEW.is_correct := FALSE;
    NEW.awarded_points := 0;
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.grade_attempt_answer() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.grade_attempt_answer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grade_attempt_answer() FROM anon;
REVOKE ALL ON FUNCTION public.grade_attempt_answer() FROM authenticated;

COMMENT ON FUNCTION public.grade_attempt_answer() IS
  'BEFORE INSERT/UPDATE grader for attempt_answers: computes is_correct + awarded_points for every auto type (partial credit for cloze/matching/ordering). long_answer stays NULL/NULL = pending manual marking. Never raises.';

-- The grader now also has to see `response`, and must NOT re-fire on the
-- grade columns themselves: P9b's marking RPC writes awarded_points /
-- is_correct on a completed attempt, and a re-grade there would wipe the
-- mark. Dropping them from the UPDATE OF list costs nothing — the client
-- has no column privilege on either, so only trusted definer code can
-- write them, and every INSERT is graded unconditionally.
DROP TRIGGER trg_grade_attempt_answer ON public.attempt_answers;

CREATE TRIGGER trg_grade_attempt_answer
  BEFORE INSERT OR UPDATE OF selected_options, text_answer, response, assessment_question_id
  ON public.attempt_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.grade_attempt_answer();

-- ============================================================
-- SECTION 5 — Scoring: points-weighted from awarded_points (decision 68)
--
-- score_percent = round(100 * SUM(awarded_points) / SUM(points)) over the
-- attempt's frozen snapshot, where:
--   * an unanswered question contributes 0 awarded and its full points to
--     the denominator (unchanged behaviour);
--   * a PENDING long_answer (awarded_points NULL) contributes 0 awarded and
--     its full points to the denominator too, i.e. the stored score is the
--     floor of the final score until a teacher marks it. P9b recomputes on
--     marking and owns what the student is shown meanwhile (decision 70).
-- correct_count still counts fully-correct answers only (a partially
-- credited answer is not "correct", a pending one is NULL and not counted).
-- ============================================================
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
  v_earned_points numeric;
  v_total_points numeric;
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
  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(aq.points), 0)::numeric,
    COUNT(*) FILTER (WHERE ans.is_correct)::integer,
    COALESCE(SUM(COALESCE(ans.awarded_points, 0)), 0)::numeric
  INTO v_total_questions, v_total_points, v_correct_count, v_earned_points
  FROM attempt_questions atq
  JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
  LEFT JOIN attempt_answers ans
    ON ans.attempt_id = atq.attempt_id
   AND ans.assessment_question_id = atq.assessment_question_id
  WHERE atq.attempt_id = p_attempt_id;

  -- Clamped: awarded_points can never exceed the question's points here,
  -- but the clamp keeps a future marking bug from violating the 0..100
  -- CHECK and bricking submission.
  v_score_percent := LEAST(100, GREATEST(0, COALESCE(
    round((100 * v_earned_points) / NULLIF(v_total_points, 0))::integer,
    0
  )));

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

COMMENT ON FUNCTION public.complete_assessment_attempt(uuid) IS
  'Scores and closes the caller''s attempt: score_percent = SUM(awarded_points)/SUM(points) over the frozen snapshot (pending long_answer counts as 0 until marked). Idempotent.';

-- ============================================================
-- SECTION 6 — Sanitized runner payload for the new types
--
-- get_attempt_questions() keeps its contract (attempt owner only, never a
-- key) and gains the per-type content the runner needs:
--   numeric   -> unit
--   cloze     -> text + blanks:[{index}]        (accepted[] never emitted)
--   matching  -> left:[{id,text}] + right:[{id,text}]
--   ordering  -> items:[{id,text}]
-- `right` and `items` are emitted in a per-attempt deterministic scramble
-- (md5(attempt_id || item id)): the AUTHORED order of those arrays usually
-- mirrors the key (pairs / correct_order), so shipping it as authored would
-- leak the answer. The order is stable across refetches, so resuming an
-- attempt shows the same layout.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_attempt_questions(p_attempt_id uuid)
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
  FROM assessment_attempts
  WHERE id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found: %', p_attempt_id;
  END IF;

  IF v_student_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Cannot read another student''s attempt';
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      atq.question_order,
      jsonb_build_object(
        'assessment_question_id', aq.id,
        'question_order', atq.question_order,
        'points', aq.points,
        'type', COALESCE(bank.type::text, aq.payload->>'type'),
        'question', COALESCE(bank.question, aq.payload->>'question'),
        'image_path', bank.image_path,
        'options', CASE
          WHEN bank.id IS NOT NULL THEN (
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
                (1, bank.option_1_text, bank.option_1_image_path),
                (2, bank.option_2_text, bank.option_2_image_path),
                (3, bank.option_3_text, bank.option_3_image_path),
                (4, bank.option_4_text, bank.option_4_image_path)
            ) AS o(opt_number, opt_text, opt_image)
            WHERE btrim(COALESCE(o.opt_text, '')) <> '' OR o.opt_image IS NOT NULL
          )
          ELSE (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'number', e.ord::integer,
                  'text', e.elem->>'text',
                  'image_path', NULL::text
                )
                ORDER BY e.ord
              ),
              '[]'::jsonb
            )
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(aq.payload->'options') = 'array' THEN aq.payload->'options'
                ELSE '[]'::jsonb
              END
            ) WITH ORDINALITY AS e(elem, ord)
            WHERE jsonb_typeof(e.elem) = 'object'
          )
        END
      )
      || CASE
           WHEN aq.question_id IS NOT NULL THEN '{}'::jsonb

           WHEN aq.payload->>'type' = 'numeric' THEN
             jsonb_build_object('unit', aq.payload->>'unit')

           WHEN aq.payload->>'type' = 'cloze' THEN
             jsonb_build_object(
               'text', aq.payload->>'text',
               'blanks', (
                 SELECT COALESCE(
                   jsonb_agg(jsonb_build_object('index', e.elem->'index') ORDER BY e.ord),
                   '[]'::jsonb
                 )
                 FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(aq.payload->'blanks') = 'array'
                        THEN aq.payload->'blanks' ELSE '[]'::jsonb END
                 ) WITH ORDINALITY AS e(elem, ord)
                 WHERE jsonb_typeof(e.elem) = 'object'
               )
             )

           WHEN aq.payload->>'type' = 'matching' THEN
             jsonb_build_object(
               'left', (
                 SELECT COALESCE(
                   jsonb_agg(
                     jsonb_build_object('id', e.elem->>'id', 'text', e.elem->>'text')
                     ORDER BY e.ord
                   ),
                   '[]'::jsonb
                 )
                 FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(aq.payload->'left') = 'array'
                        THEN aq.payload->'left' ELSE '[]'::jsonb END
                 ) WITH ORDINALITY AS e(elem, ord)
                 WHERE jsonb_typeof(e.elem) = 'object'
               ),
               'right', (
                 SELECT COALESCE(
                   jsonb_agg(
                     jsonb_build_object('id', e.elem->>'id', 'text', e.elem->>'text')
                     ORDER BY md5(p_attempt_id::text || COALESCE(e.elem->>'id', ''))
                   ),
                   '[]'::jsonb
                 )
                 FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(aq.payload->'right') = 'array'
                        THEN aq.payload->'right' ELSE '[]'::jsonb END
                 ) AS e(elem)
                 WHERE jsonb_typeof(e.elem) = 'object'
               )
             )

           WHEN aq.payload->>'type' = 'ordering' THEN
             jsonb_build_object(
               'items', (
                 SELECT COALESCE(
                   jsonb_agg(
                     jsonb_build_object('id', e.elem->>'id', 'text', e.elem->>'text')
                     ORDER BY md5(p_attempt_id::text || COALESCE(e.elem->>'id', ''))
                   ),
                   '[]'::jsonb
                 )
                 FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(aq.payload->'items') = 'array'
                        THEN aq.payload->'items' ELSE '[]'::jsonb END
                 ) AS e(elem)
                 WHERE jsonb_typeof(e.elem) = 'object'
               )
             )

           ELSE '{}'::jsonb
         END AS item
    FROM attempt_questions atq
    JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
    LEFT JOIN questions bank ON bank.id = aq.question_id
    WHERE atq.attempt_id = p_attempt_id
  ) x;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_attempt_questions(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_attempt_questions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_attempt_questions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_attempt_questions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attempt_questions(uuid) TO service_role;

COMMENT ON FUNCTION public.get_attempt_questions(uuid) IS
  'Sanitized question snapshot for one attempt (owner only). Emits the per-type content the runner needs and never a key: no is_correct, answer, accepted_answers, tolerance, blanks.accepted, pairs, correct_order, explanation or raw payload.';

-- ============================================================
-- SECTION 7 — get_attempt_result: awarded points + pending
--
-- Additive: each question gains "awarded_points" (NULL when unanswered or
-- pending), and "is_correct" is now NULL — not false — for an answered but
-- PENDING (long_answer) question. An unanswered question is still false.
-- P9b rewrites this RPC for the release gate + pending visibility.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_attempt_result(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_attempt assessment_attempts%ROWTYPE;
  v_is_staff boolean;
  v_questions jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_attempt
  FROM assessment_attempts
  WHERE id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found: %', p_attempt_id;
  END IF;

  v_is_staff := app.is_admin()
    OR (
      app.is_org_staff()
      AND app.assessment_org_id(v_attempt.assessment_id) = app.current_org_id()
    );

  IF NOT v_is_staff THEN
    IF v_attempt.student_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Not authorized to view this attempt result';
    END IF;

    IF v_attempt.completed_at IS NULL THEN
      RAISE EXCEPTION 'Results are available after the attempt is submitted';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_questions
  FROM (
    SELECT
      atq.question_order,
      jsonb_build_object(
        'assessment_question_id', atq.assessment_question_id,
        'question_order', atq.question_order,
        'points', aq.points,
        -- no answer row -> false (unanswered); row with NULL -> pending
        'is_correct', CASE WHEN ans.id IS NULL THEN to_jsonb(false) ELSE to_jsonb(ans.is_correct) END,
        'awarded_points', ans.awarded_points
      )
      || CASE
           WHEN v_is_staff THEN jsonb_build_object(
             'selected_options', to_jsonb(ans.selected_options),
             'text_answer', ans.text_answer,
             'response', ans.response,
             'answered_at', ans.answered_at
           )
           ELSE '{}'::jsonb
         END AS item
    FROM attempt_questions atq
    JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
    LEFT JOIN attempt_answers ans
      ON ans.attempt_id = atq.attempt_id
     AND ans.assessment_question_id = atq.assessment_question_id
    WHERE atq.attempt_id = p_attempt_id
  ) x;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'assessment_id', v_attempt.assessment_id,
    'student_id', v_attempt.student_id,
    'started_at', v_attempt.started_at,
    'completed_at', v_attempt.completed_at,
    'correct_count', v_attempt.correct_count,
    'total_questions', v_attempt.total_questions,
    'score_percent', v_attempt.score_percent,
    'questions', v_questions
  );
END;
$$;

ALTER FUNCTION public.get_attempt_result(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_attempt_result(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_attempt_result(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_attempt_result(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attempt_result(uuid) TO service_role;

COMMENT ON FUNCTION public.get_attempt_result(uuid) IS
  'Score + per-question correctness and awarded points for one attempt: owner after completion, org staff any time (staff also see the given answer). is_correct NULL = pending manual marking.';
