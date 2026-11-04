-- An import names its questions' learning points rather than giving their ids,
-- and a name the stage's topic does not have yet is made the topic's, as the
-- builder makes one. The review lists those names first, so an admin can tell
-- a new learning point from a typo before anything is added.

CREATE OR REPLACE FUNCTION public.import_stage_rows(
  p_stage_id uuid,
  p_passages jsonb,
  p_questions jsonb,
  p_seen_passages uuid[],
  p_seen_questions uuid[]
)
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
  v_added integer := 0;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can import into a stage';
  END IF;

  SELECT s.topic_id INTO v_topic_id FROM public.stages s WHERE s.id = p_stage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found: %', p_stage_id;
  END IF;

  -- The stage holds what the import was planned against, no more and no less.
  IF (
    SELECT COALESCE(array_agg(p.id ORDER BY p.id), '{}')
    FROM public.passages p
    WHERE p.stage_id = p_stage_id
  ) IS DISTINCT FROM (
    SELECT COALESCE(array_agg(DISTINCT seen.id ORDER BY seen.id), '{}')
    FROM unnest(p_seen_passages) AS seen(id)
  ) OR (
    SELECT COALESCE(array_agg(q.id ORDER BY q.id), '{}')
    FROM public.questions q
    WHERE q.stage_id = p_stage_id
  ) IS DISTINCT FROM (
    SELECT COALESCE(array_agg(DISTINCT seen.id ORDER BY seen.id), '{}')
    FROM unnest(p_seen_questions) AS seen(id)
  ) THEN
    RAISE EXCEPTION 'The stage has changed since the import was planned'
      USING ERRCODE = 'PT409';
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

  -- A learning point is named; the name is one a person could have typed.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_questions, '[]'::jsonb)) AS question(elem)
    CROSS JOIN LATERAL jsonb_array_elements_text(
      COALESCE(question.elem->'learningPoints', '[]'::jsonb)
    ) AS point(name)
    WHERE btrim(point.name) = '' OR char_length(btrim(point.name)) > 120
  ) THEN
    RAISE EXCEPTION 'An imported question names a learning point by a name that is empty or too long';
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

    -- Named twice, a learning point is still one. A name the stage's topic does not have
    -- yet is made its own, as the builder makes one, which the review showed as new.
    INSERT INTO public.question_tags (question_id, tag_id)
    SELECT v_id, public.offer_learning_point(p_stage_id, named.name)
    FROM (
      SELECT DISTINCT lower(btrim(point.name)) AS name
      FROM jsonb_array_elements_text(COALESCE(v_row->'learningPoints', '[]'::jsonb)) AS point(name)
    ) AS named;

    v_added := v_added + 1;
  END LOOP;

  RETURN v_added;
END;
$$;

COMMENT ON FUNCTION public.import_stage_rows(uuid, jsonb, jsonb, uuid[], uuid[]) IS
  'Adds an import to the end of a stage in one transaction: its passages, then its questions, each with its learning points, named. A name the stage''s topic does not have yet is made the topic''s, as offer_learning_point makes it. Admins only. Refuses with SQLSTATE PT409 when the stage does not hold exactly the passages and questions the import was planned against, so the caller plans again. Refuses a row that names a picture not stored in the stage''s folder of the question images bucket.';
