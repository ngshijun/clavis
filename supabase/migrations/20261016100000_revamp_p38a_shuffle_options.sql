-- ============================================================
-- Clavis revamp — P38a: the options of a choice can be shuffled.
--
-- A Multiple Choice or Multiple Response question shows its options in the
-- order they are written. An admin may now have them shuffled instead.
--
--   D1  The payload says so: `shuffle: true` on an mcq or mrq. Off is the
--       key left out, as for every other switch (P25b), and no other type
--       has the key: their lists are mixed always, or never, by what they
--       are.
--   D2  The options keep their numbers, which are what an answer and the
--       key point at; only the order they are served in changes. It is
--       made from the seed the question is served with, so a run, and a
--       session read back, each keep one order from start to end.
--
-- The two functions are written out whole; only the lines marked P38a are
-- new.
-- ============================================================


-- ------------------------------------------------------------
-- 1. What a stored payload may hold (D1)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.item_payload_is_valid(p jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $$
DECLARE
  -- White space as the form knows it (what JavaScript's trim strips), and
  -- the tests made of it: a character that shows, and the ends to trim.
  c_space constant text := '[\t\n\x0B\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]';
  c_shown constant text := '[^\t\n\x0B\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]';
  c_ends constant text := '^' || c_space || '+|' || c_space || '+$';
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
       OR COALESCE(p->>'question', '') !~ c_shown
    THEN
      RETURN false;
    END IF;
  END IF;

  -- P10a: optional question-level image, every type. Absent or JSON null = no
  -- image; otherwise a non-blank storage object path.
  IF (p ? 'image_path') AND jsonb_typeof(p->'image_path') <> 'null' THEN
    IF jsonb_typeof(p->'image_path') <> 'string'
       OR COALESCE(p->>'image_path', '') !~ c_shown
    THEN
      RETURN false;
    END IF;
  END IF;

  -- P21a: optional question-level tip, every type. Absent or JSON null = no
  -- tip; otherwise a string.
  IF (p ? 'tip') AND jsonb_typeof(p->'tip') NOT IN ('string', 'null') THEN
    RETURN false;
  END IF;

  -- ---- P25b: what the form refuses, the database refuses ---------------
  -- These rules hold for a payload of any type, so they stand here, before
  -- the types are told apart. Each reads only what is there and of the
  -- right kind: the shape itself is checked type by type below.

  -- One stored form. A switch that is off and a way of answering that is
  -- the default are stored as the key left out, never written out, so two
  -- questions that ask the same are stored the same.
  IF p->'reuse' = 'false'::jsonb
     OR p->'equivalent' = 'false'::jsonb
     OR p->'improper' = 'false'::jsonb
     OR p->'reveal_first' = 'false'::jsonb
     OR p->'shuffle' = 'false'::jsonb  -- P38a
     OR (v_type = 'cloze' AND p->'mode' = '"typing"'::jsonb)
     OR (v_type = 'numeric' AND p->'form' = '"number"'::jsonb)
  THEN RETURN false; END IF;

  -- How long a piece of text may be, in characters.
  IF char_length(COALESCE(p->>'question', '')) > 2000
     OR (v_type = 'cloze' AND char_length(COALESCE(p->>'text', '')) > 2000)
     OR EXISTS (
       SELECT 1
       FROM (VALUES
         ('$.tip', 500), ('$.options[*].tip', 500),
         ('$.options[*].text', 200), ('$.groups[*].text', 200), ('$.items[*].text', 200),
         ('$.left[*].text', 200), ('$.right[*].text', 200),
         ('$.labels[*].text', 200), ('$.labels[*]', 200),
         ('$.accepted_answers[*]', 200), ('$.blanks[*].accepted[*]', 200),
         ('$.blanks[*].choices[*]', 200), ('$.distractors[*]', 200),
         ('$.unit', 20), ('$.units[*]', 20),
         ('$.**.id', 36), ('$.**.group_id', 36), ('$.**.left_id', 36), ('$.**.right_id', 36),
         ('$.correct_order[*]', 36),
         ('$.**.image_path', 200)
       ) AS l(path, longest),
       LATERAL jsonb_path_query(p, l.path::jsonpath) AS s(v)
       WHERE jsonb_typeof(s.v) = 'string' AND char_length(s.v #>> '{}') > l.longest
     )
  THEN RETURN false; END IF;

  -- How many entries a list may hold. A sentence is cut into more pieces
  -- than a list of things has entries.
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('$.options', CASE WHEN v_type = 'pick_words' THEN 100 ELSE 50 END),
      ('$.items', CASE WHEN v_type = 'rearrange' THEN 100 ELSE 50 END),
      ('$.correct_order', CASE WHEN v_type = 'rearrange' THEN 100 ELSE 50 END),
      ('$.blanks', 50), ('$.blanks[*].accepted', 50), ('$.accepted_answers', 50),
      ('$.distractors', 50), ('$.left', 50), ('$.right', 50), ('$.pairs', 50), ('$.labels', 50)
    ) AS l(path, most),
    LATERAL jsonb_path_query(p, l.path::jsonpath) AS s(v)
    WHERE jsonb_typeof(s.v) = 'array' AND jsonb_array_length(s.v) > l.most
  ) THEN RETURN false; END IF;

  -- Two entries of one list that show the same words and the same picture
  -- cannot be told apart by a pupil. (The pieces of a sentence may repeat.)
  IF v_type IN ('mcq', 'mrq', 'tick_table', 'classify', 'matching', 'ordering') AND EXISTS (
    SELECT 1
    FROM (VALUES ('options'), ('groups'), ('items'), ('left'), ('right')) AS l(key)
    WHERE jsonb_typeof(p->l.key) = 'array'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p->l.key) AS e(elem)
        WHERE jsonb_typeof(e.elem) = 'object'
          AND (COALESCE(e.elem->>'text', '') ~ c_shown OR COALESCE(e.elem->>'image_path', '') <> '')
        GROUP BY
          regexp_replace(COALESCE(e.elem->>'text', ''), c_ends, '', 'g'),
          COALESCE(e.elem->>'image_path', '')
        HAVING count(*) > 1
      )
  ) THEN RETURN false; END IF;

  IF v_type IN ('mcq', 'mrq', 'pick_words') AND jsonb_typeof(p->'options') = 'array' THEN
    -- Every option says whether it is right, and shows words or a picture.
    IF v_type <> 'pick_words' AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'options') AS e(elem)
      WHERE jsonb_typeof(e.elem) = 'object'
        AND (
          jsonb_typeof(e.elem->'is_correct') IS DISTINCT FROM 'boolean'
          OR (COALESCE(e.elem->>'text', '') !~ c_shown
              AND COALESCE(e.elem->>'image_path', '') !~ c_shown)
        )
    ) THEN RETURN false; END IF;

    -- Where several are right, not every one is: ticking everything would
    -- be the answer. And two right at the least, or it is a Multiple Choice.
    IF v_type <> 'mcq' AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'options') AS e(elem)
      WHERE e.elem->'is_correct' = 'false'::jsonb
    ) THEN RETURN false; END IF;

    IF v_type = 'mrq' AND (
      SELECT count(*)
      FROM jsonb_array_elements(p->'options') AS e(elem)
      WHERE e.elem->'is_correct' = 'true'::jsonb
    ) < 2 THEN RETURN false; END IF;
  END IF;

  -- The two answer words of a True or False are different words.
  IF v_type = 'true_false'
     AND jsonb_typeof(p->'labels') = 'array'
     AND regexp_replace(p->'labels'->>0, c_ends, '', 'g')
       = regexp_replace(p->'labels'->>1, c_ends, '', 'g')
  THEN RETURN false; END IF;

  -- A thing a pupil joins, sorts or puts in order shows words or a picture.
  IF v_type IN ('matching', 'ordering', 'classify') AND EXISTS (
    SELECT 1
    FROM (VALUES ('left'), ('right'), ('items')) AS l(key),
         LATERAL jsonb_path_query(p, ('$.' || l.key || '[*]')::jsonpath) AS e(elem)
    WHERE jsonb_typeof(e.elem) = 'object'
      AND COALESCE(e.elem->>'text', '') !~ c_shown
      AND COALESCE(e.elem->>'image_path', '') !~ c_shown
  ) THEN RETURN false; END IF;

  IF v_type = 'numeric' THEN
    -- A time says which clock it is on: `period` is there, null for the
    -- 24-hour clock.
    IF p->'form' = '"time"'::jsonb AND NOT (p ? 'period') THEN RETURN false; END IF;

    -- A number the form can hold exactly.
    IF EXISTS (
      SELECT 1
      FROM jsonb_path_query(p, '$.parts[*]') AS s(v)
      WHERE jsonb_typeof(s.v) = 'number' AND s.v > '9007199254740991'::jsonb
    ) THEN RETURN false; END IF;
  END IF;

  IF v_type = 'cloze' AND jsonb_typeof(p->'text') = 'string' AND jsonb_typeof(p->'blanks') = 'array' THEN
    -- A blank's number is one the form can hold exactly.
    IF EXISTS (
      SELECT 1
      FROM jsonb_path_query(p, '$.blanks[*].index') AS s(v)
      WHERE jsonb_typeof(s.v) = 'number' AND s.v > '9007199254740991'::jsonb
    ) THEN RETURN false; END IF;

    -- Every blank is in the text once, and every gap in the text is a blank.
    IF (
      SELECT COALESCE(array_agg(m.found[1]::numeric ORDER BY m.found[1]::numeric), '{}')
      FROM regexp_matches(p->>'text', '\{\{(\d+)\}\}', 'g') AS m(found)
    ) IS DISTINCT FROM (
      SELECT COALESCE(array_agg(s.v::text::numeric ORDER BY s.v::text::numeric), '{}')
      FROM jsonb_path_query(p, '$.blanks[*].index') AS s(v)
      WHERE jsonb_typeof(s.v) = 'number'
    ) THEN RETURN false; END IF;

    -- A blank's choices are different words.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'blanks') WITH ORDINALITY AS b(elem, ord),
           LATERAL jsonb_path_query(b.elem, '$.choices[*]') AS c(word)
      WHERE jsonb_typeof(c.word) = 'string'
      GROUP BY b.ord, regexp_replace(c.word #>> '{}', c_ends, '', 'g')
      HAVING count(*) > 1
    ) THEN RETURN false; END IF;

    -- Word bank: two blanks with one answer need the word more than once.
    IF p->'mode' = '"bank"'::jsonb AND p->'reuse' IS DISTINCT FROM 'true'::jsonb AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'blanks') AS e(elem)
      WHERE jsonb_typeof(e.elem->'accepted'->0) = 'string'
      GROUP BY e.elem->'accepted'->>0
      HAVING count(*) > 1
    ) THEN RETURN false; END IF;
  END IF;

  -- P38a: the options of a choice may be shuffled, and nothing else is.
  IF (p ? 'shuffle')
     AND (v_type NOT IN ('mcq', 'mrq') OR jsonb_typeof(p->'shuffle') <> 'boolean')
  THEN RETURN false; END IF;

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
                   AND COALESCE(e.elem->>'image_path', '') ~ c_shown)
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
        AND e.elem->>'text' ~ c_shown
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
        WHERE (jsonb_typeof(e.elem) = 'string' AND e.elem #>> '{}' ~ c_shown) IS NOT TRUE
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
        WHERE (jsonb_typeof(e.elem) = 'string' AND e.elem #>> '{}' ~ c_shown) IS NOT TRUE
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
         OR COALESCE(e.elem #>> '{}', '') !~ c_shown
    ) THEN RETURN false; END IF;

    RETURN true;
  END IF;

  -- ---- word_completion (P23a) -----------------------------------------
  -- One word spelt a box a letter, so no white space and a length a row of
  -- boxes can hold.
  IF v_type = 'word_completion' THEN
    IF COALESCE(jsonb_typeof(p->'answer'), '') <> 'string' THEN RETURN false; END IF;
    IF char_length(p->>'answer') NOT BETWEEN 2 AND 30 THEN RETURN false; END IF;
    IF p->>'answer' ~ c_space OR p->>'answer' ~ '[\u0001-\u001F\u007F-\u009F]' THEN RETURN false; END IF;

    IF (p ? 'reveal_first') AND jsonb_typeof(p->'reveal_first') <> 'boolean' THEN
      RETURN false;
    END IF;

    RETURN true;
  END IF;

  -- ---- cloze ----------------------------------------------------------
  IF v_type = 'cloze' THEN
    IF COALESCE(jsonb_typeof(p->'text'), '') <> 'string'
       OR COALESCE(p->>'text', '') !~ c_shown
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
         OR COALESCE(a.item #>> '{}', '') !~ c_shown
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
        WHERE (jsonb_typeof(e.elem) = 'string' AND e.elem #>> '{}' ~ c_shown) IS NOT TRUE
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
            WHERE (jsonb_typeof(c.item) = 'string' AND c.item #>> '{}' ~ c_shown) IS NOT TRUE
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
         OR COALESCE(e.elem->>'id', '') !~ c_shown
         OR COALESCE(jsonb_typeof(e.elem->'text'), '') <> 'string'
         -- P23a: optional per-item image, same rule as the question-level one.
         OR ((e.elem ? 'image_path')
             AND NOT (
               jsonb_typeof(e.elem->'image_path') = 'null'
               OR (jsonb_typeof(e.elem->'image_path') = 'string'
                   AND COALESCE(e.elem->>'image_path', '') ~ c_shown)
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
         OR COALESCE(e.elem->>'id', '') !~ c_shown
         OR COALESCE(jsonb_typeof(e.elem->'text'), '') <> 'string'
         -- P23a: optional per-item image, same rule as the question-level one.
         OR (v_type = 'ordering'
             AND (e.elem ? 'image_path')
             AND NOT (
               jsonb_typeof(e.elem->'image_path') = 'null'
               OR (jsonb_typeof(e.elem->'image_path') = 'string'
                   AND COALESCE(e.elem->>'image_path', '') ~ c_shown)
             ))
         OR (v_type = 'rearrange' AND COALESCE(e.elem->>'text', '') !~ c_shown)
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
        AND e.elem->>'id' ~ c_shown
        AND jsonb_typeof(e.elem->'text') = 'string'
        AND e.elem->>'text' ~ c_shown
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
        AND e.elem->>'id' ~ c_shown
        AND jsonb_typeof(e.elem->'text') = 'string'
        -- the item's group is one of the groups
        AND jsonb_typeof(e.elem->'group_id') = 'string'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(p->'groups') AS g(elem)
          WHERE g.elem->>'id' = e.elem->>'group_id'
        )
        AND CASE
              WHEN v_type = 'tick_table' THEN e.elem->>'text' ~ c_shown
              -- classify: optional image, same rule as the question-level
              -- one, and an item needs text or an image.
              WHEN NOT (e.elem ? 'image_path') OR jsonb_typeof(e.elem->'image_path') = 'null'
                THEN e.elem->>'text' ~ c_shown
              ELSE jsonb_typeof(e.elem->'image_path') = 'string'
                   AND e.elem->>'image_path' ~ c_shown
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
        AND e.elem->>'id' ~ c_shown
        AND jsonb_typeof(e.elem->'text') = 'string'
        AND e.elem->>'text' ~ c_shown
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
        WHERE (jsonb_typeof(e.elem) = 'string' AND e.elem #>> '{}' ~ c_shown) IS NOT TRUE
      ) THEN RETURN false; END IF;
    END IF;

    RETURN true;
  END IF;

  -- Unknown type.
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.item_payload_is_valid(jsonb) IS
  'Structural validation of an item payload — the schema a practice question stores. Fourteen types: mcq, mrq, pick_words, true_false, tick_table, cloze, short_answer, word_completion, numeric (forms number, money, fraction, mixed, ratio, time, measure), matching, ordering, rearrange, classify, label_picture. Optional image_path and tip on every type (image_path is required for label_picture). An mcq or mrq may set shuffle: true; false is stored as the key left out. Backs the payload CHECK on questions. Mirrored by the app''s zod schema (src/lib/items/schema.ts). Never raises: an unrecognised or malformed payload is simply invalid.';


-- ------------------------------------------------------------
-- 2. The options served in a shuffled order (D2)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.sanitize_item_payload(p_payload jsonb, p_seed text, p_image_bucket text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $$
  SELECT
    jsonb_build_object(
      'type', p_payload->>'type',
      'question', p_payload->>'question',
      'options', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object('number', e.ord::integer, 'text', e.elem->>'text')
              || app.item_image(e.elem, p_image_bucket)
              -- P38a: shuffled, the options of a choice are in an order of the seed's.
              ORDER BY
                CASE WHEN p_payload->'shuffle' = 'true'::jsonb
                     THEN md5(COALESCE(p_seed, '') || e.ord::text) END,
                e.ord
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(p_payload->'options') = 'array' THEN p_payload->'options'
              ELSE '[]'::jsonb
            END
          ) WITH ORDINALITY AS e(elem, ord)
          WHERE jsonb_typeof(e.elem) = 'object'
      )
    )
    || app.item_image(p_payload, p_image_bucket)
    || CASE p_payload->>'type'
         WHEN 'true_false' THEN
           jsonb_build_object(
             'labels', CASE
               WHEN jsonb_typeof(p_payload->'labels') = 'array'
                 THEN jsonb_build_array(p_payload->'labels'->>0, p_payload->'labels'->>1)
               ELSE NULL::jsonb
             END
           )

         WHEN 'numeric' THEN
           jsonb_build_object(
             'form', CASE
               WHEN p_payload->>'form' IN ('fraction', 'mixed', 'ratio', 'money', 'time', 'measure')
                 THEN p_payload->>'form'
               ELSE 'number'
             END,
             'unit', p_payload->>'unit',
             'units', CASE
               WHEN p_payload->>'form' = 'measure' AND jsonb_typeof(p_payload->'units') = 'array'
                 THEN jsonb_build_array(p_payload->'units'->>0, p_payload->'units'->>1)
               ELSE NULL::jsonb
             END,
             -- Which clock to draw, never which half of the day.
             'clock', CASE
               WHEN p_payload->>'form' = 'time'
                 THEN CASE WHEN p_payload->>'period' IN ('am', 'pm') THEN 12 ELSE 24 END
               ELSE NULL::integer
             END,
             -- How many boxes a ratio has.
             'terms', CASE
               WHEN p_payload->>'form' = 'ratio' AND jsonb_typeof(p_payload->'parts') = 'array'
                 THEN jsonb_array_length(p_payload->'parts')
               ELSE NULL::integer
             END
           )

         WHEN 'word_completion' THEN
           jsonb_build_object(
             'length', CASE
               WHEN jsonb_typeof(p_payload->'answer') = 'string'
                 THEN char_length(p_payload->>'answer')
               ELSE NULL::integer
             END,
             'first_letter', CASE
               WHEN jsonb_typeof(p_payload->'answer') = 'string'
                    AND p_payload->'reveal_first' = 'true'::jsonb
                 THEN left(p_payload->>'answer', 1)
               ELSE NULL::text
             END
           )

         WHEN 'cloze' THEN
           jsonb_build_object(
             'text', p_payload->>'text',
             'mode', CASE
               WHEN p_payload->>'mode' IN ('bank', 'choices') THEN p_payload->>'mode'
               ELSE 'typing'
             END,
             'reuse', COALESCE(p_payload->'reuse' = 'true'::jsonb, false),
             'blanks', (
               SELECT COALESCE(
                 jsonb_agg(
                   jsonb_build_object(
                     'index', CASE WHEN jsonb_typeof(e.elem->'index') = 'number' THEN e.elem->'index' END
                   )
                   || CASE
                        WHEN p_payload->>'mode' = 'choices' THEN
                          jsonb_build_object(
                            'choices', (
                              SELECT COALESCE(
                                jsonb_agg(
                                  c.word
                                  ORDER BY
                                    md5(COALESCE(p_seed, '') || COALESCE(e.elem->>'index', '') || c.word),
                                    c.word
                                ),
                                '[]'::jsonb
                              )
                              FROM jsonb_array_elements_text(
                                CASE WHEN jsonb_typeof(e.elem->'choices') = 'array'
                                     THEN e.elem->'choices' ELSE '[]'::jsonb END
                              ) AS c(word)
                            )
                          )
                        ELSE '{}'::jsonb
                      END
                   ORDER BY e.ord
                 ),
                 '[]'::jsonb
               )
               FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(p_payload->'blanks') = 'array'
                      THEN p_payload->'blanks' ELSE '[]'::jsonb END
               ) WITH ORDINALITY AS e(elem, ord)
               WHERE jsonb_typeof(e.elem) = 'object'
             ),
             -- Each blank's answer once (its first accepted spelling) plus
             -- the extra words. UNION drops a word that is there twice.
             'bank', CASE
               WHEN p_payload->>'mode' = 'bank' THEN (
                 SELECT COALESCE(
                   jsonb_agg(w.word ORDER BY md5(COALESCE(p_seed, '') || w.word), w.word),
                   '[]'::jsonb
                 )
                 FROM (
                   SELECT b.elem->'accepted'->>0 AS word
                   FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(p_payload->'blanks') = 'array'
                          THEN p_payload->'blanks' ELSE '[]'::jsonb END
                   ) AS b(elem)
                   UNION
                   SELECT d.word
                   FROM jsonb_array_elements_text(
                     CASE WHEN jsonb_typeof(p_payload->'distractors') = 'array'
                          THEN p_payload->'distractors' ELSE '[]'::jsonb END
                   ) AS d(word)
                 ) AS w
                 WHERE w.word IS NOT NULL
               )
               ELSE NULL::jsonb
             END
           )

         WHEN 'matching' THEN
           jsonb_build_object(
             'left', app.sanitize_item_list(p_payload->'left', NULL, p_image_bucket),
             -- Never dealt with every answer beside its own item.
             'right', app.item_unsolved(
               app.sanitize_item_list(p_payload->'right', COALESCE(p_seed, ''), p_image_bucket),
               'id',
               ARRAY(
                 SELECT (
                   SELECT min(pr.elem->>'right_id')
                   FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(p_payload->'pairs') = 'array'
                        THEN p_payload->'pairs' ELSE '[]'::jsonb END
                   ) AS pr(elem)
                   WHERE pr.elem->>'left_id' = l.elem->>'id'
                 )
                 FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(p_payload->'left') = 'array'
                        THEN p_payload->'left' ELSE '[]'::jsonb END
                 ) WITH ORDINALITY AS l(elem, ord)
                 ORDER BY l.ord
               )
             )
           )

         WHEN 'ordering' THEN
           jsonb_build_object(
             -- Never dealt already in order.
             'items', app.item_unsolved(
               app.sanitize_item_list(p_payload->'items', COALESCE(p_seed, ''), p_image_bucket),
               'id',
               ARRAY(
                 SELECT o.elem #>> '{}'
                 FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(p_payload->'correct_order') = 'array'
                        THEN p_payload->'correct_order' ELSE '[]'::jsonb END
                 ) WITH ORDINALITY AS o(elem, ord)
                 ORDER BY o.ord
               )
             )
           )

         WHEN 'rearrange' THEN
           jsonb_build_object(
             -- Never dealt already reading as the sentence: by the chips'
             -- words, since two chips can carry the same word.
             'items', app.item_unsolved(
               app.sanitize_item_list(p_payload->'items', COALESCE(p_seed, ''), NULL),
               'text',
               ARRAY(
                 SELECT (
                   SELECT min(c.elem->>'text')
                   FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(p_payload->'items') = 'array'
                        THEN p_payload->'items' ELSE '[]'::jsonb END
                   ) AS c(elem)
                   WHERE c.elem->>'id' = o.elem #>> '{}'
                 )
                 FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(p_payload->'correct_order') = 'array'
                        THEN p_payload->'correct_order' ELSE '[]'::jsonb END
                 ) WITH ORDINALITY AS o(elem, ord)
                 ORDER BY o.ord
               )
             )
           )

         WHEN 'tick_table' THEN
           jsonb_build_object(
             'groups', app.sanitize_item_list(p_payload->'groups', NULL, NULL),
             'items', app.sanitize_item_list(p_payload->'items', NULL, NULL)
           )

         WHEN 'classify' THEN
           jsonb_build_object(
             'groups', app.sanitize_item_list(p_payload->'groups', NULL, NULL),
             'items', app.sanitize_item_list(p_payload->'items', COALESCE(p_seed, ''), p_image_bucket)
           )

         WHEN 'label_picture' THEN
           jsonb_build_object(
             'mode', CASE
               WHEN p_payload->>'mode' IN ('bank', 'typing') THEN p_payload->>'mode'
               ELSE NULL::text
             END,
             -- Where to draw each numbered marker. The label's name stays
             -- behind: in bank mode it is one of the bank's words.
             'markers', (
               SELECT COALESCE(
                 jsonb_agg(
                   jsonb_build_object(
                     'id', e.elem->>'id',
                     'number', e.ord::integer,
                     'x', CASE WHEN jsonb_typeof(e.elem->'x') = 'number' THEN e.elem->'x' END,
                     'y', CASE WHEN jsonb_typeof(e.elem->'y') = 'number' THEN e.elem->'y' END
                   )
                   ORDER BY e.ord
                 ),
                 '[]'::jsonb
               )
               FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(p_payload->'labels') = 'array'
                      THEN p_payload->'labels' ELSE '[]'::jsonb END
               ) WITH ORDINALITY AS e(elem, ord)
               WHERE jsonb_typeof(e.elem) = 'object'
             ),
             -- One word a label, so two parts with the same name give the
             -- bank that name twice, plus the extra words.
             'bank', CASE
               WHEN p_payload->>'mode' = 'bank' THEN (
                 SELECT COALESCE(
                   jsonb_agg(w.word ORDER BY md5(COALESCE(p_seed, '') || w.word), w.word),
                   '[]'::jsonb
                 )
                 FROM (
                   SELECT l.elem->>'text' AS word
                   FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(p_payload->'labels') = 'array'
                          THEN p_payload->'labels' ELSE '[]'::jsonb END
                   ) AS l(elem)
                   WHERE jsonb_typeof(l.elem) = 'object'
                   UNION ALL
                   SELECT d.word
                   FROM jsonb_array_elements_text(
                     CASE WHEN jsonb_typeof(p_payload->'distractors') = 'array'
                          THEN p_payload->'distractors' ELSE '[]'::jsonb END
                   ) AS d(word)
                 ) AS w
                 WHERE w.word IS NOT NULL
               )
               ELSE NULL::jsonb
             END
           )

         ELSE '{}'::jsonb
       END;
$$;

COMMENT ON FUNCTION app.sanitize_item_payload(jsonb, text, text) IS
  'The one item sanitizer (P21-D6, P23b): the content a runner may show, and never a key or a tip. Emits type, question, image_path + image_bucket, options[{number, text, image_path, image_bucket}], plus by type: labels (true_false); form, unit, units, clock, terms (numeric); length, first_letter (word_completion); text, mode, reuse, blanks[{index, choices?}], bank (cloze); left, right (matching); items (ordering, rearrange); groups, items (tick_table, classify); markers[{id, number, x, y}], mode, bank (label_picture). Lists a pupil must not see in the builder''s order are scrambled by md5(seed || id), and the options of an mcq or mrq with shuffle by md5(seed || their place). Internal to the practice content RPCs.';
