-- ============================================================
-- Clavis revamp — P23a: what the admin practice builder stores.
--
-- The builder turns a stage from a pool the runner samples into a paper the
-- admin lays out: every question is served, in an order, some of them under a
-- shared passage, and in fourteen types instead of seven. This migration is
-- the storage half of that; marking and the sanitizer follow in P23b and do
-- not move here.
--
--   D1  stages.question_order — `fixed` (the builder's order) or `random`.
--       A stage carries no cover image: stages.cover_image_path is dropped.
--   D2  passages — a text and/or a picture with questions beneath it. It
--       holds no answer key, so `authenticated` may read it whole.
--   D3  questions gains three filing columns: passage_id, display_order,
--       difficulty. A question can only sit on a passage of ITS OWN stage:
--       the foreign key is the pair (passage_id, stage_id).
--   D4  Order. A stage's top level is ONE sequence shared by its passages and
--       the questions that are on no passage; a passage's questions are a
--       second sequence inside it. Hence two reorder RPCs, and a passage and
--       a question beside it never share a display_order.
--   D5  public.item_payload_is_valid learns six types (tick_table,
--       pick_words, word_completion, rearrange, classify, label_picture) and
--       the new optional keys of the old ones. Nothing an existing payload
--       relies on is tightened — the same function backs the CHECKs on
--       assessment_bank_questions and assessment_questions, and a CHECK is
--       re-evaluated whenever a stored row is next updated.
--   D6  Practice accepts fourteen types: everything but `long_answer`, which
--       needs a marker and practice has none.
--   D7  The `question-images` bucket exists wherever the migrations have run,
--       and its write policies test app.is_admin() like every other table.
--
-- Nothing here is a compatibility layer: the old policies are replaced, not
-- kept beside the new ones.
-- ============================================================

-- ------------------------------------------------------------
-- 1. A stage has a question order (D1)
--
-- Table-level grants on stages already cover a new column.
-- ------------------------------------------------------------
ALTER TABLE public.stages
  ADD COLUMN question_order text NOT NULL DEFAULT 'fixed'
    CONSTRAINT stages_question_order_check CHECK (question_order IN ('fixed', 'random'));

COMMENT ON COLUMN public.stages.question_order IS
  'How a pupil meets the stage''s questions: `fixed` = in the builder''s order (display_order), `random` = shuffled. Either way every question is served, and a passage''s questions stay together in their own order.';

-- Stages carry no cover image: the builder lists them by name and position.
ALTER TABLE public.stages DROP COLUMN cover_image_path;

-- ------------------------------------------------------------
-- 2. passages (D2)
--
-- UNIQUE (id, stage_id) says nothing new about the rows — id is already the
-- key — it exists so questions can reference the PAIR (section 3).
--
-- display_order has no default on purpose: a passage always joins the stage's
-- sequence at a position the writer chose (the end, max + 1).
-- ------------------------------------------------------------
CREATE TABLE public.passages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  title text NOT NULL CONSTRAINT passages_title_check CHECK (btrim(title) <> ''),
  body text NOT NULL DEFAULT '',
  image_path text CONSTRAINT passages_image_path_check CHECK (btrim(image_path) <> ''),
  display_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A passage with nothing to read and nothing to look at is not a passage.
  CONSTRAINT passages_content_check CHECK (btrim(body) <> '' OR image_path IS NOT NULL),
  CONSTRAINT passages_id_stage_id_key UNIQUE (id, stage_id)
);

ALTER TABLE public.passages OWNER TO postgres;

COMMENT ON TABLE public.passages IS
  'A shared passage of a practice stage: a text and/or a picture with the questions that go with it (questions.passage_id). One block in the stage''s order — display_order is a position in the sequence the stage''s passages share with its top-level questions. Holds no answer key.';

COMMENT ON COLUMN public.passages.title IS
  'The admin''s name for the passage in the builder''s list.';
COMMENT ON COLUMN public.passages.body IS
  'The text pupils read. May be empty when the passage is a picture.';
COMMENT ON COLUMN public.passages.image_path IS
  'Optional picture; an object path in the question-images bucket.';
COMMENT ON COLUMN public.passages.display_order IS
  'Position among the stage''s top-level entries (passages and questions with no passage). Written by reorder_stage_entries().';

CREATE INDEX idx_passages_stage ON public.passages USING btree (stage_id);

