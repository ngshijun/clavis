-- ============================================================
-- Clavis revamp — P23b: every practice type can be served and marked.
--
-- P23a taught the validator fourteen practice types; the grader and the
-- sanitizer still knew P21a's. Until now a tick table was stored and then
-- marked wrong whatever the pupil answered, and a runner was told nothing it
-- could draw. This migration is the marking half of the builder.
--
--   D1  app.grade_item_response learns tick_table, pick_words,
--       word_completion, rearrange, classify and label_picture, and the six
--       written forms of `numeric` (money, fraction, mixed, ratio, time,
--       measure). Same signature, still pure, still never raises, still
--       reports parts (`correct` of `total`).
--   D2  mrq and pick_words are marked in parts: one part a correct option,
--       and a wrong pick takes one away (never below nought), so ticking
--       everything earns nothing.
--       There is ONE grader, so this binds assessments too:
--       grade_attempt_answer awards points pro rata over the parts, and an
--       mrq there is no longer all or nothing. That is intended. Stored
--       attempt_answers are not re-marked; the rule applies from the next
--       write of an answer.
--   D3  app.sanitize_item_payload emits what a runner needs to draw each of
--       the fourteen types, by construction, and still never a key.
--   D4  Practice awards part marks. practice_answers.marks is the share of
--       the question's one mark the answer earned (correct / total);
--       is_correct now means full marks.
--
-- Not here, on purpose: submit_practice_session, get_session_result,
-- student_stage_stats and the cycle machinery still count whole questions
-- (is_correct) and still expect a cycle to pick the questions. They are
-- rewritten with the pupil's practice page.
--
-- Nothing here is a compatibility layer: the functions are replaced, and the
-- all-or-nothing rule is gone rather than kept behind a switch.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Two readers the grader shares (D1)
--
-- A numeric answer written in parts — a fraction, a ratio, a time — is a
-- list of non-negative whole numbers on both sides: the key in the payload
-- and what the pupil sent. Both are read by the same function, so the two
-- can never disagree about what counts as a number.
-- ------------------------------------------------------------

