-- P9a verifier fixup (orchestrator, 2026-08-13): CLOZE SHOTGUN EXPLOIT.
--
-- The cloze grader kept EVERY entry of the student's response->'blanks' and
-- awarded a blank if ANY entry for that index matched an accepted value. A
-- student could therefore submit many guesses per blank in one response and
-- score full marks with no knowledge: LIVE-proven with 96 guesses over a
-- 3-blank question scoring 3.00/3 and is_correct = true.
--
-- Fix: one response entry per blank index, exactly as `matching` already
-- guards with its `sr` CTE (GROUP BY ... HAVING count(*) = 1). A student who
-- sends two or more values for the same blank scores nothing for that blank.
-- Only the cloze `r` CTE changes; the rest of the grader is byte-identical to
-- 20260813125015.

CREATE OR REPLACE FUNCTION public.grade_attempt_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_question_id uuid;
  v_payload jsonb;
  v_points numeric;
  v_type text;
  v_answer text;
  v_correct_options integer[];
  v_opt_1 boolean;
  v_opt_2 boolean;
  v_opt_3 boolean;
  v_opt_4 boolean;
  v_ok boolean;
  v_total integer := 0;
  v_correct integer := 0;
  v_target numeric;
  v_tolerance numeric;
  v_given numeric;