CREATE TRIGGER update_passages_updated_at
  BEFORE UPDATE ON public.passages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.passages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can insert passages" ON public.passages
  FOR INSERT TO authenticated WITH CHECK ((SELECT app.is_admin()));
CREATE POLICY "Admins can update passages" ON public.passages
  FOR UPDATE TO authenticated USING ((SELECT app.is_admin()));
CREATE POLICY "Admins can delete passages" ON public.passages
  FOR DELETE TO authenticated USING ((SELECT app.is_admin()));
CREATE POLICY "Read passages: authenticated" ON public.passages
  FOR SELECT TO authenticated USING (true);

-- Supabase's default privileges grant ALL on new public tables to
-- anon/authenticated, so the revokes below are load-bearing.
REVOKE ALL ON TABLE public.passages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.passages TO authenticated;
GRANT ALL ON TABLE public.passages TO service_role;

-- ------------------------------------------------------------
-- 3. questions: passage, order, difficulty (D3)
--
-- The foreign key is (passage_id, stage_id) -> passages (id, stage_id), so a
-- question cannot be filed under a passage of another stage however it is
-- written. With passage_id NULL the pair is not checked at all (MATCH
-- SIMPLE): a question on no passage.
--
-- ON DELETE CASCADE: a passage's questions make no sense without it, and the
-- builder deletes the block as one.
-- ------------------------------------------------------------
ALTER TABLE public.questions
  ADD COLUMN passage_id uuid,
  ADD COLUMN display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN difficulty public.question_difficulty NOT NULL DEFAULT 'medium',
  ADD CONSTRAINT questions_passage_id_stage_id_fkey
    FOREIGN KEY (passage_id, stage_id)
    REFERENCES public.passages (id, stage_id)
    ON DELETE CASCADE;

-- The cascade above looks a passage's questions up by passage_id, and so
-- does every read of one passage's sequence.
CREATE INDEX idx_questions_passage ON public.questions USING btree (passage_id)
  WHERE passage_id IS NOT NULL;

COMMENT ON COLUMN public.questions.passage_id IS
  'The passage this question sits under, or NULL for a top-level question. Always a passage of the same stage (composite foreign key).';
COMMENT ON COLUMN public.questions.display_order IS
  'Position in its sequence: among the stage''s top-level entries when passage_id is NULL (shared with passages), among the passage''s questions otherwise. Written by reorder_stage_entries() / reorder_passage_questions().';
COMMENT ON COLUMN public.questions.difficulty IS
  'The admin''s rating of the question: low, medium or high.';

-- Existing questions take the order they were written in, per stage. No
-- passage exists yet, so every one of them is a top-level entry.
--
-- questions_updated_at_trigger is held off: numbering a row is not an edit,
-- and `updated_at` is what an admin reads as "last changed".
ALTER TABLE public.questions DISABLE TRIGGER questions_updated_at_trigger;

UPDATE public.questions q
SET display_order = o.ord
FROM (
  SELECT
    x.id,
    row_number() OVER (PARTITION BY x.stage_id ORDER BY x.created_at, x.id) AS ord
  FROM public.questions x
) AS o
WHERE q.id = o.id;

ALTER TABLE public.questions ENABLE TRIGGER questions_updated_at_trigger;

-- The three are filing columns: a runner needs them to lay a stage out, and
-- none of them says anything about an answer. `payload` stays ungranted
-- (P21a section 5.5) — SELECT on questions is column by column, so a new
-- column is unreadable until it is granted here.
GRANT SELECT (passage_id, display_order, difficulty)
  ON TABLE public.questions TO authenticated;

-- ------------------------------------------------------------
-- 4. Reorder RPCs (D4)
--
-- Same conventions as reorder_stages (P19a): admin-only, p_ids must be a
-- permutation of exactly the parent's children, display_order = the 1-based
-- position, and no other column is written. Only rows whose position
-- actually changes are touched, so a drag does not stamp `updated_at` on
-- the whole stage.
-- ------------------------------------------------------------