-- The validator promises whole numbers but no upper bound (10^400 is a valid
-- part), so a part is never cast to integer: numeric holds it.
CREATE FUNCTION app.item_whole_parts(p_parts jsonb)
RETURNS numeric[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
BEGIN
  IF jsonb_typeof(p_parts) IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;

  -- jsonb keeps a number's digits, so the test is on its text: `2.0`, `-1`
  -- and `"3"` are not whole numbers here.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_parts) AS e(elem)
    WHERE (jsonb_typeof(e.elem) = 'number' AND e.elem #>> '{}' ~ '^[0-9]+$') IS NOT TRUE
  ) THEN
    RETURN NULL;
  END IF;

  RETURN ARRAY(
    SELECT (e.elem #>> '{}')::numeric
    FROM jsonb_array_elements(p_parts) WITH ORDINALITY AS e(elem, ord)
    ORDER BY e.ord
  );
END;
$$;

ALTER FUNCTION app.item_whole_parts(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.item_whole_parts(jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.item_whole_parts(jsonb) IS
  'A JSON array of non-negative whole numbers as numeric[], in order; NULL when it is not an array or any element is anything else. Reads the `parts` of a numeric item and of a response to one. Internal to app.grade_item_response.';

-- A time is compared as minutes after midnight, so a question keyed on one
-- clock is answered rightly on the other: 17:50 is 5:50 p.m.
CREATE FUNCTION app.item_clock_minutes(p_parts jsonb, p_period jsonb)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_parts numeric[] := app.item_whole_parts(p_parts);
BEGIN
  IF v_parts IS NULL OR cardinality(v_parts) <> 2 OR v_parts[2] > 59 THEN
    RETURN NULL;
  END IF;

  -- No period (absent or JSON null): a 24-hour clock.
  IF p_period IS NULL OR jsonb_typeof(p_period) = 'null' THEN
    IF v_parts[1] > 23 THEN
      RETURN NULL;
    END IF;
    RETURN (v_parts[1] * 60 + v_parts[2])::integer;
  END IF;

  -- A 12-hour clock: 12 a.m. is midnight, 12 p.m. is noon.
  IF p_period IN ('"am"'::jsonb, '"pm"'::jsonb) THEN
    IF v_parts[1] NOT BETWEEN 1 AND 12 THEN
      RETURN NULL;
    END IF;
    RETURN (
      (v_parts[1] % 12 + CASE WHEN p_period = '"pm"'::jsonb THEN 12 ELSE 0 END) * 60
      + v_parts[2]
    )::integer;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION app.item_clock_minutes(jsonb, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.item_clock_minutes(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.item_clock_minutes(jsonb, jsonb) IS
  'Minutes after midnight of a time written as parts [hour, minute] with a period: "am" / "pm" on a 12-hour clock (hour 1-12), absent or null on a 24-hour clock (hour 0-23). NULL when it is not a time. Internal to app.grade_item_response.';

-- ------------------------------------------------------------
-- 2. The grader marks all fourteen types (D1, D2)
--
--   total   how many independently gradable parts the item has
--   correct how many of them the response got right
--
--   mcq, true_false, short_answer, word_completion,
--   numeric (every form), rearrange            -> x of 1
--   mrq, pick_words        -> a part a correct option; right picks minus
--                             wrong picks, never below nought
--   cloze                  -> a part a blank (typing, bank and choices alike)
--   matching               -> a part a left item
--   ordering               -> a part a position
--   tick_table, classify   -> a part a row / an item
--   label_picture          -> a part a label
--   long_answer            -> NULL, NULL   (pending manual marking)
--   anything ungradable    -> 0 of 0       (unknown type, malformed payload,
--                                           or an error while grading)
--
-- Where a response names one thing twice — a blank, a left item, a row, a
-- label — that thing scores nothing: no shotgun answers.
--
-- What a caller makes of the parts is its own business: assessments award
-- points pro rata, practice awards the same share of one mark (section 4).
--
-- Pure — it reads only its arguments — and it never raises.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.grade_item_response(
  p_payload jsonb,
  p_selected_options integer[],
  p_text_answer text,
  p_response jsonb,
  OUT correct integer,
  OUT total integer
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_type text;
  v_form text;
  v_correct_options integer[];
  v_ok boolean;
  v_total integer := 0;
  v_correct integer := 0;
  v_target numeric;
  v_tolerance numeric;
  v_given numeric;
  v_text text;
  v_want numeric[];
  v_got numeric[];
BEGIN
  -- Default: ungradable.
  correct := 0;
  total := 0;

  BEGIN
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
      RETURN;
    END IF;

    v_type := p_payload->>'type';

    IF v_type IS NULL THEN
      RETURN;
    END IF;

    -- Manual marking (decision 69): pending, never auto-graded.
    IF v_type = 'long_answer' THEN
      correct := NULL;
      total := NULL;
      RETURN;
    END IF;

    IF v_type IN ('mcq', 'mrq', 'pick_words') THEN
      IF jsonb_typeof(p_payload->'options') IS DISTINCT FROM 'array' THEN
        RETURN;
      END IF;

      -- Option numbers are the 1-based ordinals of the options array.
      v_correct_options := ARRAY(
        SELECT o.ord::integer
        FROM jsonb_array_elements(p_payload->'options') WITH ORDINALITY AS o(elem, ord)
        WHERE jsonb_typeof(o.elem) = 'object'
          AND o.elem->'is_correct' = 'true'::jsonb
        ORDER BY o.ord
      );

      IF v_type = 'mcq' THEN
        v_ok := (
          p_selected_options IS NOT NULL
          AND COALESCE(array_length(v_correct_options, 1), 0) > 0
          AND ARRAY(SELECT DISTINCT unnest(p_selected_options) ORDER BY 1) = v_correct_options
        );
        v_total := 1;
      ELSE
        -- mrq, pick_words: a part a correct option. Every pick that is not a
        -- correct option — a wrong one, a number no option has, a NULL —
        -- takes one right pick away, so ticking everything earns nothing.
        -- A pick named twice counts once.
        v_total := COALESCE(array_length(v_correct_options, 1), 0);

        SELECT GREATEST(
          count(*) FILTER (WHERE s.picked = ANY (v_correct_options))
          - count(*) FILTER (WHERE (s.picked = ANY (v_correct_options)) IS NOT TRUE),
          0
        )::integer
        INTO v_correct
        FROM (SELECT DISTINCT unnest(p_selected_options) AS picked) AS s;
      END IF;

    ELSIF v_type = 'short_answer' THEN
      v_ok := (
        p_text_answer IS NOT NULL
        AND btrim(p_text_answer) <> ''
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p_payload->'accepted_answers') = 'array'
                 THEN p_payload->'accepted_answers' ELSE '[]'::jsonb END
          ) AS a(elem)
          WHERE jsonb_typeof(a.elem) = 'string'
            AND lower(btrim(a.elem #>> '{}')) = lower(btrim(p_text_answer))
        )
      );
      v_total := 1;

    ELSIF v_type = 'word_completion' THEN
      -- The pupil sends the whole word, the revealed first letter included.
      v_ok := (
        jsonb_typeof(p_payload->'answer') = 'string'
        AND btrim(p_text_answer) <> ''
        AND lower(btrim(p_text_answer)) = lower(btrim(p_payload->>'answer'))
      );
      v_total := 1;

    ELSIF v_type = 'true_false' THEN
      v_ok := COALESCE(
        jsonb_typeof(p_payload->'answer') = 'boolean'
        AND jsonb_typeof(p_response->'value') = 'boolean'
        AND p_response->'value' = p_payload->'answer',
        false
      );
      v_total := 1;

    ELSIF v_type = 'numeric' THEN
      v_ok := false;
      v_total := 1;

      -- `form` says how the answer is written; absent = a plain number.
      v_form := CASE WHEN p_payload ? 'form' THEN p_payload->>'form' ELSE 'number' END;

      IF v_form = 'number' THEN
        IF jsonb_typeof(p_payload->'answer') = 'number'
           AND p_text_answer ~ '^\s*[-+]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?\s*$'
        THEN
          v_target := (p_payload->>'answer')::numeric;
          v_tolerance := CASE
            WHEN jsonb_typeof(p_payload->'tolerance') = 'number'
              THEN (p_payload->>'tolerance')::numeric
            ELSE 0
          END;
          IF v_tolerance < 0 THEN
            v_tolerance := 0;
          END IF;
          v_given := btrim(p_text_answer)::numeric;
          v_ok := abs(v_given - v_target) <= v_tolerance;
        END IF;

      ELSIF v_form = 'money' THEN
        -- An amount in ringgit, however a child writes it: 19.2, 19.20,
        -- RM19.20, RM 1 500, 1,500. Spaces go first, then a leading RM; a
        -- comma is read only where it groups thousands.
        IF jsonb_typeof(p_payload->'answer') = 'number' THEN
          v_text := regexp_replace(
            regexp_replace(p_text_answer, '\s', '', 'g'), '^rm', '', 'i'
          );
          IF v_text ~ '^[-+]?(([0-9]+|[0-9]{1,3}(,[0-9]{3})+)(\.[0-9]*)?|\.[0-9]+)$' THEN
            v_ok := replace(v_text, ',', '')::numeric = (p_payload->>'answer')::numeric;
          END IF;
        END IF;

      ELSIF v_form = 'time' THEN
        v_ok := app.item_clock_minutes(p_payload->'parts', p_payload->'period')
              = app.item_clock_minutes(p_response->'parts', p_response->'period');

      ELSIF v_form IN ('fraction', 'mixed', 'ratio', 'measure') THEN
        v_want := app.item_whole_parts(p_payload->'parts');
        v_got := app.item_whole_parts(p_response->'parts');

        -- A part that is not a whole number, or the wrong number of parts,
        -- is a wrong answer.
        IF v_want IS NULL OR v_got IS NULL OR cardinality(v_got) <> cardinality(v_want) THEN
          v_ok := false;

        ELSIF v_form = 'fraction' AND cardinality(v_want) = 2 THEN
          -- [numerator, denominator]. `equivalent` also takes an equal
          -- fraction, by cross-multiplication. A nought denominator is
          -- wrong, and is never divided by.
          v_ok := v_want[2] > 0 AND v_got[2] > 0 AND (
            v_got = v_want
            OR (
              p_payload->'equivalent' = 'true'::jsonb
              AND v_got[1] * v_want[2] = v_want[1] * v_got[2]
            )
          );

        ELSIF v_form = 'mixed' AND cardinality(v_want) = 3 THEN
          -- [whole, numerator, denominator]. `improper` also takes the same
          -- number written as its improper fraction, which arrives with a
          -- nought whole: 2 1/4 as [0, 9, 4].
          v_ok := v_want[3] > 0 AND v_got[3] > 0 AND (
            v_got = v_want
            OR (
              p_payload->'improper' = 'true'::jsonb
              AND v_got[1] = 0
              AND v_got[2] = v_want[1] * v_want[3] + v_want[2]
              AND v_got[3] = v_want[3]
            )
          );

        ELSIF v_form = 'ratio' AND cardinality(v_want) IN (2, 3) THEN
          -- [a, b] or [a, b, c]. `equivalent` also takes an equal ratio: the
          -- same proportion in every pair of terms. Nought in every term is
          -- no ratio at all, on either side.
          v_ok := (
            v_got = v_want
            OR (
              p_payload->'equivalent' = 'true'::jsonb
              AND 0 < ANY (v_want)
              AND 0 < ANY (v_got)
              AND NOT EXISTS (
                SELECT 1
                FROM generate_subscripts(v_want, 1) AS i,
                     generate_subscripts(v_want, 1) AS j
                WHERE i < j
                  AND v_got[i] * v_want[j] <> v_want[i] * v_got[j]
              )
            )
          );

        ELSIF v_form = 'measure' AND cardinality(v_want) = 2 THEN
          -- [large, small], as written: 2 ℓ 150 mℓ is not 1 ℓ 1150 mℓ.
          v_ok := v_got = v_want;
        END IF;
      END IF;

    ELSIF v_type = 'cloze' THEN
      WITH b AS (
        SELECT
          e.elem->>'index' AS idx,
          CASE WHEN jsonb_typeof(e.elem->'accepted') = 'array'
               THEN e.elem->'accepted' ELSE '[]'::jsonb END AS accepted
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_payload->'blanks') = 'array'
               THEN p_payload->'blanks' ELSE '[]'::jsonb END
        ) AS e(elem)
        WHERE jsonb_typeof(e.elem) = 'object'
      ),
      -- One response entry per blank index; a student who sends several
      -- guesses for the same blank scores nothing for it (no shotgun
      -- answers). Mirrors the `sr` guard used by matching below.
      r AS (
        SELECT e.elem->>'index' AS idx, min(e.elem->>'value') AS val
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_response->'blanks') = 'array'
               THEN p_response->'blanks' ELSE '[]'::jsonb END
        ) AS e(elem)
        WHERE jsonb_typeof(e.elem) = 'object'
          AND e.elem->>'index' IS NOT NULL
        GROUP BY 1
        HAVING count(*) = 1
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
          CASE WHEN jsonb_typeof(p_payload->'pairs') = 'array'
               THEN p_payload->'pairs' ELSE '[]'::jsonb END
        ) AS e(elem)
        WHERE jsonb_typeof(e.elem) = 'object'
      ),
      -- One response entry per left item; a student who sends the same
      -- left_id twice scores nothing for it (no shotgun answers).
      sr AS (
        SELECT e.elem->>'left_id' AS l, min(e.elem->>'right_id') AS r
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_response->'pairs') = 'array'
               THEN p_response->'pairs' ELSE '[]'::jsonb END
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

    ELSIF v_type IN ('tick_table', 'classify') THEN
      -- The same question twice over: every row (tick_table) or item
      -- (classify) belongs to one group, and the pupil says which.
      WITH i AS (
        SELECT e.elem->>'id' AS id, e.elem->>'group_id' AS g
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_payload->'items') = 'array'
               THEN p_payload->'items' ELSE '[]'::jsonb END
        ) AS e(elem)
        WHERE jsonb_typeof(e.elem) = 'object'
      ),
      -- One response entry per item; an item placed in two groups scores
      -- nothing (no shotgun answers).
      sr AS (
        SELECT e.elem->>'id' AS id, min(e.elem->>'group_id') AS g
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_response->'items') = 'array'
               THEN p_response->'items' ELSE '[]'::jsonb END
        ) AS e(elem)
        WHERE jsonb_typeof(e.elem) = 'object'
          AND e.elem->>'id' IS NOT NULL
        GROUP BY 1
        HAVING count(*) = 1
      )
      SELECT
        count(*)::integer,
        count(*) FILTER (
          WHERE i.id IS NOT NULL
            AND i.g IS NOT NULL
            AND EXISTS (SELECT 1 FROM sr WHERE sr.id = i.id AND sr.g = i.g)
        )::integer
      INTO v_total, v_correct
      FROM i;

    ELSIF v_type = 'ordering' THEN
      WITH c AS (
        SELECT e.ord AS pos, e.elem #>> '{}' AS id
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_payload->'correct_order') = 'array'
               THEN p_payload->'correct_order' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS e(elem, ord)
      ),
      s AS (
        SELECT e.ord AS pos, e.elem #>> '{}' AS id
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_response->'order') = 'array'
               THEN p_response->'order' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS e(elem, ord)
      )
      SELECT
        count(*)::integer,
        count(*) FILTER (WHERE s.id IS NOT NULL AND c.id IS NOT NULL AND s.id = c.id)::integer
      INTO v_total, v_correct
      FROM c
      LEFT JOIN s ON s.pos = c.pos;

    ELSIF v_type = 'rearrange' THEN
      -- A sentence is right or wrong as a whole. Two chips can carry the
      -- same word ("the ... the"), and either may stand in either place, so
      -- the comparison is of the chips' TEXTS in the pupil's order, not of
      -- their ids. The response must still use every chip exactly once.
      WITH chip AS (
        SELECT e.elem->>'id' AS id, e.elem->>'text' AS text
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_payload->'items') = 'array'
               THEN p_payload->'items' ELSE '[]'::jsonb END
        ) AS e(elem)
        WHERE jsonb_typeof(e.elem) = 'object'
      ),
      want AS (
        SELECT e.ord AS pos, (SELECT min(c.text) FROM chip c WHERE c.id = e.elem #>> '{}') AS text
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_payload->'correct_order') = 'array'
               THEN p_payload->'correct_order' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS e(elem, ord)
      ),
      got AS (
        SELECT
          e.ord AS pos,
          e.elem #>> '{}' AS id,
          (SELECT min(c.text) FROM chip c WHERE c.id = e.elem #>> '{}') AS text
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_response->'order') = 'array'
               THEN p_response->'order' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS e(elem, ord)
      )
      SELECT
        (SELECT count(*) FROM want) > 0
        AND (SELECT count(*) FROM got) = (SELECT count(*) FROM want)
        AND (SELECT count(DISTINCT g.id) FROM got g) = (SELECT count(*) FROM got)
        AND NOT EXISTS (
          SELECT 1
          FROM want w
          JOIN got g ON g.pos = w.pos
          WHERE (g.text = w.text) IS NOT TRUE
        )
      INTO v_ok;
      v_total := 1;

    ELSIF v_type = 'label_picture' THEN
      WITH l AS (
        SELECT e.elem->>'id' AS id, e.elem->>'text' AS text
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_payload->'labels') = 'array'
               THEN p_payload->'labels' ELSE '[]'::jsonb END
        ) AS e(elem)
        WHERE jsonb_typeof(e.elem) = 'object'
      ),
      -- One response entry per label; two names for one marker score
      -- nothing for it (no shotgun answers).
      sr AS (
        SELECT e.elem->>'id' AS id, min(e.elem->>'value') AS val
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_response->'labels') = 'array'
               THEN p_response->'labels' ELSE '[]'::jsonb END
        ) AS e(elem)
        WHERE jsonb_typeof(e.elem) = 'object'
          AND e.elem->>'id' IS NOT NULL
        GROUP BY 1
        HAVING count(*) = 1
      )
      SELECT
        count(*)::integer,
        count(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM sr
            WHERE sr.id = l.id
              AND btrim(COALESCE(sr.val, '')) <> ''
              AND lower(btrim(sr.val)) = lower(btrim(l.text))
          )
        )::integer
      INTO v_total, v_correct
      FROM l;

    ELSE
      -- Unknown type: ungradable.
      RETURN;
    END IF;

    IF v_type IN ('mcq', 'short_answer', 'word_completion', 'true_false', 'numeric', 'rearrange') THEN
      v_correct := CASE WHEN COALESCE(v_ok, false) THEN 1 ELSE 0 END;
    END IF;

    v_total := COALESCE(v_total, 0);
    v_correct := LEAST(GREATEST(COALESCE(v_correct, 0), 0), v_total);

    correct := v_correct;
    total := v_total;

  EXCEPTION WHEN OTHERS THEN
    -- A malformed payload or response must never brick a submission.
    correct := 0;
    total := 0;
  END;
