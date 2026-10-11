-- ============================================================
-- Clavis revamp — P33a: an import carries pictures.
--
-- A workbook may now hold pictures: a question's, an option's, an
-- item's, a passage's. They are stored before the rows are added. The
-- page uploads each one to the stage's folder in the question images
-- bucket, then asks for the rows, which name their pictures by where
-- they were stored.
--
--   D1  A passage of an import may have a picture. import_stage_rows
--       stores it with the passage. A question's is in its payload, as
--       it always was.
--   D2  A row never names a picture that is not there. The function
--       refuses the whole import if any of its rows names a picture
--       that is not stored in the stage's own folder, so a page that
--       has lost track of what it uploaded adds nothing.
--   D3  Whether a picture already belongs to another row is settled by
--       the server before it calls, with the stage's rows in hand. Only
--       that the picture is stored is checked here.
-- ============================================================


-- ------------------------------------------------------------
-- 1. An import in one piece, with its pictures (D1, D2)
--
-- p_passages:  [ { title, body, image_path }, … ]   the passages to make, in order
-- p_questions: [ { payload, difficulty, place }, … ]
--   place = null                 on no passage
--         | { "stored": uuid }   on a passage the stage already has
--         | { "created": n }     on the n-th of p_passages, from 0
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
  v_missing text;
  v_added integer := 0;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can import into a stage';
  END IF;

  PERFORM 1 FROM public.stages s WHERE s.id = p_stage_id FOR UPDATE;
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
    );
    v_added := v_added + 1;
  END LOOP;

  RETURN v_added;
END;
$$;

COMMENT ON FUNCTION public.import_stage_rows(uuid, jsonb, jsonb) IS
  'Adds an import to the end of a stage in one transaction: its passages, then its questions. Admins only. Refuses a row that names a picture not stored in the stage''s folder of the question images bucket.';
