-- ============================================================
-- Clavis revamp — P28a: the marker says which parts were right.
--
-- A pupil who is told "2 of 3 right" cannot tell which two. The marked
-- practice now names the parts of each answer that were right, so the
-- result page can put a tick or a cross on every blank, line and row.
-- It names parts of the pupil's own answer and nothing else: the right
-- answer to a part got wrong is still never handed back.
--
--   D1  app.grade_item_response hands back a third value, right_parts:
--       the keys of the parts the response got right. A key is what the
--       response itself names the part by: the option's number (mrq,
--       pick_words), the blank's index (cloze), the item's left_id
--       (matching), the row's or item's id (tick_table, classify,
--       ordering) or the label's id (label_picture). A question of one
--       part has no key: it is right when correct = total.
--   D2  app.mark_stage_answers passes it on as `right` in each question.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The grader (D1)
--
-- Its latest definition (P25a) with right_parts gathered beside each
-- count. What is counted, and how, is unchanged.
-- ------------------------------------------------------------

DROP FUNCTION app.grade_item_response(jsonb, integer[], text, jsonb);

CREATE FUNCTION app.grade_item_response(
  p_payload jsonb,
  p_selected_options integer[],
  p_text_answer text,
  p_response jsonb,
  OUT correct integer,
  OUT total integer,
  OUT right_parts text[]
)
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
  v_right text[] := '{}';
BEGIN
  -- Default: ungradable.
  correct := 0;
  total := 0;
  right_parts := '{}';

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
        -- A pick named twice counts once. Every right pick is named as
        -- right, whatever the wrong ones took away.
        v_total := COALESCE(array_length(v_correct_options, 1), 0);

        SELECT
          GREATEST(
            count(*) FILTER (WHERE s.picked = ANY (v_correct_options))
            - count(*) FILTER (WHERE (s.picked = ANY (v_correct_options)) IS NOT TRUE),
            0
          )::integer,
          COALESCE(
            array_agg(s.picked::text ORDER BY s.picked)
              FILTER (WHERE s.picked = ANY (v_correct_options)),
            '{}'
          )
        INTO v_correct, v_right
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
      SELECT
        count(*)::integer,
        count(*) FILTER (WHERE m.ok)::integer,
        COALESCE(array_agg(b.idx) FILTER (WHERE m.ok), '{}')
      INTO v_total, v_correct, v_right
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
        count(*) FILTER (WHERE m.ok)::integer,
        COALESCE(array_agg(p.l) FILTER (WHERE m.ok), '{}')
      INTO v_total, v_correct, v_right
      FROM p
      CROSS JOIN LATERAL (
        SELECT p.l IS NOT NULL
          AND p.r IS NOT NULL
          AND EXISTS (SELECT 1 FROM sr WHERE sr.l = p.l AND sr.r = p.r) AS ok
      ) AS m;

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
        count(*) FILTER (WHERE m.ok)::integer,
        COALESCE(array_agg(i.id) FILTER (WHERE m.ok), '{}')
      INTO v_total, v_correct, v_right
      FROM i
      CROSS JOIN LATERAL (
        SELECT i.id IS NOT NULL
          AND i.g IS NOT NULL
          AND EXISTS (SELECT 1 FROM sr WHERE sr.id = i.id AND sr.g = i.g) AS ok
      ) AS m;

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
      -- An item is right where it stands in the place that is its own.
      SELECT
        count(*)::integer,
        count(*) FILTER (WHERE s.id = c.id)::integer,
        COALESCE(array_agg(c.id) FILTER (WHERE s.id = c.id), '{}')
      INTO v_total, v_correct, v_right
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
        count(*) FILTER (WHERE m.ok)::integer,
        COALESCE(array_agg(l.id) FILTER (WHERE m.ok), '{}')
      INTO v_total, v_correct, v_right
      FROM l
      CROSS JOIN LATERAL (
        SELECT EXISTS (
          SELECT 1
          FROM sr
          WHERE sr.id = l.id
            AND CASE
                  -- As for a blank: a word picked from the bank is compared exactly.
                  WHEN p_payload->>'mode' = 'bank' THEN sr.val = l.text
                  ELSE app.item_typed(sr.val) <> ''
                    AND app.item_typed(sr.val) = app.item_typed(l.text)
                END
        ) AS ok
      ) AS m;

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
    right_parts := v_right;

  EXCEPTION WHEN OTHERS THEN
    -- A malformed payload or response must never brick a submission.
    correct := 0;
    total := 0;
    right_parts := '{}';
  END;
