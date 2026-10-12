-- ============================================================
-- Clavis revamp — P35a: an import files its questions under learning points.
--
-- A workbook's question rows may now name learning points, by name. The
-- server turns the names into the ids of the tags the stage's topic
-- offers, and each question of an import arrives with the ids it is
-- filed under.
--
--   D1  A question and its learning points are written together.
--       import_stage_rows adds the question_tags of a question right
--       after the question, in the same transaction as the rest of the
--       import: an import that fails leaves neither behind.
--   D2  A learning point of an import is one the stage's topic offers.
--       The server checks this before it calls; the function checks it
--       again and refuses the whole import otherwise, as it does for a
--       picture that is not stored.
-- ============================================================


-- ------------------------------------------------------------
-- 1. An import in one piece, with its learning points (D1, D2)
--
-- p_passages:  [ { title, body, image_path }, … ]   the passages to make, in order
-- p_questions: [ { payload, difficulty, place, learningPoints }, … ]
--   place = null                 on no passage
--         | { "stored": uuid }   on a passage the stage already has
--         | { "created": n }     on the n-th of p_passages, from 0
--   learningPoints = [ uuid, … ] tags of the stage's topic; may be absent
--
-- Each row is inserted in turn and takes the next place of its sequence,
-- so the stage gets the passages and then the questions in the order
-- they are given. Anything refused undoes all of it.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_stage_rows(p_stage_id uuid, p_passages jsonb, p_questions jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_created uuid[] := '{}';
  v_row jsonb;
  v_id uuid;
  v_passage_id uuid;
  v_topic_id uuid;
  v_missing text;
  v_stray text;
  v_added integer := 0;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can import into a stage';
  END IF;

  SELECT s.topic_id INTO v_topic_id FROM public.stages s WHERE s.id = p_stage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found: %', p_stage_id;
  END IF;

  -- Every picture is a key called image_path, wherever it sits in a row.
  SELECT named.path #>> '{}'
  INTO v_missing
  FROM jsonb_path_query(
    jsonb_build_array(COALESCE(p_passages, '[]'::jsonb), COALESCE(p_questions, '[]'::jsonb)),
    'lax $.**.image_path ? (@.type() == "string")'
  ) AS named(path)
  WHERE NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'question-images'
      AND o.name = named.path #>> '{}'
      AND o.name LIKE 'stages/' || p_stage_id || '/%'
  )
  LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'An imported row names a picture that is not stored for the stage: %', v_missing;
  END IF;

  -- Every learning point is a tag of the stage's topic.
  SELECT point.id
  INTO v_stray
  FROM jsonb_array_elements(COALESCE(p_questions, '[]'::jsonb)) AS question(elem)
  CROSS JOIN LATERAL jsonb_array_elements_text(
    COALESCE(question.elem->'learningPoints', '[]'::jsonb)
  ) AS point(id)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tag_topics tt
    WHERE tt.topic_id = v_topic_id
      AND tt.tag_id::text = point.id
  )
  LIMIT 1;
  IF v_stray IS NOT NULL THEN
    RAISE EXCEPTION 'An imported question names a learning point its topic does not have: %', v_stray;
  END IF;

  FOR v_row IN
    SELECT e.elem
    FROM jsonb_array_elements(COALESCE(p_passages, '[]'::jsonb)) WITH ORDINALITY AS e(elem, ord)
    ORDER BY e.ord
  LOOP
    INSERT INTO public.passages (stage_id, title, body, image_path)
    VALUES (p_stage_id, v_row->>'title', COALESCE(v_row->>'body', ''), v_row->>'image_path')
    RETURNING id INTO v_id;
    v_created := v_created || v_id;
  END LOOP;

  FOR v_row IN
    SELECT e.elem
    FROM jsonb_array_elements(COALESCE(p_questions, '[]'::jsonb)) WITH ORDINALITY AS e(elem, ord)
    ORDER BY e.ord
  LOOP
    v_passage_id := CASE
      WHEN v_row->'place' ? 'stored' THEN (v_row->'place'->>'stored')::uuid
      WHEN v_row->'place' ? 'created' THEN v_created[(v_row->'place'->>'created')::integer + 1]
    END;
    IF jsonb_typeof(v_row->'place') = 'object' AND v_passage_id IS NULL THEN
      RAISE EXCEPTION 'An imported question names a passage that is not there';
    END IF;

    -- A stored passage of another stage is refused by the questions' own
    -- foreign key, which ties a passage to its stage.
    INSERT INTO public.questions (stage_id, passage_id, difficulty, payload)
    VALUES (
      p_stage_id,
      v_passage_id,
      (v_row->>'difficulty')::public.question_difficulty,
      v_row->'payload'
    )
    RETURNING id INTO v_id;

    -- Named twice, a learning point is still one.
    INSERT INTO public.question_tags (question_id, tag_id)
    SELECT DISTINCT v_id, point.id::uuid
    FROM jsonb_array_elements_text(COALESCE(v_row->'learningPoints', '[]'::jsonb)) AS point(id);

    v_added := v_added + 1;
  END LOOP;

  RETURN v_added;
END;
$$;

COMMENT ON FUNCTION public.import_stage_rows(uuid, jsonb, jsonb) IS
  'Adds an import to the end of a stage in one transaction: its passages, then its questions, each with its learning points. Admins only. Refuses a row that names a picture not stored in the stage''s folder of the question images bucket, or a learning point the stage''s topic does not have.';