BEGIN
  -- Default deny: whatever the client sent in the grade columns is discarded.
  NEW.is_correct := FALSE;
  NEW.awarded_points := 0;

  SELECT aq.question_id, aq.payload, aq.points
  INTO v_question_id, v_payload, v_points
  FROM assessment_questions aq
  WHERE aq.id = NEW.assessment_question_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF v_question_id IS NOT NULL THEN
      -- ---- bank question: mcq | mrq | short_answer, always binary -----
      SELECT
        q.type::text,
        q.answer,
        q.option_1_is_correct,
        q.option_2_is_correct,
        q.option_3_is_correct,
        q.option_4_is_correct
      INTO v_type, v_answer, v_opt_1, v_opt_2, v_opt_3, v_opt_4
      FROM questions q
      WHERE q.id = v_question_id;

      IF NOT FOUND THEN
        RETURN NEW;
      END IF;

      v_correct_options := ARRAY(
        SELECT opt_num FROM (
          VALUES (1, v_opt_1), (2, v_opt_2), (3, v_opt_3), (4, v_opt_4)
        ) AS o(opt_num, is_correct)
        WHERE o.is_correct IS TRUE
        ORDER BY opt_num
      );

      IF v_type = 'short_answer' THEN
        v_ok := (
          v_answer IS NOT NULL
          AND btrim(v_answer) <> ''
          AND NEW.text_answer IS NOT NULL
          AND lower(btrim(NEW.text_answer)) = lower(btrim(v_answer))
        );
      ELSIF v_type IN ('mcq', 'mrq') THEN
        v_ok := (
          NEW.selected_options IS NOT NULL
          AND COALESCE(array_length(v_correct_options, 1), 0) > 0
          AND ARRAY(SELECT DISTINCT unnest(NEW.selected_options) ORDER BY 1) = v_correct_options
        );
      ELSE
        RETURN NEW;
      END IF;

      v_total := 1;
      v_correct := CASE WHEN COALESCE(v_ok, false) THEN 1 ELSE 0 END;

    ELSE
      -- ---- ad-hoc payload --------------------------------------------
      IF jsonb_typeof(v_payload) IS DISTINCT FROM 'object' THEN
        RETURN NEW;
      END IF;

      v_type := v_payload->>'type';

      IF v_type IS NULL THEN
        RETURN NEW;
      END IF;

      -- Manual marking (decision 69): pending, never auto-graded.
      IF v_type = 'long_answer' THEN
        NEW.is_correct := NULL;
        NEW.awarded_points := NULL;
        RETURN NEW;
      END IF;

      IF v_type IN ('mcq', 'mrq') THEN
        IF jsonb_typeof(v_payload->'options') IS DISTINCT FROM 'array' THEN
          RETURN NEW;
        END IF;

        -- Option numbers are the 1-based ordinals of the options array.
        v_correct_options := ARRAY(
          SELECT o.ord::integer
          FROM jsonb_array_elements(v_payload->'options') WITH ORDINALITY AS o(elem, ord)
          WHERE jsonb_typeof(o.elem) = 'object'
            AND o.elem->'is_correct' = 'true'::jsonb
          ORDER BY o.ord
        );

        v_ok := (
          NEW.selected_options IS NOT NULL
          AND COALESCE(array_length(v_correct_options, 1), 0) > 0
          AND ARRAY(SELECT DISTINCT unnest(NEW.selected_options) ORDER BY 1) = v_correct_options
        );
        v_total := 1;

      ELSIF v_type = 'short_answer' THEN
        v_ok := (
          NEW.text_answer IS NOT NULL
          AND btrim(NEW.text_answer) <> ''
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(v_payload->'accepted_answers') = 'array'
                   THEN v_payload->'accepted_answers' ELSE '[]'::jsonb END
            ) AS a(elem)
            WHERE jsonb_typeof(a.elem) = 'string'
              AND lower(btrim(a.elem #>> '{}')) = lower(btrim(NEW.text_answer))
          )
        );
        v_total := 1;

      ELSIF v_type = 'true_false' THEN
        v_ok := COALESCE(
          jsonb_typeof(v_payload->'answer') = 'boolean'
          AND jsonb_typeof(NEW.response->'value') = 'boolean'
          AND NEW.response->'value' = v_payload->'answer',
          false
        );
        v_total := 1;

      ELSIF v_type = 'numeric' THEN
        v_ok := false;
        IF jsonb_typeof(v_payload->'answer') = 'number'
           AND NEW.text_answer ~ '^\s*[-+]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?\s*$'
        THEN
          v_target := (v_payload->>'answer')::numeric;
          v_tolerance := CASE
            WHEN jsonb_typeof(v_payload->'tolerance') = 'number'
              THEN (v_payload->>'tolerance')::numeric
            ELSE 0
          END;
          IF v_tolerance < 0 THEN
            v_tolerance := 0;
          END IF;
          v_given := btrim(NEW.text_answer)::numeric;
          v_ok := abs(v_given - v_target) <= v_tolerance;
        END IF;
        v_total := 1;

      ELSIF v_type = 'cloze' THEN
        WITH b AS (
          SELECT
            e.elem->>'index' AS idx,
            CASE WHEN jsonb_typeof(e.elem->'accepted') = 'array'
                 THEN e.elem->'accepted' ELSE '[]'::jsonb END AS accepted
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_payload->'blanks') = 'array'
                 THEN v_payload->'blanks' ELSE '[]'::jsonb END
          ) AS e(elem)
          WHERE jsonb_typeof(e.elem) = 'object'
        ),
        -- One response entry per blank index; a student who sends several
        -- guesses for the same blank scores nothing for it (no shotgun
        -- answers). Mirrors the `sr` guard used by matching below.
        r AS (
          SELECT e.elem->>'index' AS idx, min(e.elem->>'value') AS val
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(NEW.response->'blanks') = 'array'
                 THEN NEW.response->'blanks' ELSE '[]'::jsonb END
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
            CASE WHEN jsonb_typeof(v_payload->'pairs') = 'array'
                 THEN v_payload->'pairs' ELSE '[]'::jsonb END
          ) AS e(elem)
          WHERE jsonb_typeof(e.elem) = 'object'
        ),
        -- One response entry per left item; a student who sends the same
        -- left_id twice scores nothing for it (no shotgun answers).
        sr AS (
          SELECT e.elem->>'left_id' AS l, min(e.elem->>'right_id') AS r
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(NEW.response->'pairs') = 'array'
                 THEN NEW.response->'pairs' ELSE '[]'::jsonb END
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

      ELSIF v_type = 'ordering' THEN
        WITH c AS (
          SELECT e.ord AS pos, e.elem #>> '{}' AS id
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_payload->'correct_order') = 'array'
                 THEN v_payload->'correct_order' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS e(elem, ord)
        ),
        s AS (
          SELECT e.ord AS pos, e.elem #>> '{}' AS id
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(NEW.response->'order') = 'array'
                 THEN NEW.response->'order' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS e(elem, ord)
        )
        SELECT
          count(*)::integer,
          count(*) FILTER (WHERE s.id IS NOT NULL AND c.id IS NOT NULL AND s.id = c.id)::integer
        INTO v_total, v_correct
        FROM c
        LEFT JOIN s ON s.pos = c.pos;

      ELSE
        -- Unknown type: ungradable, 0 points.
        RETURN NEW;
      END IF;

      IF v_type IN ('mcq', 'mrq', 'short_answer', 'true_false', 'numeric') THEN
        v_correct := CASE WHEN COALESCE(v_ok, false) THEN 1 ELSE 0 END;
      END IF;
    END IF;

    v_total := COALESCE(v_total, 0);
    v_correct := LEAST(GREATEST(COALESCE(v_correct, 0), 0), v_total);

    IF v_total <= 0 THEN
      NEW.is_correct := FALSE;
      NEW.awarded_points := 0;
    ELSE
      NEW.is_correct := (v_correct = v_total);
      NEW.awarded_points := round(COALESCE(v_points, 0) * v_correct::numeric / v_total, 2);
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- A malformed payload or response must never brick an attempt.
    NEW.is_correct := FALSE;
    NEW.awarded_points := 0;
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$;