END;
$$;

COMMENT ON FUNCTION app.grade_item_response(jsonb, integer[], text, jsonb) IS
  'The one item grader (P21-D4, P23b). Returns how many gradable parts the item has (total) and how many the response got right (correct): x of 1 for mcq/true_false/short_answer/word_completion/numeric/rearrange; a part a correct option for mrq/pick_words (right picks minus wrong picks, never below 0); per blank/pair/position/row/item/label for cloze/matching/ordering/tick_table/classify/label_picture; NULL/NULL for long_answer (pending manual marking); 0 of 0 when ungradable. Both products mark through it, so an mrq is part-marked in assessments as in practice. Pure and never raises. Internal to the grading triggers.';

-- ------------------------------------------------------------
-- 3. The sanitizer draws all fourteen types (D3)
--
-- Still emits by construction, never by subtraction: a key the runner must
-- not see (is_correct, answer, accepted, accepted_answers, group_id, pairs,
-- correct_order, a label's text beside its marker, parts, period,
-- equivalent, improper, tolerance, tip, explanation, rubric) is not in the
-- output because nothing here copies it.
--
-- Two things do leave the key on purpose, because the question cannot be
-- drawn without them: a word bank (cloze, label_picture) holds the answers
-- among its words, shuffled and tied to no blank or marker; and
-- word_completion tells how many letters the word has.
-- ------------------------------------------------------------

