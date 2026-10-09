-- ============================================================
-- Clavis revamp — P23c: a stage can be played before it is given to a pupil.
--
-- P23a stored the builder's stage and P23b taught the database to draw and
-- mark every type. Nothing yet turned a stage into what a pupil gets: every
-- question, in the stage's order, a passage with its questions beneath it.
-- This migration is that, and its first user is the builder's "Preview as
-- pupil": an admin plays the stage and nothing is recorded.
--
--   D1  A stage is served whole and by the server. app.serve_stage reads the
--       stage's order (stages.question_order) and returns one document: the
--       entries in served order, each question numbered as the pupil meets
--       it and drawn by app.sanitize_item_payload. No key and no tip is in
--       it, because nothing but the sanitizer's output is copied from a
--       payload.
--   D2  `random` shuffles the stage's top level by a seed. A passage is one
--       entry there, so it moves as a block and its questions keep the
--       order they were written in.
--   D3  Marks and tips show only when the whole practice is completed, and
--       a right answer is never shown for a question a pupil got wrong.
--       app.mark_stage_answers therefore takes every answer at once, marks
--       every question of the stage — the ones left out score nothing —
--       and hands back each question's marks and the tips it has earned.
--       No payload and no answer key leaves the database.
--   D4  It marks through app.grade_item_response and by the same rule as
--       grade_practice_answer(): one mark a question, shared among its
--       parts. There is still one grader.
--   D5  The two are internal (schema app, not executable by a client) so
--       that the pupil's own serving and submit RPCs wrap the same code
--       when they are written. The preview is the thin admin-only pair
--       preview_stage / mark_stage_preview on top of them. Neither writes.
--
-- Not here, on purpose: the pupil's own serving and submit. They come with
-- practice in a classroom (P26a) and wrap the same two functions.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The questions of a stage, in an order (D1, D2)
--
-- A stage's top level is one sequence shared by its passages and the
-- questions on no passage (P23a D4); a passage's questions are a second
-- sequence inside it. Read together they are the order a pupil works
-- through: `number` counts the questions across passages.
--
-- p_shuffle_seed NULL = the builder's order. Otherwise the top-level
-- entries are scrambled by md5(seed || entry id); a passage's questions
-- are never scrambled.
--
-- Ties are broken as get_bank_questions breaks them: display_order, then
-- created_at, then id.
--
-- A passage with no question under it does not appear: this lists
-- questions, and a pupil has nothing to answer there.
-- ------------------------------------------------------------
CREATE FUNCTION app.stage_question_sequence(p_stage_id uuid, p_shuffle_seed text)
RETURNS TABLE (
  number integer,
  entry_position integer,
  passage_id uuid,
  question_id uuid,
  payload jsonb
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  WITH entry AS (
    SELECT
      e.id,
      row_number() OVER (
        ORDER BY
          CASE
            WHEN p_shuffle_seed IS NULL THEN NULL::text
            ELSE md5(p_shuffle_seed || e.id::text)
          END,
          e.display_order,
          e.created_at,
          e.id
      ) AS position
    FROM (
      SELECT p.id, p.display_order, p.created_at
      FROM public.passages p
      WHERE p.stage_id = p_stage_id
      UNION ALL
      SELECT q.id, q.display_order, q.created_at
      FROM public.questions q
      WHERE q.stage_id = p_stage_id
        AND q.passage_id IS NULL
    ) AS e
  )
  -- A question's entry is its passage when it has one, else itself.
  SELECT
    row_number() OVER (ORDER BY e.position, q.display_order, q.created_at, q.id)::integer,
    e.position::integer,
    q.passage_id,
    q.id,
    q.payload
  FROM public.questions q
  JOIN entry e ON e.id = COALESCE(q.passage_id, q.id)
  WHERE q.stage_id = p_stage_id;
$$;

ALTER FUNCTION app.stage_question_sequence(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.stage_question_sequence(uuid, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.stage_question_sequence(uuid, text) IS
  'Every question of a stage with its 1-based number in an order: the builder''s (seed NULL: top-level entries by display_order, a passage''s questions by their own) or with the top-level entries scrambled by md5(seed || entry id), a passage moving as one block. Returns the whole payload, keys included. Internal to app.serve_stage and app.mark_stage_answers.';

-- ------------------------------------------------------------
-- 2. A stage as a pupil gets it (D1, D2)
--
--   { stage:   { id, name, question_order },
--     total:   how many questions,
--     entries: [ { kind: 'question', id, number, item }
--              | { kind: 'passage', id, title, body, image_path,
--                  image_bucket, questions: [ { id, number, item } ] } ] }
--
-- `item` is the sanitizer's output. The seed does two things: it orders the
-- entries of a `random` stage, and — joined to the question's id — it is
-- each question's own scramble seed, so two questions never share a
-- permutation and the same seed always draws the same paper.
--
-- A caller that gives no seed still gets a scrambled paper (the seed is
-- then ''), for the reason the sanitizer gives: a careless caller must not
-- serve an ordering in the order it was written in.
-- ------------------------------------------------------------
CREATE FUNCTION app.serve_stage(p_stage_id uuid, p_seed text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_seed text := COALESCE(p_seed, '');
  v_stage jsonb;
  v_order text;
  v_entries jsonb;
  v_total integer;
BEGIN
  SELECT
    jsonb_build_object('id', s.id, 'name', s.name, 'question_order', s.question_order),
    s.question_order
  INTO v_stage, v_order
  FROM public.stages s
  WHERE s.id = p_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found: %', p_stage_id;
  END IF;

  -- One block an entry: a top-level question alone, or a passage's
  -- questions together.
  WITH block AS (
    SELECT
      s.entry_position,
      s.passage_id,
      count(*) AS question_count,
      jsonb_agg(
        jsonb_build_object(
          'id', s.question_id,
          'number', s.number,
          'item', app.sanitize_item_payload(
            s.payload, v_seed || s.question_id::text, 'question-images'
          )
        )
        ORDER BY s.number
      ) AS questions
    FROM app.stage_question_sequence(
      p_stage_id, CASE WHEN v_order = 'random' THEN v_seed END
    ) AS s
    GROUP BY s.entry_position, s.passage_id
  )
  SELECT
    COALESCE(
      jsonb_agg(
        CASE
          WHEN b.passage_id IS NULL THEN
            jsonb_build_object('kind', 'question') || (b.questions->0)
          ELSE
            jsonb_build_object(
              'kind', 'passage',
              'id', p.id,
              'title', p.title,
              'body', p.body,
              'questions', b.questions
            )
            || app.item_image(jsonb_build_object('image_path', p.image_path), 'question-images')
        END
        ORDER BY b.entry_position
      ),
      '[]'::jsonb
    ),
    COALESCE(sum(b.question_count), 0)::integer
  INTO v_entries, v_total
  FROM block b
  LEFT JOIN public.passages p ON p.id = b.passage_id;

  RETURN jsonb_build_object('stage', v_stage, 'total', v_total, 'entries', v_entries);
END;
$$;

ALTER FUNCTION app.serve_stage(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.serve_stage(uuid, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.serve_stage(uuid, text) IS
  'A stage as a pupil gets it (P23c): {stage: {id, name, question_order}, total, entries}. An entry is {kind: "question", id, number, item} or {kind: "passage", id, title, body, image_path, image_bucket, questions: [{id, number, item}]}; item = app.sanitize_item_payload (bucket question-images, scramble seeded by the seed and the question id), number = the question''s 1-based place across passages. A `fixed` stage comes in the builder''s order, a `random` one with its entries scrambled by the seed, a passage as one block. Every question is served; never a key or a tip. Raises when the stage does not exist. Internal to the serving RPCs.';

-- ------------------------------------------------------------
-- 3. A whole set of answers, marked and not recorded (D3, D4)
--
-- p_answers is what the runner sends when the pupil finishes:
--
--   [ { question_id, selected_options, text_answer, response }, … ]
--
-- with any key absent or null. It is read, never trusted, and reading it
-- never raises — the grader's rule, one level up:
--
--   * not an array                -> no answers at all
--   * an element not an object    -> skipped
--   * question_id                 -> compared as text with the stage's
--                                    question ids; one that names no
--                                    question of THIS stage is ignored
--   * a question named twice      -> counts as not answered (no shotgun
--                                    answers, as inside the grader)
--   * selected_options            -> a JSON array, else no picks. An
--                                    element that is not a whole number an
--                                    integer holds becomes NULL, which the
--                                    grader counts as a wrong pick
--   * text_answer                 -> a JSON string, else none
--   * response                    -> a JSON object, else none
--
-- Every question of the stage comes back, in the builder's order, answered
-- or not:
--
--   { marks:     the sum of the questions' marks,
--     total:     how many questions (one mark each),
--     questions: [ { question_id, correct, total, marks, tips } ] }
--
-- `correct` of `total` are the grader's parts; `marks` is the share of the
-- question's one mark, exactly as grade_practice_answer() stores it.
-- `tips` is what the pupil is told about an answer that did not earn the
-- whole mark (app.item_tips); it is empty for one that did. The right
-- answer is never among it.
-- ------------------------------------------------------------

CREATE FUNCTION app.item_tips(p_payload jsonb, p_selected_options integer[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    -- A choice question keeps its tips on its wrong options: the pupil is
    -- shown those of the wrong options picked, in the options' order.
    WHEN p_payload->>'type' IN ('mcq', 'mrq') THEN COALESCE(
      (
        SELECT jsonb_agg(o.elem->'tip' ORDER BY o.ord)
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_payload->'options') = 'array'
               THEN p_payload->'options' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS o(elem, ord)
        WHERE o.ord = ANY (p_selected_options)
          AND o.elem->'is_correct' IS DISTINCT FROM 'true'::jsonb
          AND jsonb_typeof(o.elem->'tip') = 'string'
          AND o.elem->>'tip' ~ '\S'
      ),
      '[]'::jsonb
    )
    -- Every other type has one tip, the question's own.
    WHEN jsonb_typeof(p_payload->'tip') = 'string' AND p_payload->>'tip' ~ '\S'
      THEN jsonb_build_array(p_payload->'tip')
    ELSE '[]'::jsonb
  END;
$$;

ALTER FUNCTION app.item_tips(jsonb, integer[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.item_tips(jsonb, integer[]) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.item_tips(jsonb, integer[]) IS
  'The tips a pupil is shown for an answer that did not earn the whole mark, as a JSON array of strings: for mcq and mrq the tips of the wrong options picked, for every other type the question''s own tip. Empty when there is none. It reads tips only, never a key. The caller decides whether the mark was whole.';

CREATE FUNCTION app.stage_answers(p_stage_id uuid, p_answers jsonb)
RETURNS TABLE (
  number integer,
  question_id uuid,
  payload jsonb,
  selected_options integer[],
  text_answer text,
  response jsonb
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH answer AS (
    -- One answer a question; HAVING drops a question that was named twice.
    SELECT
      e.elem->>'question_id' AS question_id,
      jsonb_agg(e.elem)->0 AS given
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_answers) = 'array' THEN p_answers ELSE '[]'::jsonb END
    ) AS e(elem)
    WHERE jsonb_typeof(e.elem) = 'object'
      AND e.elem->>'question_id' IS NOT NULL
    GROUP BY 1
    HAVING count(*) = 1
  )
  SELECT
    s.number,
    s.question_id,
    s.payload,
    -- No pick at all is NULL, as a question that is not picked from has it.
    NULLIF(p.picks, '{}'),
    CASE WHEN jsonb_typeof(a.given->'text_answer') = 'string' THEN a.given->>'text_answer' END,
    CASE WHEN jsonb_typeof(a.given->'response') = 'object' THEN a.given->'response' END
  FROM app.stage_question_sequence(p_stage_id, NULL) AS s
  LEFT JOIN answer a ON a.question_id = s.question_id::text
  CROSS JOIN LATERAL (
    SELECT ARRAY(
      -- Nine digits always fit an integer, and no question has an option
      -- numbered higher. Anything else is a pick of nothing: NULL.
      SELECT CASE
        WHEN jsonb_typeof(o.elem) = 'number' AND o.elem #>> '{}' ~ '^-?[0-9]{1,9}$'
          THEN (o.elem #>> '{}')::integer
      END
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(a.given->'selected_options') = 'array'
             THEN a.given->'selected_options' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS o(elem, ord)
      ORDER BY o.ord
    ) AS picks
  ) AS p;
$$;

ALTER FUNCTION app.stage_answers(uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.stage_answers(uuid, jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.stage_answers(uuid, jsonb) IS
  'What was answered to each question of a stage, read out of p_answers = [{question_id, selected_options, text_answer, response}] in the three shapes the grader takes. EVERY question of the stage comes back, in the builder''s order with its whole payload, the unanswered ones with nothing in the three. An answer to a question outside the stage is ignored, a question answered twice counts as unanswered, and a malformed array never raises. It is the one reading of a pupil''s answers: what is marked and what is recorded both come from it.';

CREATE FUNCTION app.mark_stage_answers(p_stage_id uuid, p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.stages s WHERE s.id = p_stage_id) THEN
    RAISE EXCEPTION 'Stage not found: %', p_stage_id;
  END IF;

  WITH marked AS (
    SELECT
      a.number,
      a.question_id,
      g.correct,
      g.total,
      -- One mark a question, shared among its parts; an ungradable answer
      -- (0 of 0) earns nothing.
      CASE WHEN g.total > 0 THEN round(g.correct::numeric / g.total, 4) ELSE 0 END AS marks,
      -- Tips are for an answer that fell short. One that earned the whole
      -- mark gets none.
      CASE
        WHEN g.total > 0 AND g.correct = g.total THEN '[]'::jsonb
        ELSE app.item_tips(a.payload, a.selected_options)
      END AS tips
    FROM app.stage_answers(p_stage_id, p_answers) AS a
    CROSS JOIN LATERAL app.grade_item_response(
      a.payload, a.selected_options, a.text_answer, a.response
    ) AS g
  )
  SELECT jsonb_build_object(
    'marks', COALESCE(sum(m.marks), 0),
    'total', count(*),
    'questions', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'question_id', m.question_id,
          'correct', m.correct,
          'total', m.total,
          'marks', m.marks,
          'tips', m.tips
        )
        ORDER BY m.number
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM marked m;

  RETURN v_result;
END;
$$;

ALTER FUNCTION app.mark_stage_answers(uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.mark_stage_answers(uuid, jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.mark_stage_answers(uuid, jsonb) IS
  'A finished stage marked without being recorded (P23c). p_answers = [{question_id, selected_options, text_answer, response}], any key absent or null. Returns {marks, total, questions: [{question_id, correct, total, marks, tips}]}: EVERY question of the stage in the builder''s order, the unanswered ones with 0; correct of total from app.grade_item_response, marks = round(correct / total, 4) (0 when ungradable), tips = app.item_tips for an answer short of the whole mark, [] otherwise. No payload and no answer key is returned: a pupil is never shown the right answer to a question answered wrong. The answers are read by app.stage_answers. Raises when the stage does not exist. Writes nothing. Internal to the marking RPCs.';

-- ------------------------------------------------------------
-- 4. Preview as pupil (D5)
--
-- The builder's preview: the stage as it is stored now, played by an
-- admin. Admin only, tested as reorder_stage_entries tests it, and before
-- anything is read, so a refusal says nothing about whether a stage exists.
-- ------------------------------------------------------------

-- 4.1 The paper. A fresh seed each call: a `random` stage, and every
--     scrambled list, differ from one run to the next as they do between
--     pupils. That is why this one is VOLATILE and the marking is not.
CREATE FUNCTION public.preview_stage(p_stage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can preview a stage';
  END IF;

  RETURN app.serve_stage(p_stage_id, gen_random_uuid()::text);
END;
$$;

ALTER FUNCTION public.preview_stage(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.preview_stage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_stage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_stage(uuid) TO service_role;

COMMENT ON FUNCTION public.preview_stage(uuid) IS
  'Admin-only "Preview as pupil": the stage as a pupil gets it — app.serve_stage with a seed chosen here, fresh each call, so a `random` stage and every scrambled list differ between runs. {stage: {id, name, question_order}, total, entries: [{kind: "question", id, number, item} | {kind: "passage", id, title, body, image_path, image_bucket, questions: [{id, number, item}]}]}. Never a key or a tip. Writes nothing.';

-- 4.2 The marks. STABLE, so the database itself refuses a write from it.
CREATE FUNCTION public.mark_stage_preview(p_stage_id uuid, p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can preview a stage';
  END IF;

  RETURN app.mark_stage_answers(p_stage_id, p_answers);
END;
$$;

ALTER FUNCTION public.mark_stage_preview(uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_stage_preview(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_stage_preview(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_stage_preview(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.mark_stage_preview(uuid, jsonb) IS
  'Admin-only marking of a finished preview: app.mark_stage_answers over p_answers = [{question_id, selected_options, text_answer, response}]. Returns {marks, total, questions: [{question_id, correct, total, marks, tips}]} — every question of the stage in the builder''s order, unanswered ones with 0, each with the tips its answer earned and never the right answer. Records nothing: no session, no answer, no progress.';