-- 4.1 A stage's top level: passages and questions on no passage, mixed.
--     Each id is written to whichever table it belongs to.
CREATE FUNCTION public.reorder_stage_entries(p_stage_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_children bigint;
  v_matched bigint;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can reorder a stage''s questions';
  END IF;

  -- The stage's row is locked for the length of the call, so two reorders of
  -- one stage run one after the other. Each writes only the rows it moves, and
  -- without the lock two overlapping calls could each move a different row and
  -- leave two entries in the same place.
  PERFORM 1 FROM stages WHERE id = p_stage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found: %', p_stage_id;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE e.id = ANY (p_ids))
  INTO v_children, v_matched
  FROM (
    SELECT p.id FROM passages p WHERE p.stage_id = p_stage_id
    UNION ALL
    SELECT q.id FROM questions q WHERE q.stage_id = p_stage_id AND q.passage_id IS NULL
  ) AS e;

  PERFORM app.assert_reorder_permutation('stage entries', p_ids, v_children, v_matched);

  UPDATE passages p
  SET display_order = i.ord
  FROM unnest(p_ids) WITH ORDINALITY AS i(id, ord)
  WHERE p.id = i.id
    AND p.stage_id = p_stage_id
    AND p.display_order IS DISTINCT FROM i.ord;

  UPDATE questions q
  SET display_order = i.ord
  FROM unnest(p_ids) WITH ORDINALITY AS i(id, ord)
  WHERE q.id = i.id
    AND q.stage_id = p_stage_id
    AND q.passage_id IS NULL
    AND q.display_order IS DISTINCT FROM i.ord;
END;
$$;

ALTER FUNCTION public.reorder_stage_entries(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reorder_stage_entries(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_stage_entries(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_stage_entries(uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION public.reorder_stage_entries(uuid, uuid[]) IS
  'Admin-only positional reorder of one stage''s top level: p_ids holds the stage''s passage ids and the ids of its questions on no passage, mixed, and must be a permutation of exactly that set. display_order = 1-based index of p_ids, written to passages or questions as the id belongs. Touches no other column.';

-- 4.2 The questions of one passage.
CREATE FUNCTION public.reorder_passage_questions(p_passage_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_children bigint;
  v_matched bigint;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can reorder a passage''s questions';
  END IF;

  -- Locked for the same reason as the stage's row in reorder_stage_entries.
  PERFORM 1 FROM passages WHERE id = p_passage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Passage not found: %', p_passage_id;
  END IF;

  SELECT count(*) INTO v_children
  FROM questions q WHERE q.passage_id = p_passage_id;

  SELECT count(*) INTO v_matched
  FROM questions q WHERE q.passage_id = p_passage_id AND q.id = ANY (p_ids);

  PERFORM app.assert_reorder_permutation('passage questions', p_ids, v_children, v_matched);

  UPDATE questions q
  SET display_order = i.ord
  FROM unnest(p_ids) WITH ORDINALITY AS i(id, ord)
  WHERE q.id = i.id
    AND q.passage_id = p_passage_id
    AND q.display_order IS DISTINCT FROM i.ord;
END;
$$;

ALTER FUNCTION public.reorder_passage_questions(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reorder_passage_questions(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_passage_questions(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_passage_questions(uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION public.reorder_passage_questions(uuid, uuid[]) IS
  'Admin-only positional reorder of one passage''s questions: p_ids must be a permutation of exactly the questions on that passage. display_order = 1-based index of p_ids. Touches no other column.';

-- ------------------------------------------------------------
-- 5. The admin bank read follows the builder's order
--
-- Same signature and guards as P19a; only ORDER BY moves. SETOF questions
-- follows the table, so the three new columns come back without a change
-- here. Within one stage the rows come out by display_order — the top-level
-- sequence and every passage's own sequence interleaved, which the caller
-- splits on passage_id. stage_id leads so that the whole bank (NULL) still
-- comes out stage by stage.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_bank_questions(p_stage_id uuid DEFAULT NULL)
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
  ORDER BY q.stage_id, q.display_order, q.created_at, q.id;
END;
$$;

COMMENT ON FUNCTION public.get_bank_questions(uuid) IS
  'Full practice-bank rows INCLUDING the payload (answer keys and tips) for authoring. Platform admin only. Ordered by display_order, then created_at, within a stage; NULL p_stage_id returns the whole bank, stage by stage.';

-- ------------------------------------------------------------
-- 6. The validator learns the builder's types (D5)
--
-- CREATE OR REPLACE keeps the function's OID, so the three CHECKs that use
-- it stay attached. Every rule the nine existing types had is kept exactly
-- as it was; what is new is
--
--   true_false   labels
--   numeric      form, and per form: parts, equivalent, improper, period, units
--   cloze        mode, distractors, reuse, blanks[].choices
--   matching     image_path on left / right items
--   ordering     image_path on items
--   and the six new types.
--
-- Two house rules for a key that may be left out, both already true of the
-- old keys: a key whose value may be null (image_path, tip, tolerance, unit,
-- labels, period) may equally be absent; any other optional key (form, mode,
-- distractors, reuse, choices, reveal_first, equivalent, improper) is absent
-- or of its type, never null.
--
-- Two rules of the item schema are NOT enforced here for the old types,
-- because they would refuse payloads that are valid today: "an option needs
-- text or an image" (mcq, mrq) and "an item needs text or an image"
-- (matching, ordering). The new types enforce them from the start.
--
-- It must never raise: jsonb_array_elements and jsonb_array_length are only
-- reached after an earlier statement has established an array, numbers are
-- compared as jsonb or as text and never cast, and a rule over a list is
-- written as "no element for which the rule IS NOT TRUE", so an element that
-- makes the rule NULL is refused rather than waved through.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.item_payload_is_valid(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_type text;
  v_form text;
  v_mode text;
  v_parts integer;
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

  -- P10a: optional question-level image, every type. Absent or JSON null = no
  -- image; otherwise a non-blank storage object path.
  IF (p ? 'image_path') AND jsonb_typeof(p->'image_path') <> 'null' THEN
    IF jsonb_typeof(p->'image_path') <> 'string'
       OR btrim(COALESCE(p->>'image_path', '')) = ''
    THEN
      RETURN false;
    END IF;
  END IF;

  -- P21a: optional question-level tip, every type. Absent or JSON null = no
  -- tip; otherwise a string.
  IF (p ? 'tip') AND jsonb_typeof(p->'tip') NOT IN ('string', 'null') THEN
    RETURN false;
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
         -- P10a: optional per-option image, same rule as the question-level one.
         OR ((e.elem ? 'image_path')
             AND NOT (
               jsonb_typeof(e.elem->'image_path') = 'null'
               OR (jsonb_typeof(e.elem->'image_path') = 'string'
                   AND btrim(COALESCE(e.elem->>'image_path', '')) <> '')
             ))
         -- P21a: optional per-option tip, same rule as the question-level one.
         OR ((e.elem ? 'tip') AND jsonb_typeof(e.elem->'tip') NOT IN ('string', 'null'))
    ) THEN RETURN false; END IF;

    -- A question with no correct option can never be answered correctly.
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'options') AS e(elem)
      WHERE e.elem->'is_correct' = 'true'::jsonb
    ) THEN RETURN false; END IF;

    -- P21a: single choice means single key. An mcq with two correct options
    -- can never be answered correctly either — the runner lets a student
    -- pick one, and the grader wants the whole set. mrq is the type for that.
    IF v_type = 'mcq' AND (
      SELECT count(*)
      FROM jsonb_array_elements(p->'options') AS e(elem)
      WHERE e.elem->'is_correct' = 'true'::jsonb
    ) <> 1 THEN RETURN false; END IF;

    RETURN true;
  END IF;

  -- ---- pick_words (P23a) ----------------------------------------------
  -- A sentence cut into words, in order; the pupil taps the ones that are
  -- answers. Unlike an mcq option a word is always text and always says
  -- whether it is an answer.
  IF v_type = 'pick_words' THEN
    IF COALESCE(jsonb_typeof(p->'options'), '') <> 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(p->'options') < 2 THEN RETURN false; END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'options') AS e(elem)
      WHERE (
        jsonb_typeof(e.elem) = 'object'
        AND jsonb_typeof(e.elem->'text') = 'string'
        AND btrim(e.elem->>'text') <> ''
        AND jsonb_typeof(e.elem->'is_correct') = 'boolean'
      ) IS NOT TRUE
    ) THEN RETURN false; END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'options') AS e(elem)
      WHERE e.elem->'is_correct' = 'true'::jsonb
    ) THEN RETURN false; END IF;

    RETURN true;
  END IF;

  -- ---- true_false -----------------------------------------------------
  IF v_type = 'true_false' THEN
    IF COALESCE(jsonb_typeof(p->'answer'), '') <> 'boolean' THEN RETURN false; END IF;

    -- P23a: optional labels — the word for true, then the word for false
    -- (Betul / Salah, Yes / No). Absent or JSON null = the runner's own.
    IF (p ? 'labels') AND jsonb_typeof(p->'labels') <> 'null' THEN
      IF jsonb_typeof(p->'labels') <> 'array' THEN RETURN false; END IF;
      IF jsonb_array_length(p->'labels') <> 2 THEN RETURN false; END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p->'labels') AS e(elem)
        WHERE (jsonb_typeof(e.elem) = 'string' AND btrim(e.elem #>> '{}') <> '') IS NOT TRUE
      ) THEN RETURN false; END IF;
    END IF;

    RETURN true;
  END IF;

  -- ---- numeric --------------------------------------------------------
  IF v_type = 'numeric' THEN
    -- P23a: `form` says how the answer is written. Absent = number, which is
    -- every numeric item stored before this migration.
    IF p ? 'form' THEN
      IF jsonb_typeof(p->'form') <> 'string' THEN RETURN false; END IF;
      v_form := p->>'form';
    ELSE
      v_form := 'number';
    END IF;

    -- number, money: one value.
    IF v_form IN ('number', 'money') THEN
      IF COALESCE(jsonb_typeof(p->'answer'), '') <> 'number' THEN RETURN false; END IF;

      IF v_form = 'number' THEN
        IF (p ? 'tolerance') AND jsonb_typeof(p->'tolerance') <> 'null' THEN
          IF jsonb_typeof(p->'tolerance') <> 'number' THEN RETURN false; END IF;
          -- jsonb number comparison: no cast, so no overflow can raise here.
          IF p->'tolerance' < '0'::jsonb THEN RETURN false; END IF;
        END IF;

        IF (p ? 'unit') AND jsonb_typeof(p->'unit') NOT IN ('string', 'null') THEN
          RETURN false;
        END IF;
      END IF;

      RETURN true;
    END IF;

    -- Every other form is written in parts: fraction [numerator,
    -- denominator], mixed [whole, numerator, denominator], ratio [a, b] or
    -- [a, b, c], time [hour, minute], measure [large, small].
    IF v_form NOT IN ('fraction', 'mixed', 'ratio', 'time', 'measure') THEN
      RETURN false;
    END IF;

    IF COALESCE(jsonb_typeof(p->'parts'), '') <> 'array' THEN RETURN false; END IF;

    v_parts := jsonb_array_length(p->'parts');
    IF v_parts NOT IN (2, 3)
       OR (v_form = 'mixed' AND v_parts <> 3)
       OR (v_form IN ('fraction', 'time', 'measure') AND v_parts <> 2)
    THEN RETURN false; END IF;

    -- Non-negative integers. jsonb keeps a number's digits, so the test is
    -- on its text and nothing is cast.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'parts') AS e(elem)
      WHERE (jsonb_typeof(e.elem) = 'number' AND e.elem #>> '{}' ~ '^[0-9]+$') IS NOT TRUE
    ) THEN RETURN false; END IF;

    IF v_form IN ('fraction', 'mixed') THEN
      -- The denominator is the last part.
      IF p->'parts'-> -1 = '0'::jsonb THEN RETURN false; END IF;
    END IF;

    IF v_form IN ('fraction', 'ratio') THEN
      IF (p ? 'equivalent') AND jsonb_typeof(p->'equivalent') <> 'boolean' THEN
        RETURN false;
      END IF;
    END IF;

    IF v_form = 'mixed' THEN
      IF (p ? 'improper') AND jsonb_typeof(p->'improper') <> 'boolean' THEN
        RETURN false;
      END IF;
      IF (p ? 'unit') AND jsonb_typeof(p->'unit') NOT IN ('string', 'null') THEN
        RETURN false;
      END IF;
    END IF;

    IF v_form = 'time' THEN
      IF p->'parts'->1 > '59'::jsonb THEN RETURN false; END IF;

      -- period: 'am' | 'pm' on a 12-hour clock; absent or JSON null = a
      -- 24-hour clock.
      IF NOT (p ? 'period') OR jsonb_typeof(p->'period') = 'null' THEN
        IF p->'parts'->0 > '23'::jsonb THEN RETURN false; END IF;
      ELSIF p->'period' IN ('"am"'::jsonb, '"pm"'::jsonb) THEN
        IF p->'parts'->0 < '1'::jsonb OR p->'parts'->0 > '12'::jsonb THEN
          RETURN false;
        END IF;
      ELSE
        RETURN false;
      END IF;
    END IF;

    IF v_form = 'measure' THEN
      -- The two unit names, large then small: ℓ and mℓ, km and m.
      IF COALESCE(jsonb_typeof(p->'units'), '') <> 'array' THEN RETURN false; END IF;
      IF jsonb_array_length(p->'units') <> 2 THEN RETURN false; END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p->'units') AS e(elem)
        WHERE (jsonb_typeof(e.elem) = 'string' AND btrim(e.elem #>> '{}') <> '') IS NOT TRUE
      ) THEN RETURN false; END IF;
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

  -- ---- word_completion (P23a) -----------------------------------------
  -- One word spelt a box a letter, so no white space and a length a row of
  -- boxes can hold.
  IF v_type = 'word_completion' THEN
    IF COALESCE(jsonb_typeof(p->'answer'), '') <> 'string' THEN RETURN false; END IF;
    IF char_length(p->>'answer') NOT BETWEEN 2 AND 30 THEN RETURN false; END IF;
    IF p->>'answer' ~ '[[:space:]]' THEN RETURN false; END IF;

    IF (p ? 'reveal_first') AND jsonb_typeof(p->'reveal_first') <> 'boolean' THEN
      RETURN false;
    END IF;

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

    -- P23a: how a pupil fills a blank. Absent = typing, which is every
    -- cloze item stored before this migration.
    IF p ? 'mode' THEN
      IF p->'mode' NOT IN ('"typing"'::jsonb, '"bank"'::jsonb, '"choices"'::jsonb) THEN
        RETURN false;
      END IF;
      v_mode := p->>'mode';
    ELSE
      v_mode := 'typing';
    END IF;

    -- bank: extra words beside the answers, and whether a word can be used
    -- more than once. Their shape is checked whatever the mode.
    IF p ? 'distractors' THEN
      IF jsonb_typeof(p->'distractors') <> 'array' THEN RETURN false; END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p->'distractors') AS e(elem)
        WHERE (jsonb_typeof(e.elem) = 'string' AND btrim(e.elem #>> '{}') <> '') IS NOT TRUE
      ) THEN RETURN false; END IF;
    END IF;

    IF (p ? 'reuse') AND jsonb_typeof(p->'reuse') <> 'boolean' THEN
      RETURN false;
    END IF;

    -- A blank's choices, wherever it carries them: two to four different
    -- words. (The first statement guards the element access in the second.)
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'blanks') AS e(elem)
      WHERE (e.elem ? 'choices') AND jsonb_typeof(e.elem->'choices') <> 'array'
    ) THEN RETURN false; END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'blanks') AS e(elem)
      WHERE (e.elem ? 'choices')
        AND (
          jsonb_array_length(e.elem->'choices') BETWEEN 2 AND 4
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(e.elem->'choices') AS c(item)
            WHERE (jsonb_typeof(c.item) = 'string' AND btrim(c.item #>> '{}') <> '') IS NOT TRUE
          )
          AND (SELECT count(DISTINCT c.item) FROM jsonb_array_elements(e.elem->'choices') AS c(item))
              = jsonb_array_length(e.elem->'choices')
        ) IS NOT TRUE
    ) THEN RETURN false; END IF;

    -- choices: every blank offers choices and its answer — the first
    -- accepted spelling — is one of them, or the blank cannot be got right.
    IF v_mode = 'choices' AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'blanks') AS e(elem)
      WHERE (
        (e.elem ? 'choices')
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(e.elem->'choices') AS c(item)
          WHERE c.item = e.elem->'accepted'->0
        )
      ) IS NOT TRUE
    ) THEN RETURN false; END IF;

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
         -- P23a: optional per-item image, same rule as the question-level one.
         OR ((e.elem ? 'image_path')
             AND NOT (
               jsonb_typeof(e.elem->'image_path') = 'null'
               OR (jsonb_typeof(e.elem->'image_path') = 'string'
                   AND btrim(COALESCE(e.elem->>'image_path', '')) <> '')
             ))
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

  -- ---- ordering / rearrange -------------------------------------------
  -- One shape, two meanings. ordering: items (words or pictures) put in
  -- order, a mark a position. rearrange (P23a): the chips of one sentence —
  -- always words, so a chip's text is never blank.
  IF v_type IN ('ordering', 'rearrange') THEN
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
         -- P23a: optional per-item image, same rule as the question-level one.
         OR (v_type = 'ordering'
             AND (e.elem ? 'image_path')
             AND NOT (
               jsonb_typeof(e.elem->'image_path') = 'null'
               OR (jsonb_typeof(e.elem->'image_path') = 'string'
                   AND btrim(COALESCE(e.elem->>'image_path', '')) <> '')
             ))
         OR (v_type = 'rearrange' AND btrim(COALESCE(e.elem->>'text', '')) = '')
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

  -- ---- tick_table / classify (P23a) -----------------------------------
  -- Both put every item under one of a few named groups. A tick table draws
  -- the groups as columns and the items as rows of text: two to five
  -- columns, one row or more. Classify sorts items — words or pictures —
  -- into two to four groups, and takes two items to be a sort at all.
  IF v_type IN ('tick_table', 'classify') THEN
    IF COALESCE(jsonb_typeof(p->'groups'), '') <> 'array'
       OR COALESCE(jsonb_typeof(p->'items'), '') <> 'array'
    THEN RETURN false; END IF;

    IF jsonb_array_length(p->'groups') NOT BETWEEN 2 AND (CASE v_type WHEN 'tick_table' THEN 5 ELSE 4 END) THEN
      RETURN false;
    END IF;
    IF jsonb_array_length(p->'items') < (CASE v_type WHEN 'tick_table' THEN 1 ELSE 2 END) THEN
      RETURN false;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'groups') AS e(elem)
      WHERE (
        jsonb_typeof(e.elem) = 'object'
        AND jsonb_typeof(e.elem->'id') = 'string'
        AND btrim(e.elem->>'id') <> ''
        AND jsonb_typeof(e.elem->'text') = 'string'
        AND btrim(e.elem->>'text') <> ''
      ) IS NOT TRUE
    ) THEN RETURN false; END IF;

    IF (SELECT count(DISTINCT e.elem->>'id') FROM jsonb_array_elements(p->'groups') AS e(elem))
       <> jsonb_array_length(p->'groups')
    THEN RETURN false; END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'items') AS e(elem)
      WHERE (
        jsonb_typeof(e.elem) = 'object'
        AND jsonb_typeof(e.elem->'id') = 'string'
        AND btrim(e.elem->>'id') <> ''
        AND jsonb_typeof(e.elem->'text') = 'string'
        -- the item's group is one of the groups
        AND jsonb_typeof(e.elem->'group_id') = 'string'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(p->'groups') AS g(elem)
          WHERE g.elem->>'id' = e.elem->>'group_id'
        )
        AND CASE
              WHEN v_type = 'tick_table' THEN btrim(e.elem->>'text') <> ''
              -- classify: optional image, same rule as the question-level
              -- one, and an item needs text or an image.
              WHEN NOT (e.elem ? 'image_path') OR jsonb_typeof(e.elem->'image_path') = 'null'
                THEN btrim(e.elem->>'text') <> ''
              ELSE jsonb_typeof(e.elem->'image_path') = 'string'
                   AND btrim(e.elem->>'image_path') <> ''
            END
      ) IS NOT TRUE
    ) THEN RETURN false; END IF;

    IF (SELECT count(DISTINCT e.elem->>'id') FROM jsonb_array_elements(p->'items') AS e(elem))
       <> jsonb_array_length(p->'items')
    THEN RETURN false; END IF;

    RETURN true;
  END IF;

  -- ---- label_picture (P23a) -------------------------------------------
  -- Numbered markers on a picture, each named by typing or from a word bank.
  IF v_type = 'label_picture' THEN
    -- The picture is the question, so here image_path is required. That it
    -- is not blank was checked with the common keys.
    IF COALESCE(jsonb_typeof(p->'image_path'), '') <> 'string' THEN RETURN false; END IF;

    IF NOT (p ? 'mode') OR p->'mode' NOT IN ('"bank"'::jsonb, '"typing"'::jsonb) THEN
      RETURN false;
    END IF;

    IF COALESCE(jsonb_typeof(p->'labels'), '') <> 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(p->'labels') < 1 THEN RETURN false; END IF;

    -- x and y place the marker: percent of the picture's width and height.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'labels') AS e(elem)
      WHERE (
        jsonb_typeof(e.elem) = 'object'
        AND jsonb_typeof(e.elem->'id') = 'string'
        AND btrim(e.elem->>'id') <> ''
        AND jsonb_typeof(e.elem->'text') = 'string'
        AND btrim(e.elem->>'text') <> ''
        AND jsonb_typeof(e.elem->'x') = 'number'
        AND e.elem->'x' >= '0'::jsonb
        AND e.elem->'x' <= '100'::jsonb
        AND jsonb_typeof(e.elem->'y') = 'number'
        AND e.elem->'y' >= '0'::jsonb
        AND e.elem->'y' <= '100'::jsonb
      ) IS NOT TRUE
    ) THEN RETURN false; END IF;

    IF (SELECT count(DISTINCT e.elem->>'id') FROM jsonb_array_elements(p->'labels') AS e(elem))
       <> jsonb_array_length(p->'labels')
    THEN RETURN false; END IF;

    -- bank: extra words beside the labels. Shape checked whatever the mode.
    IF p ? 'distractors' THEN
      IF jsonb_typeof(p->'distractors') <> 'array' THEN RETURN false; END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p->'distractors') AS e(elem)
        WHERE (jsonb_typeof(e.elem) = 'string' AND btrim(e.elem #>> '{}') <> '') IS NOT TRUE
      ) THEN RETURN false; END IF;
    END IF;

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

COMMENT ON FUNCTION public.item_payload_is_valid(jsonb) IS
  'Structural validation of an item payload — the one schema both banks store (R4.2). Fifteen types: mcq, mrq, pick_words, true_false, tick_table, cloze, short_answer, word_completion, numeric (forms number, money, fraction, mixed, ratio, time, measure), matching, ordering, rearrange, classify, label_picture, long_answer. Optional image_path and tip on every type (image_path is required for label_picture). Backs the payload CHECKs on assessment_bank_questions, assessment_questions and questions (which also narrows the type list). Mirrored by the app''s zod schema (src/lib/items/schema.ts). Never raises: an unrecognised or malformed payload is simply invalid.';

-- ------------------------------------------------------------
-- 7. Practice accepts fourteen types (D6)
--
-- `ordering` comes in: the builder's runner knows when one is answered.
-- `long_answer` stays out — it needs a marker and practice has none (R8.9).
-- The list is spelt out, so a type added for assessments later is not a
-- practice type until it is added here.
-- ------------------------------------------------------------
ALTER TABLE public.questions DROP CONSTRAINT questions_payload_check;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_payload_check CHECK (
    public.item_payload_is_valid(payload)
    AND payload->>'type' IN (
      'mcq', 'mrq', 'true_false', 'tick_table', 'pick_words',
      'cloze', 'short_answer', 'word_completion', 'numeric',
      'matching', 'ordering', 'rearrange', 'classify',
      'label_picture'
    )
  );

COMMENT ON COLUMN public.questions.payload IS
  'The item: type, question, optional image_path and tip, and the type''s own keys INCLUDING its answer key (see item_payload_is_valid). Image paths resolve in the question-images bucket. Not readable by authenticated.';

COMMENT ON TABLE public.questions IS
  'Practice question bank, filed under a stage and optionally under one of its passages. One row = one item payload of a practice type (mcq, mrq, true_false, tick_table, pick_words, cloze, short_answer, word_completion, numeric, matching, ordering, rearrange, classify, label_picture). `authenticated` may SELECT the filing columns only — the payload holds answer keys and tips (R4.7). Students read content through get_practice_questions() / get_practice_session_questions(); admins read whole rows through get_bank_questions().';

-- ------------------------------------------------------------
-- 8. The `question-images` bucket (D7)
--
-- Like `curriculum-images` before P22a, the bucket was made by hand in the
-- dashboard while its policies came from the first schema dump — so a
-- database built from the migrations had the policies and nowhere to put a
-- picture. Created here where it is missing, with the same limits as the
-- other image buckets. Object path: stages/<stageId>/<uuid>.<ext>.
--
-- Of the four policies, the read one is right as it stands ("Question
-- images are publicly accessible": SELECT for everyone, like every image
-- bucket) and is left alone. The three write ones are replaced: they were
-- granted TO public and looked `profiles.user_type = 'admin'` up inline —
-- the same test as app.is_admin(), but run with the caller's own rights, so
-- it held only while the profiles read policy let an admin see their own
-- row. They now read like every other admin policy in the schema.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
WHERE id = 'question-images';

DROP POLICY IF EXISTS "Admins can upload question images" ON storage.objects;
CREATE POLICY "Admins can upload question images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'question-images'
    AND (SELECT app.is_admin())
  );

DROP POLICY IF EXISTS "Admins can update question images" ON storage.objects;
CREATE POLICY "Admins can update question images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'question-images'
    AND (SELECT app.is_admin())
  )
  WITH CHECK (
    bucket_id = 'question-images'
    AND (SELECT app.is_admin())
  );

DROP POLICY IF EXISTS "Admins can delete question images" ON storage.objects;
CREATE POLICY "Admins can delete question images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'question-images'
    AND (SELECT app.is_admin())
  );
