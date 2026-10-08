-- ============================================================
-- Clavis revamp — P25a: practice marking, put right.
--
-- What an independent check of the practice builder found in the marking,
-- each fixed where it lives.
--
--   D1  A stored answer keeps its mark when its question is deleted.
--       practice_answers.question_id is ON DELETE SET NULL, which is an
--       UPDATE the marking trigger watches: it used to mark the answer again
--       against a question that was gone, and store it as wrong.
--   D2  A word a pupil PICKED (from a word bank or from a blank's choices) is
--       compared exactly, and only with the blank's own answer: "their" is
--       not "Their". A word a pupil TYPED is still compared without regard to
--       capitals.
--   D3  A typed answer is compared by app.item_typed: capitals, the width of
--       a character and the spaces around and between words do not count. A
--       Chinese keyboard's full-width space after an answer used to make it
--       wrong.
--   D4  A plain number is read as an amount of money already was: spaces and
--       width do not count and a comma may group thousands, so 12 345 and
--       12,345 are 12345. A space beside a number no longer makes the answer
--       ungradable.
--   D5  A time asked for with a.m. or p.m. is not answered by an hour from 1
--       to 12 alone: 7:30 is not 7:30 a.m. The 24-hour clock still is an
--       answer (17:50 for 5:50 p.m.).
--   D6  An item named twice in an Ordering answer holds no place.
--   D7  A list is never dealt already solved: an Ordering in order, a
--       sentence reading as the sentence, a Matching with every answer beside
--       its own item. The shuffle is turned one step when it lands there.
--   D8  Giving a question or a passage a new place is not an edit: it no
--       longer moves `updated_at`.
--   D9  A passage's title and text must hold something other than white
--       space of any kind.
--
-- Nothing stored is marked again: marks already given stand.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Helpers
-- ------------------------------------------------------------

CREATE FUNCTION app.item_typed(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(btrim(regexp_replace(normalize(p_text, NFKC), '\s+', ' ', 'g')));
$$;

ALTER FUNCTION app.item_typed(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.item_typed(text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.item_typed(text) IS
  'What a typed answer is compared by: compatibility forms folded together '
  '(full-width letters, digits and spaces become plain ones), runs of white '
  'space made one space, the ends trimmed, capitals lowered. NULL for NULL.';


CREATE FUNCTION app.item_unsolved(p_list jsonb, p_key text, p_solved text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- The list as dealt, unless reading `p_key` down it gives `p_solved` from
  -- the top: then its first entry goes to the end, which is another order
  -- and still the same for the same seed.
  SELECT CASE
    WHEN jsonb_array_length(p_list) > 1
     AND cardinality(p_solved) > 0
     AND cardinality(p_solved) <= jsonb_array_length(p_list)
     AND NOT EXISTS (
       SELECT 1
       FROM unnest(p_solved) WITH ORDINALITY AS s(want, pos)
       WHERE (p_list->(s.pos::integer - 1)->>p_key = s.want) IS NOT TRUE
     )
    THEN (p_list - 0) || jsonb_build_array(p_list->0)
    ELSE p_list
  END;
$$;

ALTER FUNCTION app.item_unsolved(jsonb, text, text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.item_unsolved(jsonb, text, text[]) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.item_unsolved(jsonb, text, text[]) IS
  'A shuffled list that must not be dealt in its answer''s order: when the '
  'entries'' `p_key` values, read from the top, are `p_solved`, the first '
  'entry is moved to the end. `p_list` must be a JSON array.';


-- ------------------------------------------------------------
-- 2. The grader (D2 to D6)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.grade_item_response(p_payload jsonb, p_selected_options integer[], p_text_answer text, p_response jsonb, OUT correct integer, OUT total integer)
 RETURNS record
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
        app.item_typed(p_text_answer) <> ''
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p_payload->'accepted_answers') = 'array'
                 THEN p_payload->'accepted_answers' ELSE '[]'::jsonb END
          ) AS a(elem)
          WHERE jsonb_typeof(a.elem) = 'string'
            AND app.item_typed(a.elem #>> '{}') = app.item_typed(p_text_answer)
        )
      );
      v_total := 1;

    ELSIF v_type = 'word_completion' THEN
      -- The pupil sends the whole word, the revealed first letter included.
      v_ok := (
        jsonb_typeof(p_payload->'answer') = 'string'
        AND app.item_typed(p_text_answer) <> ''
        AND app.item_typed(p_text_answer) = app.item_typed(p_payload->>'answer')
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
        -- However a child writes it: 12345, 12 345, 12,345, full-width digits.
        -- Spaces go first; a comma is read only where it groups thousands.
        v_text := regexp_replace(normalize(p_text_answer, NFKC), '\s', '', 'g');
        IF jsonb_typeof(p_payload->'answer') = 'number'
           AND v_text ~ '^[-+]?(([0-9]+|[0-9]{1,3}(,[0-9]{3})+)(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?$'
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
          v_given := replace(v_text, ',', '')::numeric;
          v_ok := abs(v_given - v_target) <= v_tolerance;
        END IF;

      ELSIF v_form = 'money' THEN
        -- An amount in ringgit, however a child writes it: 19.2, 19.20,
        -- RM19.20, RM 1 500, 1,500. Spaces go first, then a leading RM; a
        -- comma is read only where it groups thousands.
        IF jsonb_typeof(p_payload->'answer') = 'number' THEN
          v_text := regexp_replace(
            regexp_replace(normalize(p_text_answer, NFKC), '\s', '', 'g'), '^rm', '', 'i'
          );
          IF v_text ~ '^[-+]?(([0-9]+|[0-9]{1,3}(,[0-9]{3})+)(\.[0-9]*)?|\.[0-9]+)$' THEN
            v_ok := replace(v_text, ',', '')::numeric = (p_payload->>'answer')::numeric;
          END IF;
        END IF;

      ELSIF v_form = 'time' THEN
        -- Both sides become minutes after midnight, so a time asked for with
        -- a.m. or p.m. may be answered on the 24-hour clock: 17:50 is 5:50
        -- p.m. But an hour from 1 to 12 with no a.m. or p.m. says only half
        -- of that, and is wrong: 7:30 alone is not 7:30 a.m.
        v_ok := app.item_clock_minutes(p_payload->'parts', p_payload->'period')
              = app.item_clock_minutes(p_response->'parts', p_response->'period')
            AND NOT (
              jsonb_typeof(p_payload->'period') = 'string'
              AND jsonb_typeof(p_response->'period') IS DISTINCT FROM 'string'
              AND (app.item_whole_parts(p_response->'parts'))[1] BETWEEN 1 AND 12
            );

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
          FROM jsonb_array_elements(b.accepted) WITH ORDINALITY AS a(elem, ord)
          JOIN r ON r.idx = b.idx
          WHERE jsonb_typeof(a.elem) = 'string'
            AND CASE
                  -- A word picked from a bank or from choices is that word or
                  -- it is not: "their" is not "Their". The blank's answer is
                  -- its first accepted one, the one the bank was built from.
                  WHEN p_payload->>'mode' IN ('bank', 'choices')
                    THEN a.ord = 1 AND r.val = a.elem #>> '{}'
                  ELSE app.item_typed(r.val) <> ''
                    AND app.item_typed(a.elem #>> '{}') = app.item_typed(r.val)
                END
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
      -- An item named twice in the response holds no place at all (no
      -- shotgun answers), as a blank or a pair named twice scores nothing.
      s AS (
        SELECT x.pos, x.id
        FROM (
          SELECT
            e.ord AS pos,
            e.elem #>> '{}' AS id,
            count(*) OVER (PARTITION BY e.elem #>> '{}') AS times
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p_response->'order') = 'array'
                 THEN p_response->'order' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS e(elem, ord)
        ) AS x
        WHERE x.times = 1
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
              AND CASE
                    -- As for a blank: a word picked from the bank is compared exactly.
                    WHEN p_payload->>'mode' = 'bank' THEN sr.val = l.text
                    ELSE app.item_typed(sr.val) <> ''
                      AND app.item_typed(sr.val) = app.item_typed(l.text)
                  END
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
$function$;


-- ------------------------------------------------------------
-- 3. The sanitizer (D7)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.sanitize_item_payload(p_payload jsonb, p_seed text, p_image_bucket text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
$function$;


-- ------------------------------------------------------------
-- 4. A deleted question leaves its answers as they were marked (D1)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grade_practice_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
  v_correct integer;
  v_total integer;
BEGIN
  -- A question deleted after it was answered: question_id is ON DELETE SET
  -- NULL, and that is all that changed. The answer was marked when it was
  -- given and keeps that mark, whatever the caller sent in the mark columns.
  IF TG_OP = 'UPDATE'
     AND NEW.question_id IS NULL
     AND OLD.question_id IS NOT NULL
     AND NEW.selected_options IS NOT DISTINCT FROM OLD.selected_options
     AND NEW.text_answer IS NOT DISTINCT FROM OLD.text_answer
     AND NEW.response IS NOT DISTINCT FROM OLD.response
  THEN
    NEW.is_correct := OLD.is_correct;
    NEW.marks := OLD.marks;
    RETURN NEW;
  END IF;

  -- Default deny: whatever the caller sent in the mark columns is discarded.
  NEW.is_correct := FALSE;
  NEW.marks := 0;

  SELECT q.payload INTO v_payload
  FROM public.questions q
  WHERE q.id = NEW.question_id;

  -- An answer to no question cannot earn anything.
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


-- ------------------------------------------------------------
-- 5. A new place is not an edit (D8)
-- ------------------------------------------------------------

DROP TRIGGER questions_updated_at_trigger ON public.questions;
CREATE TRIGGER questions_updated_at_trigger
  BEFORE UPDATE ON public.questions
  FOR EACH ROW
  WHEN ((to_jsonb(OLD) - 'display_order') IS DISTINCT FROM (to_jsonb(NEW) - 'display_order'))
  EXECUTE FUNCTION public.update_questions_updated_at();

DROP TRIGGER update_passages_updated_at ON public.passages;
CREATE TRIGGER update_passages_updated_at
  BEFORE UPDATE ON public.passages
  FOR EACH ROW
  WHEN ((to_jsonb(OLD) - 'display_order') IS DISTINCT FROM (to_jsonb(NEW) - 'display_order'))
  EXECUTE FUNCTION public.update_updated_at_column();


-- ------------------------------------------------------------
-- 6. A passage holds something to read (D9)
-- ------------------------------------------------------------

ALTER TABLE public.passages
  DROP CONSTRAINT passages_title_check,
  DROP CONSTRAINT passages_content_check,
  ADD CONSTRAINT passages_title_check CHECK (title ~ '\S'),
  ADD CONSTRAINT passages_content_check CHECK (body ~ '\S' OR image_path IS NOT NULL);