-- 3.1 A picture travels as its object path plus the bucket to resolve it
--     in. Question, option and item all say it the same way.
CREATE FUNCTION app.item_image(p_item jsonb, p_image_bucket text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_item->'image_path') = 'string'
         AND btrim(p_item->>'image_path') <> ''
      THEN jsonb_build_object(
        'image_path', p_item->>'image_path',
        'image_bucket', p_image_bucket
      )
    ELSE jsonb_build_object('image_path', NULL::text, 'image_bucket', NULL::text)
  END;
$$;

ALTER FUNCTION app.item_image(jsonb, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.item_image(jsonb, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.item_image(jsonb, text) IS
  'The picture of a question, an option or an item as {image_path, image_bucket}: both set when it has one, both null when it has none. Internal to the item sanitizer.';

-- 3.2 A list of things a pupil reads, picks up or sorts into: the items of
--     a matching column, an ordering, a classification; the chips of a
--     sentence; the rows and columns of a tick table.
--
--     p_shuffle_seed NULL = in the builder's order, otherwise scrambled by
--     md5(seed || id). p_image_bucket NULL = the list carries no pictures
--     (and so no picture keys).
CREATE FUNCTION app.sanitize_item_list(
  p_list jsonb,
  p_shuffle_seed text,
  p_image_bucket text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', e.elem->>'id', 'text', e.elem->>'text')
      || CASE
           WHEN p_image_bucket IS NULL THEN '{}'::jsonb
           ELSE app.item_image(e.elem, p_image_bucket)
         END
      ORDER BY
        CASE
          WHEN p_shuffle_seed IS NULL THEN NULL::text
          ELSE md5(p_shuffle_seed || COALESCE(e.elem->>'id', ''))
        END,
        e.ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_list) = 'array' THEN p_list ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(elem, ord)
  WHERE jsonb_typeof(e.elem) = 'object';
$$;

ALTER FUNCTION app.sanitize_item_list(jsonb, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.sanitize_item_list(jsonb, text, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.sanitize_item_list(jsonb, text, text) IS
  'A payload list as [{id, text}] (plus image_path + image_bucket when a bucket is given), in its own order or scrambled by md5(seed || id). Never group_id or any other key of the element. Internal to the item sanitizer.';

-- 3.3 The sanitizer.
--
-- Every type: type, question, image_path + image_bucket, options (empty
-- when the type has none). Then, by type:
--
--   mcq, mrq, pick_words  nothing more; options are in the builder's order,
--                         which for pick_words is the sentence
--   true_false            labels — the two words, or null for the runner's own
--   numeric               form, unit, units (measure), clock 12 | 24 (time),
--                         terms 2 | 3 (ratio); null where the form has none
--   word_completion       length, first_letter (null unless reveal_first)
--   cloze                 text, mode, reuse, blanks [{index}] — each with its
--                         choices, shuffled, in `choices` mode — and bank
--                         (the `bank` mode's words, shuffled; null otherwise)
--   matching              left (in order), right (shuffled), with pictures
--   ordering              items (shuffled), with pictures
--   rearrange             items (shuffled)
--   tick_table            groups, items (both in order)
--   classify              groups (in order), items (shuffled), with pictures
--   label_picture         markers [{id, number, x, y}], mode, bank
--
-- A list is shuffled even when the caller gives no seed, so a careless
-- caller can never serve an ordering in the order it was written in.
CREATE OR REPLACE FUNCTION app.sanitize_item_payload(
  p_payload jsonb,
  p_seed text,
  p_image_bucket text
)
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
              ORDER BY e.ord
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
             'right', app.sanitize_item_list(p_payload->'right', COALESCE(p_seed, ''), p_image_bucket)
           )

         WHEN 'ordering' THEN
           jsonb_build_object(
             'items', app.sanitize_item_list(p_payload->'items', COALESCE(p_seed, ''), p_image_bucket)
           )

         WHEN 'rearrange' THEN
           jsonb_build_object(
             'items', app.sanitize_item_list(p_payload->'items', COALESCE(p_seed, ''), NULL)
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
  'The one item sanitizer (P21-D6, P23b): the content a runner may show, and never a key or a tip. Emits type, question, image_path + image_bucket, options[{number, text, image_path, image_bucket}], plus by type: labels (true_false); form, unit, units, clock, terms (numeric); length, first_letter (word_completion); text, mode, reuse, blanks[{index, choices?}], bank (cloze); left, right (matching); items (ordering, rearrange); groups, items (tick_table, classify); markers[{id, number, x, y}], mode, bank (label_picture). Lists a pupil must not see in the builder''s order are scrambled by md5(seed || id). Internal to the attempt and practice content RPCs.';

-- ------------------------------------------------------------
-- 4. Practice awards part marks (D4)
--
-- Every question is worth one mark, shared among its parts. `marks` is the
-- share the answer earned; `is_correct` stays as the plain question "did it
-- get full marks", which is what everything written before this migration
-- reads.
--
-- Rows already stored were marked all or nothing, so their marks are 1 or 0
-- by their is_correct. They are not re-marked: a question may have been
-- edited since it was answered. The backfill names only `marks`, which the
-- grading trigger does not watch until it is re-created below.
--
-- No SELECT grant for `authenticated`, deliberately: `marks` says at least
-- as much as is_correct, which has had no column grant since P5a (decision
-- 41, the grading oracle). Both are served by the results RPC.
-- ------------------------------------------------------------
ALTER TABLE public.practice_answers
  ADD COLUMN marks numeric(5, 4) NOT NULL DEFAULT 0
    CONSTRAINT practice_answers_marks_check CHECK (marks >= 0 AND marks <= 1);

UPDATE public.practice_answers
SET marks = 1
WHERE is_correct;

COMMENT ON COLUMN public.practice_answers.marks IS
  'Server-owned share of the question''s one mark, set by grade_practice_answer(): parts right / parts in the question, to four decimals. 1 = full marks, 0 = nothing right or ungradable. Not readable by authenticated (no column grant), like is_correct.';

COMMENT ON COLUMN public.practice_answers.is_correct IS
  'Server-owned: true when the answer earned full marks (marks = 1). Set by grade_practice_answer(). Not readable by authenticated (no column grant) — correctness is served by get_session_result() after completion only.';

COMMENT ON COLUMN public.practice_answers.selected_options IS
  'Selected option numbers for mcq/mrq/pick_words: 1-based positions in the question''s payload.options. One element for mcq, one or more for mrq and pick_words.';

COMMENT ON COLUMN public.practice_answers.response IS
  'Structured answer for the types that need one: {"value": bool} (true_false), {"blanks": [{"index", "value"}]} (cloze), {"pairs": [{"left_id", "right_id"}]} (matching), {"order": [id]} (ordering, rearrange), {"items": [{"id", "group_id"}]} (tick_table, classify), {"labels": [{"id", "value"}]} (label_picture), {"parts": [n], "period"?: "am" | "pm" | null} (numeric fraction/mixed/ratio/measure/time). NULL for mcq/mrq/pick_words (selected_options) and short_answer/word_completion/numeric number and money (text_answer).';

CREATE OR REPLACE FUNCTION public.grade_practice_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payload jsonb;
  v_correct integer;
  v_total integer;
BEGIN
  -- Default deny: whatever the caller sent in the grade columns is discarded.
  NEW.is_correct := FALSE;
  NEW.marks := 0;

  SELECT q.payload INTO v_payload
  FROM questions q
  WHERE q.id = NEW.question_id;

  -- A question that no longer exists (question_id is ON DELETE SET NULL)
  -- cannot earn anything.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT g.correct, g.total
  INTO v_correct, v_total
  FROM app.grade_item_response(
    v_payload, NEW.selected_options, NEW.text_answer, NEW.response
  ) AS g;

  -- One mark a question, shared among its parts. An ungradable answer
  -- (0 of 0) keeps the default.
  IF v_total > 0 THEN
    NEW.marks := round(v_correct::numeric / v_total, 4);
    NEW.is_correct := (v_correct = v_total);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.grade_practice_answer() IS
  'BEFORE INSERT/UPDATE grader for practice_answers: from app.grade_item_response over the question''s payload, marks = parts right / parts in the question (one mark a question) and is_correct = full marks. Never raises.';

-- `marks` joins the columns the trigger watches, so no write — by whatever
-- role — can set it without the answer being marked again.
DROP TRIGGER trg_grade_practice_answer ON public.practice_answers;

CREATE TRIGGER trg_grade_practice_answer
  BEFORE INSERT OR UPDATE OF selected_options, text_answer, response, question_id, is_correct, marks
  ON public.practice_answers
  FOR EACH ROW EXECUTE FUNCTION public.grade_practice_answer();

-- ------------------------------------------------------------
-- 5. What the assessment trigger documents (D2)
--
-- Its body does not move: it already awards points pro rata over whatever
-- parts the grader reports. Only the list of which types have parts did.
-- ------------------------------------------------------------
COMMENT ON FUNCTION public.grade_attempt_answer() IS
  'BEFORE INSERT/UPDATE grader for attempt_answers: is_correct + awarded_points from app.grade_item_response over the snapshot payload — points pro rata over the item''s parts (a correct option for mrq/pick_words; a blank, pair, position, row, item or label for cloze/matching/ordering/tick_table/classify/label_picture), whole or nothing for the one-part types. long_answer stays NULL/NULL = pending manual marking. Never raises.';
