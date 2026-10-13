-- ============================================================
-- Clavis revamp — P37a: an import is made only into the stage it was
-- planned against.
--
-- What an import adds is worked out by the server: it reads the stage,
-- leaves out the rows the stage already has, and calls
-- import_stage_rows with the rest. The function locks the stage, but the
-- reading was done before the lock. Two imports of the same rows,
-- started together, could both read the stage before either wrote, and
-- both add the rows they share.
--
--   D1  The server says what it planned against: the ids of the stage's
--       questions and passages as it read them. Under the stage's lock
--       the function looks at what the stage holds now and refuses the
--       import if that is not the same. What makes two questions the
--       same stays in one place, the server, and is not written again
--       in SQL.
--   D2  The refusal is SQLSTATE PT409, which PostgREST answers as
--       409 Conflict. The server reads the stage again, plans again and
--       calls again. It is not 40001, the code Postgres has for work
--       that is to be tried again: PostgREST runs a transaction that
--       fails with 40001 again by itself, with the same arguments, and
--       this one would fail every time, without end.
--   D3  The lock is enough to hold the answer. A new question or passage
--       holds a key lock on its stage until its transaction ends, which
--       FOR UPDATE waits for; once the function has the lock, nothing is
--       added to the stage until the import is done.
--
-- The function's arguments change, so the old one is dropped.
-- ============================================================


-- ------------------------------------------------------------
-- 1. An import in one piece, into the stage as it was read (D1, D2, D3)
--
-- p_passages:  [ { title, body, image_path }, … ]   the passages to make, in order
-- p_questions: [ { payload, difficulty, place, learningPoints }, … ]
--   place = null                 on no passage
--         | { "stored": uuid }   on a passage the stage already has
--         | { "created": n }     on the n-th of p_passages, from 0
--   learningPoints = [ uuid, … ] tags of the stage's topic; may be absent
-- p_seen_passages, p_seen_questions:
--   the ids of all the stage's passages and questions when the import
--   was planned, in any order
--
-- Each row is inserted in turn and takes the next place of its sequence,
-- so the stage gets the passages and then the questions in the order
-- they are given. Anything refused undoes all of it.
-- ------------------------------------------------------------

DROP FUNCTION public.import_stage_rows(uuid, jsonb, jsonb);

CREATE FUNCTION public.import_stage_rows(
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

ALTER FUNCTION public.import_stage_rows(uuid, jsonb, jsonb, uuid[], uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.import_stage_rows(uuid, jsonb, jsonb, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_stage_rows(uuid, jsonb, jsonb, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_stage_rows(uuid, jsonb, jsonb, uuid[], uuid[]) TO service_role;

COMMENT ON FUNCTION public.import_stage_rows(uuid, jsonb, jsonb, uuid[], uuid[]) IS
  'Adds an import to the end of a stage in one transaction: its passages, then its questions, each with its learning points. Admins only. Refuses with SQLSTATE PT409 when the stage does not hold exactly the passages and questions the import was planned against, so the caller plans again. Refuses a row that names a picture not stored in the stage''s folder of the question images bucket, or a learning point the stage''s topic does not have.';