END;
$function$;

ALTER FUNCTION app.grade_item_response(jsonb, integer[], text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.grade_item_response(jsonb, integer[], text, jsonb)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.grade_item_response(jsonb, integer[], text, jsonb) IS
  'The one item grader (P21-D4, P23b, P28a). Returns how many gradable parts '
  'the item has (total), how many the response got right (correct) and which '
  '(right_parts): x of 1 for mcq/true_false/short_answer/word_completion/'
  'numeric/rearrange, which name no part; a part a correct option for '
  'mrq/pick_words (right picks minus wrong picks, never below 0; every right '
  'pick is named); per blank/pair/position/row/item/label for cloze/matching/'
  'ordering/tick_table/classify/label_picture; 0 of 0 when ungradable. A '
  'part is named by what the response names it by: option number, blank '
  'index, left_id, or id. Pure and never raises. Internal to practice marking.';


-- ------------------------------------------------------------
-- 2. The marked stage (D2)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.mark_stage_answers(p_stage_id uuid, p_answers jsonb)
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
      g.right_parts,
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
          'right', to_jsonb(m.right_parts),
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

COMMENT ON FUNCTION app.mark_stage_answers(uuid, jsonb) IS
  'A finished stage marked without being recorded (P23c, P28a). p_answers = '
  '[{question_id, selected_options, text_answer, response}], any key absent '
  'or null. Returns {marks, total, questions: [{question_id, correct, total, '
  'right, marks, tips}]}: EVERY question of the stage in the builder''s '
  'order, the unanswered ones with 0; correct of total and right (the parts '
  'of the answer that were right, as app.grade_item_response names them) '
  'from the grader, marks = round(correct / total, 4) (0 when ungradable), '
  'tips = app.item_tips for an answer short of the whole mark, [] otherwise. '
  'No payload and no answer key is returned: a pupil is told which parts of '
  'their own answer were right, never the right answer to one got wrong. The '
  'answers are read by app.stage_answers. Raises when the stage does not '
  'exist. Writes nothing. Internal to the marking RPCs.';

COMMENT ON FUNCTION public.mark_stage_preview(uuid, jsonb) IS
  'Admin-only marking of a finished preview: app.mark_stage_answers over '
  'p_answers = [{question_id, selected_options, text_answer, response}]. '
  'Returns {marks, total, questions: [{question_id, correct, total, right, '
  'marks, tips}]} — every question of the stage in the builder''s order, '
  'unanswered ones with 0, each with the parts of its answer that were right '
  'and the tips it earned, never the right answer. Records nothing: no '
  'session, no answer, no progress.';

COMMENT ON FUNCTION public.submit_practice_session(uuid, uuid, jsonb) IS
  'Records one finished practice session of the caller on a stage, in a '
  'classroom, and hands back how it was marked. p_answers = [{question_id, '
  'selected_options, text_answer, response}], read as app.stage_answers reads '
  'them: every question of the stage counts and one left out earns nothing. '
  'Returns app.mark_stage_answers'' {marks, total, questions: [{question_id, '
  'correct, total, right, marks, tips}]}, never a right answer. Refused '
  'unless the caller is a student of that classroom, it is live, the stage '
  'is of its subject and has a question.';
