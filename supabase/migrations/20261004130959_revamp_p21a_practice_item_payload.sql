-- ============================================================
-- Clavis revamp — P21a: practice runs on the item payload.
--
-- R4.2 / R8.9. Two banks, two schemas: the assessment bank stored a JSONB
-- payload (nine types, one validator, one grader), the practice bank stored
-- four fixed option columns and knew three types. After this migration there
-- is ONE item schema. The banks still never share rows (R4.1) — they differ
-- only in where an item is filed and which types its runner accepts.
--
--   D1  public.assessment_payload_is_valid -> public.item_payload_is_valid,
--       plus two optional keys: `tip` (every type) and `options[].tip`, and
--       an mcq has exactly one correct option.
--   D2  questions = id, stage_id, payload, grade/subject, image_hash, stamps.
--       Seven types in practice: no `ordering`, no `long_answer`.
--   D3  Every existing row is converted in place; option gaps are compacted
--       and practice_answers.selected_options is renumbered to match.
--   D4  app.grade_item_response — the one grader. Both grading triggers call it.
--   D5  Practice stays all-or-nothing per question.
--   D6  app.sanitize_item_payload — the one sanitizer. The attempt RPC and
--       both practice RPCs call it.
--   D7  practice_answers.response; submit_practice_session carries it.
--   D8  questions.payload is not readable by `authenticated`.
--   D9  get_session_result: option tips on wrong picks, the question tip on a
--       wrong non-option answer, never a key.
--   R8.6 The submit RPC becomes the only writer of practice history: the
--       leftover direct-write grants and policies are removed (section 8).
--
-- Nothing here is a compatibility layer: the fixed option columns, their
-- CHECKs and the `question_type` enum are dropped, not kept beside the
-- payload.
--
-- The assessment side does not move. get_attempt_questions returns the same
-- JSON key for key, and grade_attempt_answer the same is_correct and
-- awarded_points, as before — their bodies now delegate, nothing more.
-- ============================================================

-- ------------------------------------------------------------
-- 1. One validator (D1)
--
-- RENAME keeps the function's OID, so the two CHECKs that already use it
-- (assessment_bank_questions.bank_questions_payload_check and
-- assessment_questions.assessment_questions_payload_shape) stay attached and
-- simply read the new name. The body is the previous one plus the two `tip`
-- rules and one tightening: an mcq has EXACTLY one correct option (the
-- practice bank's old `mcq_one_correct` CHECK, now true of every item; the
-- editor has always built them that way). A CHECK does not re-read rows that
-- are already stored, so this binds new writes on all three tables.
-- ------------------------------------------------------------
ALTER FUNCTION public.assessment_payload_is_valid(jsonb) RENAME TO item_payload_is_valid;

CREATE OR REPLACE FUNCTION public.item_payload_is_valid(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_type text;
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

  -- ---- true_false -----------------------------------------------------
  IF v_type = 'true_false' THEN
    RETURN COALESCE(jsonb_typeof(p->'answer'), '') = 'boolean';
  END IF;

  -- ---- numeric --------------------------------------------------------
  IF v_type = 'numeric' THEN
    IF COALESCE(jsonb_typeof(p->'answer'), '') <> 'number' THEN RETURN false; END IF;

    IF (p ? 'tolerance') AND jsonb_typeof(p->'tolerance') <> 'null' THEN
      IF jsonb_typeof(p->'tolerance') <> 'number' THEN RETURN false; END IF;
      -- jsonb number comparison: no cast, so no overflow can raise here.
      IF p->'tolerance' < '0'::jsonb THEN RETURN false; END IF;
    END IF;

    IF (p ? 'unit') AND jsonb_typeof(p->'unit') NOT IN ('string', 'null') THEN
      RETURN false;
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

  -- ---- ordering -------------------------------------------------------
  IF v_type = 'ordering' THEN
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
  'Structural validation of an item payload — the one schema both banks store (R4.2). Nine types; optional image_path and tip on every type, optional image_path and tip per mcq/mrq option; exactly one correct option for mcq, at least one for mrq. Backs the payload CHECKs on assessment_bank_questions, assessment_questions and questions (which also narrows the type list). Never raises: an unrecognised or malformed payload is simply invalid.';

-- ------------------------------------------------------------
-- 2. One grader (D4)
--
-- The logic of grade_attempt_answer, lifted out of the trigger so both
-- products grade through it. It reports PARTS, not a verdict:
--
--   total   how many independently gradable parts the item has
--   correct how many of them the response got right
--
--   binary types (mcq, mrq, short_answer, true_false, numeric)  -> x of 1
--   cloze -> x of blanks   matching -> x of pairs   ordering -> x of positions
--   long_answer            -> NULL, NULL   (pending manual marking)
--   anything ungradable    -> 0 of 0       (unknown type, malformed payload,
--                                           or an error while grading)
--
-- What a caller makes of the parts is its own business: assessments award
-- points pro rata, practice is all-or-nothing (D5).
--
-- Pure — it reads only its arguments — and it never raises.
-- ------------------------------------------------------------
CREATE FUNCTION app.grade_item_response(
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
  v_correct_options integer[];
  v_ok boolean;
  v_total integer := 0;
  v_correct integer := 0;
  v_target numeric;
  v_tolerance numeric;
  v_given numeric;
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

    IF v_type IN ('mcq', 'mrq') THEN
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

      v_ok := (
        p_selected_options IS NOT NULL
        AND COALESCE(array_length(v_correct_options, 1), 0) > 0
        AND ARRAY(SELECT DISTINCT unnest(p_selected_options) ORDER BY 1) = v_correct_options
      );
      v_total := 1;

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
      v_total := 1;

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

    ELSE
      -- Unknown type: ungradable.
      RETURN;
    END IF;

    IF v_type IN ('mcq', 'mrq', 'short_answer', 'true_false', 'numeric') THEN
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

ALTER FUNCTION app.grade_item_response(jsonb, integer[], text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.grade_item_response(jsonb, integer[], text, jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.grade_item_response(jsonb, integer[], text, jsonb) IS
  'The one item grader (P21-D4). Returns how many gradable parts the item has (total) and how many the response got right (correct): x of 1 for mcq/mrq/short_answer/true_false/numeric, per blank/pair/position for cloze/matching/ordering, NULL/NULL for long_answer (pending manual marking), 0 of 0 when ungradable. Pure and never raises. Internal to the grading triggers.';

-- ------------------------------------------------------------
-- 3. One sanitizer (D6)
--
-- The content-only view of an item: exactly what get_attempt_questions built
-- inline until now, with the two things that differed per caller turned into
-- arguments — the storage bucket its image paths resolve in, and the seed
-- that scrambles a matching item's right column and an ordering item's items.
--
-- It emits by construction, never by subtraction: a key the runner must not
-- see (is_correct, answer, accepted_answers, tolerance, blanks.accepted,
-- pairs, correct_order, tip, explanation, rubric) is not in the output
-- because nothing here copies it, so a new key added to the payload later
-- stays private until it is deliberately emitted.
-- ------------------------------------------------------------
CREATE FUNCTION app.sanitize_item_payload(
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
      'image_path', CASE
        WHEN jsonb_typeof(p_payload->'image_path') = 'string'
             AND btrim(p_payload->>'image_path') <> ''
          THEN p_payload->>'image_path'
        ELSE NULL::text
      END,
      'image_bucket', CASE
        WHEN jsonb_typeof(p_payload->'image_path') = 'string'
             AND btrim(p_payload->>'image_path') <> ''
          THEN p_image_bucket
        ELSE NULL::text
      END,
      'options', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'number', e.ord::integer,
                'text', e.elem->>'text',
                'image_path', CASE
                  WHEN jsonb_typeof(e.elem->'image_path') = 'string'
                       AND btrim(e.elem->>'image_path') <> ''
                    THEN e.elem->>'image_path'
                  ELSE NULL::text
                END,
                'image_bucket', CASE
                  WHEN jsonb_typeof(e.elem->'image_path') = 'string'
                       AND btrim(e.elem->>'image_path') <> ''
                    THEN p_image_bucket
                  ELSE NULL::text
                END
              )
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
    || CASE
         WHEN p_payload->>'type' = 'numeric' THEN
           jsonb_build_object('unit', p_payload->>'unit')

         WHEN p_payload->>'type' = 'cloze' THEN
           jsonb_build_object(
             'text', p_payload->>'text',
             'blanks', (
               SELECT COALESCE(
                 jsonb_agg(jsonb_build_object('index', e.elem->'index') ORDER BY e.ord),
                 '[]'::jsonb
               )
               FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(p_payload->'blanks') = 'array'
                      THEN p_payload->'blanks' ELSE '[]'::jsonb END
               ) WITH ORDINALITY AS e(elem, ord)
               WHERE jsonb_typeof(e.elem) = 'object'
             )
           )

         WHEN p_payload->>'type' = 'matching' THEN
           jsonb_build_object(
             'left', (
               SELECT COALESCE(
                 jsonb_agg(
                   jsonb_build_object('id', e.elem->>'id', 'text', e.elem->>'text')
                   ORDER BY e.ord
                 ),
                 '[]'::jsonb
               )
               FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(p_payload->'left') = 'array'
                      THEN p_payload->'left' ELSE '[]'::jsonb END
               ) WITH ORDINALITY AS e(elem, ord)
               WHERE jsonb_typeof(e.elem) = 'object'
             ),
             'right', (
               SELECT COALESCE(
                 jsonb_agg(
                   jsonb_build_object('id', e.elem->>'id', 'text', e.elem->>'text')
                   ORDER BY md5(p_seed || COALESCE(e.elem->>'id', ''))
                 ),
                 '[]'::jsonb
               )
               FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(p_payload->'right') = 'array'
                      THEN p_payload->'right' ELSE '[]'::jsonb END
               ) AS e(elem)
               WHERE jsonb_typeof(e.elem) = 'object'
             )
           )

         WHEN p_payload->>'type' = 'ordering' THEN
           jsonb_build_object(
             'items', (
               SELECT COALESCE(
                 jsonb_agg(
                   jsonb_build_object('id', e.elem->>'id', 'text', e.elem->>'text')
                   ORDER BY md5(p_seed || COALESCE(e.elem->>'id', ''))
                 ),
                 '[]'::jsonb
               )
               FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(p_payload->'items') = 'array'
                      THEN p_payload->'items' ELSE '[]'::jsonb END
               ) AS e(elem)
               WHERE jsonb_typeof(e.elem) = 'object'
             )
           )

         ELSE '{}'::jsonb
       END;
$$;

ALTER FUNCTION app.sanitize_item_payload(jsonb, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.sanitize_item_payload(jsonb, text, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.sanitize_item_payload(jsonb, text, text) IS
  'The one item sanitizer (P21-D6): the content a runner may show, and never a key or a tip. Emits type, question, image_path + image_bucket, options[{number, text, image_path, image_bucket}], plus unit (numeric), text + blanks[{index}] (cloze), left + right (matching, right scrambled by md5(seed || id)) and items (ordering, scrambled the same way). Internal to the attempt and practice content RPCs.';

-- ------------------------------------------------------------
-- 4. The assessment side delegates (D4, D6)
--
-- Same outputs as before, to the digit: awarded_points keeps its two-decimal
-- rounding for a graded answer and its bare 0 for an ungradable one.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grade_attempt_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payload jsonb;
  v_points numeric;
  v_correct integer;
  v_total integer;
BEGIN
  -- Default deny: whatever the client sent in the grade columns is discarded.
  NEW.is_correct := FALSE;
  NEW.awarded_points := 0;

  SELECT aq.payload, aq.points
  INTO v_payload, v_points
  FROM assessment_questions aq
  WHERE aq.id = NEW.assessment_question_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT g.correct, g.total
  INTO v_correct, v_total
  FROM app.grade_item_response(
    v_payload, NEW.selected_options, NEW.text_answer, NEW.response
  ) AS g;

  IF v_total IS NULL THEN
    -- long_answer: pending manual marking (decision 69).
    NEW.is_correct := NULL;
    NEW.awarded_points := NULL;
  ELSIF v_total > 0 THEN
    NEW.is_correct := (v_correct = v_total);
    NEW.awarded_points := round(COALESCE(v_points, 0) * v_correct::numeric / v_total, 2);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.grade_attempt_answer() IS
  'BEFORE INSERT/UPDATE grader for attempt_answers: is_correct + awarded_points from app.grade_item_response over the snapshot payload — pro rata for cloze/matching/ordering, all or nothing for the rest. long_answer stays NULL/NULL = pending manual marking. Never raises.';

CREATE OR REPLACE FUNCTION public.get_attempt_questions(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_student_id uuid;
  v_result jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT student_id INTO v_student_id
  FROM assessment_attempts
  WHERE id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found: %', p_attempt_id;
  END IF;

  IF v_student_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Cannot read another student''s attempt';
  END IF;

  -- The scramble seed is the attempt id: one frozen order per attempt (R7.2).
  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      atq.question_order,
      jsonb_build_object(
        'assessment_question_id', aq.id,
        'question_order', atq.question_order,
        'points', aq.points
      )
      || app.sanitize_item_payload(aq.payload, p_attempt_id::text, 'assessment-images') AS item
    FROM attempt_questions atq
    JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
    WHERE atq.attempt_id = p_attempt_id
  ) x;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- 5. The practice bank stores the payload (D2, D3)
--
-- 5.1 Convert every row in place.
--
--   mcq / mrq     options[] = the non-empty options (text or image) in column
--                 order, each {text, is_correct, image_path?, tip?}
--   short_answer  accepted_answers = [btrim(answer)]
--   every type    question, and image_path when there is one
--
-- An option number IS its position in options[], so a question whose filled
-- options had a gap (say 1 and 3) is renumbered by the compaction (3 -> 2).
-- The map below holds all four slots of every mcq/mrq: `new_number` is where
-- a kept option lands and NULL for an empty slot. It is what lets a student's
-- stored selection follow its option (5.2) and what shows a key that sat on
-- an empty slot (5.3).
--
-- questions_updated_at_trigger is held off: re-shaping a row is not an edit,
-- and `updated_at` is what an admin reads as "last changed".
-- ------------------------------------------------------------
ALTER TABLE public.questions ADD COLUMN payload jsonb;

CREATE TABLE app.p21a_option_map AS
SELECT
  s.question_id,
  s.old_number,
  CASE WHEN s.kept THEN
    (count(*) FILTER (WHERE s.kept)
       OVER (PARTITION BY s.question_id ORDER BY s.old_number))::integer
  END AS new_number,
  s.is_correct,
  s.option
FROM (
  SELECT
    q.id AS question_id,
    o.old_number,
    (btrim(COALESCE(o.opt_text, '')) <> '' OR btrim(COALESCE(o.opt_image, '')) <> '') AS kept,
    COALESCE(o.opt_is_correct, false) AS is_correct,
    jsonb_build_object(
      'text', COALESCE(o.opt_text, ''),
      'is_correct', COALESCE(o.opt_is_correct, false)
    )
    || CASE WHEN btrim(COALESCE(o.opt_image, '')) <> ''
            THEN jsonb_build_object('image_path', o.opt_image) ELSE '{}'::jsonb END
    || CASE WHEN btrim(COALESCE(o.opt_tip, '')) <> ''
            THEN jsonb_build_object('tip', o.opt_tip) ELSE '{}'::jsonb END AS option
  FROM public.questions q
  CROSS JOIN LATERAL (
    VALUES
      (1, q.option_1_text, q.option_1_image_path, q.option_1_is_correct, q.option_1_tip),
      (2, q.option_2_text, q.option_2_image_path, q.option_2_is_correct, q.option_2_tip),
      (3, q.option_3_text, q.option_3_image_path, q.option_3_is_correct, q.option_3_tip),
      (4, q.option_4_text, q.option_4_image_path, q.option_4_is_correct, q.option_4_tip)
  ) AS o(old_number, opt_text, opt_image, opt_is_correct, opt_tip)
  WHERE q.type IN ('mcq', 'mrq')
) s;

-- The remap below looks an option up once per stored selection; without this
-- it scans the map for each one while practice_answers is locked.
ALTER TABLE app.p21a_option_map ADD PRIMARY KEY (question_id, old_number);
ANALYZE app.p21a_option_map;

ALTER TABLE public.questions DISABLE TRIGGER questions_updated_at_trigger;

UPDATE public.questions q
SET payload =
  jsonb_build_object('type', q.type::text, 'question', q.question)
  || CASE WHEN btrim(COALESCE(q.image_path, '')) <> ''
          THEN jsonb_build_object('image_path', q.image_path) ELSE '{}'::jsonb END
  || CASE
       WHEN q.type IN ('mcq', 'mrq') THEN
         jsonb_build_object('options', COALESCE(
           (SELECT jsonb_agg(m.option ORDER BY m.new_number)
            FROM app.p21a_option_map m
            WHERE m.question_id = q.id
              AND m.new_number IS NOT NULL),
           '[]'::jsonb
         ))
       WHEN q.type = 'short_answer' THEN
         jsonb_build_object('accepted_answers', jsonb_build_array(btrim(q.answer)))
       ELSE '{}'::jsonb
     END;

ALTER TABLE public.questions ENABLE TRIGGER questions_updated_at_trigger;

-- ------------------------------------------------------------
-- 5.2 History follows its option.
--
-- Only questions the compaction actually renumbered are touched. A stored
-- number that points at no surviving option (nothing the runner ever offered)
-- is dropped from the selection, and a selection left with nothing becomes
-- NULL — the same "no selection" submit_practice_session stores.
--
-- The grading trigger is dropped first — it fires on any write to
-- selected_options and would re-grade history against a half-converted row.
-- `is_correct` is not recomputed here: a past answer keeps the grade it was
-- given. Step 6 re-creates the trigger with `response` in its column list.
-- ------------------------------------------------------------
DROP TRIGGER trg_grade_practice_answer ON public.practice_answers;

UPDATE public.practice_answers pa
SET selected_options = NULLIF(
  ARRAY(
    SELECT m.new_number
    FROM unnest(pa.selected_options) WITH ORDINALITY AS s(old_number, ord)
    JOIN app.p21a_option_map m
      ON m.question_id = pa.question_id
     AND m.old_number = s.old_number
    WHERE m.new_number IS NOT NULL
    ORDER BY s.ord
  ),
  '{}'::integer[]
)
WHERE pa.selected_options IS NOT NULL
  AND pa.question_id IN (
    SELECT m.question_id
    FROM app.p21a_option_map m
    WHERE m.new_number <> m.old_number
  );

-- ------------------------------------------------------------
-- 5.3 Refuse to continue over a row that did not convert.
--
-- The old CHECKs were looser than the validator (an mrq with no correct
-- option, a question with only an image and no text, a blank short answer
-- all passed them), so a long-lived bank may hold rows that have no valid
-- payload.
--
-- One case converts to a VALID payload and is still wrong: a correct flag on
-- an option with neither text nor image. Compaction drops that option, so
-- the question would come out with a different key than it was stored with
-- (an mrq keyed {1, 3} with slot 3 empty becomes "only 1 is correct").
--
-- Both are content problems for an admin to fix, not something to guess at
-- here: the migration stops and names the rows.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_invalid text;
  v_key_on_empty text;
BEGIN
  SELECT string_agg(q.id::text, ', ' ORDER BY q.id)
  INTO v_invalid
  FROM public.questions q
  WHERE public.item_payload_is_valid(q.payload) IS NOT TRUE;

  SELECT string_agg(x.question_id::text, ', ' ORDER BY x.question_id)
  INTO v_key_on_empty
  FROM (
    SELECT DISTINCT m.question_id
    FROM app.p21a_option_map m
    WHERE m.new_number IS NULL
      AND m.is_correct
  ) x;

  IF v_invalid IS NOT NULL OR v_key_on_empty IS NOT NULL THEN
    RAISE EXCEPTION
      'P21a: practice questions cannot be converted. No valid item payload: [%]. Correct flag on an empty option: [%].',
      COALESCE(v_invalid, ''), COALESCE(v_key_on_empty, '')
      USING HINT = 'Fix or delete these rows in the practice bank, then run the migration again.';
  END IF;
END;
$$;

DROP TABLE app.p21a_option_map;

-- ------------------------------------------------------------
-- 5.4 Drop what the payload replaces.
-- ------------------------------------------------------------
ALTER TABLE public.questions
  DROP CONSTRAINT mcq_has_two_options,
  DROP CONSTRAINT mcq_one_correct,
  DROP CONSTRAINT valid_short_answer;

DROP INDEX public.idx_questions_type;

ALTER TABLE public.questions
  DROP COLUMN type,
  DROP COLUMN question,
  DROP COLUMN image_path,
  DROP COLUMN answer,
  DROP COLUMN option_1_text,
  DROP COLUMN option_1_image_path,
  DROP COLUMN option_1_is_correct,
  DROP COLUMN option_1_tip,
  DROP COLUMN option_2_text,
  DROP COLUMN option_2_image_path,
  DROP COLUMN option_2_is_correct,
  DROP COLUMN option_2_tip,
  DROP COLUMN option_3_text,
  DROP COLUMN option_3_image_path,
  DROP COLUMN option_3_is_correct,
  DROP COLUMN option_3_tip,
  DROP COLUMN option_4_text,
  DROP COLUMN option_4_image_path,
  DROP COLUMN option_4_is_correct,
  DROP COLUMN option_4_tip;

-- Nothing else used it: one column, three CHECKs, all gone above.
DROP TYPE public.question_type;

ALTER TABLE public.questions ALTER COLUMN payload SET NOT NULL;

-- `ordering` is out until "answered" is defined for it in a runner that
-- requires every question answered (R8.7); `long_answer` needs a marker and
-- practice has none (R8.9).
ALTER TABLE public.questions
  ADD CONSTRAINT questions_payload_check CHECK (
    public.item_payload_is_valid(payload)
    AND payload->>'type' IN (
      'mcq', 'mrq', 'short_answer', 'true_false', 'numeric', 'cloze', 'matching'
    )
  );

COMMENT ON COLUMN public.questions.payload IS
  'The item: type, question, optional image_path and tip, and the type''s own keys INCLUDING its answer key (see item_payload_is_valid). Image paths resolve in the question-images bucket. Not readable by authenticated.';

COMMENT ON TABLE public.questions IS
  'Practice question bank, filed under a stage. One row = one item payload of a practice type (mcq, mrq, short_answer, true_false, numeric, cloze, matching). `authenticated` may SELECT the filing columns only — the payload holds answer keys and tips (R4.7). Students read content through get_practice_questions() / get_practice_session_questions(); admins read whole rows through get_bank_questions().';

-- ------------------------------------------------------------
-- 5.5 Key privacy (D8)
--
-- Stated in full rather than left to what survives the column drops: SELECT
-- is granted on the filing columns and nothing else, so `payload` — and any
-- column added later — is unreadable until someone grants it on purpose.
-- The pool read a student makes (ids of a stage) needs no more than this.
--
-- INSERT / UPDATE / DELETE stay whole-table: RLS scopes writes to platform
-- admins, and authoring has to write the payload.
-- ------------------------------------------------------------
REVOKE SELECT ON TABLE public.questions FROM authenticated;

GRANT SELECT (
  id,
  stage_id,
  grade_level_id,
  subject_id,
  image_hash,
  created_at,
  updated_at
) ON TABLE public.questions TO authenticated;

REVOKE ALL ON TABLE public.questions FROM anon;

-- ------------------------------------------------------------
-- 6. Practice answers carry a response, and grade through the one grader
--    (D5, D7)
--
-- `response` holds what does not fit a number list or a string, in the same
-- shapes attempt_answers.response uses: {value} for true_false, {blanks} for
-- cloze, {pairs} for matching.
-- ------------------------------------------------------------
ALTER TABLE public.practice_answers
  ADD COLUMN response jsonb,
  ADD CONSTRAINT practice_answers_response_object
    CHECK (response IS NULL OR jsonb_typeof(response) = 'object');

GRANT SELECT (response) ON TABLE public.practice_answers TO authenticated;

COMMENT ON COLUMN public.practice_answers.response IS
  'Structured answer for the types that need one: {"value": bool} (true_false), {"blanks": [{"index", "value"}]} (cloze), {"pairs": [{"left_id", "right_id"}]} (matching). NULL for mcq/mrq (selected_options) and short_answer/numeric (text_answer).';

COMMENT ON COLUMN public.practice_answers.selected_options IS
  'Selected option numbers for mcq/mrq: 1-based positions in the question''s payload.options. One element for mcq, one or more for mrq.';

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
  -- Default deny: whatever the caller sent in is_correct is discarded.
  NEW.is_correct := FALSE;

  SELECT q.payload INTO v_payload
  FROM questions q
  WHERE q.id = NEW.question_id;

  -- A question that no longer exists (question_id is ON DELETE SET NULL)
  -- cannot be graded as correct.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT g.correct, g.total
  INTO v_correct, v_total
  FROM app.grade_item_response(
    v_payload, NEW.selected_options, NEW.text_answer, NEW.response
  ) AS g;

  -- All or nothing per question (D5): every part right, or the question is
  -- wrong. No part marks in practice.
  NEW.is_correct := COALESCE(v_total > 0 AND v_correct = v_total, FALSE);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.grade_practice_answer() IS
  'BEFORE INSERT/UPDATE grader for practice_answers: is_correct from app.grade_item_response over the question''s payload, all or nothing per question (every blank / every pair right). Never raises.';

CREATE TRIGGER trg_grade_practice_answer
  BEFORE INSERT OR UPDATE OF selected_options, text_answer, response, question_id, is_correct
  ON public.practice_answers
  FOR EACH ROW EXECUTE FUNCTION public.grade_practice_answer();

-- ------------------------------------------------------------
-- 7. Practice RPCs on the payload (D6, D7, D9)
--
-- Both content RPCs keep their per-question filing keys and merge the
-- sanitized item into them. The scramble seed is the caller's id plus the
-- question's id: a student always sees one order for a question, so a stored
-- session reviews in the order it was answered in, and two questions with
-- the same positional item ids (r1..rN) do not share a permutation.
-- ------------------------------------------------------------

-- 7.1 Sanitized practice content by question id
CREATE OR REPLACE FUNCTION public.get_practice_questions(p_question_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_result jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      (ids.ord - 1)::int AS question_order,
      jsonb_build_object(
        'question_id', q.id,
        'question_order', (ids.ord - 1)::int,
        'stage_id', q.stage_id,
        'subject_id', q.subject_id,
        'grade_level_id', q.grade_level_id
      )
      || app.sanitize_item_payload(q.payload, v_caller::text || q.id::text, 'question-images') AS item
    FROM unnest(p_question_ids) WITH ORDINALITY AS ids(question_id, ord)
    JOIN questions q ON q.id = ids.question_id
  ) x;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_practice_questions(uuid[]) IS
  'Sanitized practice content for an in-browser attempt that has no session row yet, ordered by the caller''s array. Each item = question_id, question_order, stage_id, subject_id, grade_level_id + app.sanitize_item_payload (bucket question-images, scramble seeded by the caller and the question). Never returns a key or a tip.';

-- 7.2 Sanitized content of a stored session, in its frozen order
CREATE OR REPLACE FUNCTION public.get_practice_session_questions(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_student_id uuid;
  v_result jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT student_id INTO v_student_id
  FROM practice_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF v_student_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Cannot read another student''s session';
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      sq.question_order,
      jsonb_build_object(
        'question_id', q.id,
        'question_order', sq.question_order,
        'stage_id', q.stage_id,
        'subject_id', q.subject_id,
        'grade_level_id', q.grade_level_id
      )
      || app.sanitize_item_payload(q.payload, v_caller::text || q.id::text, 'question-images') AS item
    FROM session_questions sq
    JOIN questions q ON q.id = sq.question_id
    WHERE sq.session_id = p_session_id
  ) x;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_practice_session_questions(uuid) IS
  'Sanitized question content for one practice session, in question_order (session owner only). Same item shape as get_practice_questions. Never returns a key or a tip.';

-- 7.3 Submit a whole practice attempt in one transaction.
--     Unchanged but for `response`: each answer may carry one, and anything
--     that is not a JSON object is stored as NULL — a malformed response is a
--     wrong answer, never an error.
CREATE OR REPLACE FUNCTION public.submit_practice_session(
  p_stage_id uuid,
  p_cycle_number integer,
  p_answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid := (SELECT auth.uid());
  v_session_id uuid;
  v_grade_level_id uuid;
  v_subject_id uuid;
  v_total_questions int;
  v_distinct_questions int;
  v_matching_questions int;
  v_correct_count int;
  v_total_time_seconds int;
  v_score_percent int;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Sessions are a student-only domain: a staff caller would fail the
  -- student_stage_stats FK below, so refuse up front.
  IF NOT EXISTS (SELECT 1 FROM student_profiles WHERE id = v_student_id) THEN
    RAISE EXCEPTION 'Only students can submit practice sessions';
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'Answers must be a json array';
  END IF;

  v_total_questions := jsonb_array_length(p_answers);

  IF v_total_questions = 0 THEN
    RAISE EXCEPTION 'Answers array cannot be empty';
  END IF;

  -- Resolve the curriculum ancestry server-side rather than trusting the
  -- client's copy: stage -> topic -> subject -> grade_level.
  SELECT s.id, s.grade_level_id
  INTO v_subject_id, v_grade_level_id
  FROM stages sg
  JOIN topics t ON t.id = sg.topic_id
  JOIN subjects s ON s.id = t.subject_id
  WHERE sg.id = p_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found: %', p_stage_id;
  END IF;

  -- Every answered question must be a distinct question of THIS stage.
  -- Without this a client could submit another stage's questions (or the
  -- same question repeatedly) and steer the stats row it lands in.
  SELECT
    COUNT(DISTINCT (a->>'question_id')::uuid)
  INTO v_distinct_questions
  FROM jsonb_array_elements(p_answers) AS a;

  IF v_distinct_questions <> v_total_questions THEN
    RAISE EXCEPTION 'Answers contain duplicate questions';
  END IF;

  SELECT COUNT(*)
  INTO v_matching_questions
  FROM jsonb_array_elements(p_answers) AS a
  JOIN questions q ON q.id = (a->>'question_id')::uuid
  WHERE q.stage_id = p_stage_id;

  IF v_matching_questions <> v_total_questions THEN
    RAISE EXCEPTION 'Answers reference questions outside stage %', p_stage_id;
  END IF;

  INSERT INTO practice_sessions (
    student_id,
    stage_id,
    grade_level_id,
    subject_id,
    total_questions,
    correct_count
  )
  VALUES (
    v_student_id,
    p_stage_id,
    v_grade_level_id,
    v_subject_id,
    v_total_questions,
    0
  )
  RETURNING id INTO v_session_id;

  INSERT INTO session_questions (session_id, question_id, question_order)
  SELECT
    v_session_id,
    (a.value->>'question_id')::uuid,
    (a.ordinality - 1)::int
  FROM jsonb_array_elements(p_answers) WITH ORDINALITY AS a(value, ordinality);

  INSERT INTO student_question_progress (student_id, stage_id, question_id, cycle_number)
  SELECT
    v_student_id,
    p_stage_id,
    (a->>'question_id')::uuid,
    p_cycle_number
  FROM jsonb_array_elements(p_answers) AS a
  ON CONFLICT (student_id, stage_id, question_id, cycle_number) DO NOTHING;

  -- is_correct is a placeholder: trg_grade_practice_answer overwrites it
  -- from the answer key before the row lands.
  INSERT INTO practice_answers (
    session_id,
    question_id,
    selected_options,
    text_answer,
    response,
    is_correct,
    time_spent_seconds
  )
  SELECT
    v_session_id,
    (a->>'question_id')::uuid,
    CASE
      WHEN jsonb_typeof(a->'selected_options') = 'array'
        AND jsonb_array_length(a->'selected_options') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(a->'selected_options')::int)
      ELSE NULL
    END,
    NULLIF(btrim(COALESCE(a->>'text_answer', '')), ''),
    CASE WHEN jsonb_typeof(a->'response') = 'object' THEN a->'response' ELSE NULL END,
    FALSE,
    NULLIF(a->>'time_spent_seconds', '')::int
  FROM jsonb_array_elements(p_answers) AS a;

  SELECT
    COUNT(*) FILTER (WHERE is_correct = TRUE),
    COALESCE(SUM(time_spent_seconds), 0)
  INTO v_correct_count, v_total_time_seconds
  FROM practice_answers
  WHERE session_id = v_session_id;

  UPDATE practice_sessions
  SET
    completed_at = NOW(),
    total_time_seconds = v_total_time_seconds,
    correct_count = v_correct_count
  WHERE id = v_session_id;

  v_score_percent := COALESCE(
    round((100.0 * v_correct_count) / NULLIF(v_total_questions, 0))::integer,
    0
  );

  INSERT INTO student_stage_stats AS s (
    student_id,
    stage_id,
    best_score_percent,
    sessions_completed,
    last_completed_at
  )
  VALUES (v_student_id, p_stage_id, v_score_percent, 1, NOW())
  ON CONFLICT (student_id, stage_id) DO UPDATE
  SET
    best_score_percent = GREATEST(s.best_score_percent, EXCLUDED.best_score_percent),
    sessions_completed = s.sessions_completed + 1,
    last_completed_at = EXCLUDED.last_completed_at;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'correct_count', v_correct_count,
    'total', v_total_questions
  );
END;
$$;

COMMENT ON FUNCTION public.submit_practice_session(uuid, integer, jsonb) IS
  'Writes a finished practice attempt — session, frozen question set, cycle progress, every answer and the completion — in one transaction. Each answer: {question_id, selected_options?, text_answer?, response?, time_spent_seconds?}. The only way a practice session is created; nothing is stored while an attempt is in progress.';

-- 7.4 Deferred results (D9, R8.8).
--
-- A tip is a hint earned by a wrong ANSWER. Every rule below exists so that
-- the result of a session cannot be turned into the key:
--
--   wrong_option_tips  mcq/mrq: the options the student PICKED that are not
--                      correct AND carry a tip, as {number, tip}. A wrong pick
--                      without a tip is not listed (listing it would say
--                      "this one is wrong" for nothing), and a correct pick
--                      is never listed.
--                      mcq: only when exactly ONE option was picked. Picking
--                      several on a single-answer question would otherwise
--                      name every wrong option and leave the key standing.
--   tip                every other type: the question's tip, only when the
--                      student actually answered (a selection, some text or a
--                      response) and got it wrong. An empty answer earns
--                      nothing.
--
-- The student's own answer comes back as they gave it. Never a key, and
-- never which blank or which pair was wrong — correctness is per question.
CREATE OR REPLACE FUNCTION public.get_session_result(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_session practice_sessions%ROWTYPE;
  v_questions jsonb;
  v_score_percent integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_session
  FROM practice_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF v_session.student_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Not authorized to view this session result';
  END IF;

  IF v_session.completed_at IS NULL THEN
    RAISE EXCEPTION 'Results are available after the session is completed';
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_questions
  FROM (
    SELECT
      sq.question_order,
      jsonb_build_object(
        'question_id', q.id,
        'question_order', sq.question_order,
        'type', q.payload->>'type',
        'is_correct', COALESCE(ans.is_correct, false),
        'selected_options', to_jsonb(ans.selected_options),
        'text_answer', ans.text_answer,
        'response', ans.response,
        'wrong_option_tips', CASE
          WHEN q.payload->>'type' = 'mrq'
               OR (q.payload->>'type' = 'mcq' AND cardinality(ans.selected_options) = 1)
          THEN (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object('number', o.ord::integer, 'tip', btrim(o.elem->>'tip'))
                ORDER BY o.ord
              ),
              '[]'::jsonb
            )
            FROM jsonb_array_elements(q.payload->'options') WITH ORDINALITY AS o(elem, ord)
            -- Only options the student actually PICKED, got WRONG, and that
            -- have something to say.
            WHERE o.ord::integer = ANY (ans.selected_options)
              AND o.elem->'is_correct' IS DISTINCT FROM 'true'::jsonb
              AND btrim(COALESCE(o.elem->>'tip', '')) <> ''
          )
          ELSE '[]'::jsonb
        END,
        'tip', CASE
          WHEN q.payload->>'type' NOT IN ('mcq', 'mrq')
               AND ans.is_correct = false
               AND (
                 cardinality(ans.selected_options) > 0
                 OR btrim(COALESCE(ans.text_answer, '')) <> ''
                 OR ans.response IS NOT NULL
               )
            THEN NULLIF(btrim(q.payload->>'tip'), '')
          ELSE NULL::text
        END
      ) AS item
    FROM session_questions sq
    JOIN questions q ON q.id = sq.question_id
    LEFT JOIN practice_answers ans
      ON ans.session_id = sq.session_id
     AND ans.question_id = sq.question_id
    WHERE sq.session_id = p_session_id
  ) x;

  v_score_percent := COALESCE(
    round((100.0 * v_session.correct_count) / NULLIF(v_session.total_questions, 0))::integer,
    0
  );

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'student_id', v_session.student_id,
    'completed_at', v_session.completed_at,
    'correct_count', v_session.correct_count,
    'total', v_session.total_questions,
    'score_percent', v_score_percent,
    'questions', v_questions
  );
END;
$$;

COMMENT ON FUNCTION public.get_session_result(uuid) IS
  'Deferred practice results for one session (owner only, after completion). Per question: type, is_correct, the student''s own answer (selected_options, text_answer, response), wrong_option_tips (mcq/mrq: {number, tip} for the wrong options they picked that carry a tip; mcq only when exactly one option was picked) and tip (other types: the question tip, only when they answered and got it wrong). Never reveals a key, nor which blank or pair was wrong.';

-- 7.5 Admin practice-bank read. Its body is unchanged — SETOF questions
--     follows the table — so only what it documents moves.
COMMENT ON FUNCTION public.get_bank_questions(uuid) IS
  'Full practice-bank rows INCLUDING the payload (answer keys and tips) for authoring. Platform admin only. NULL p_stage_id returns the whole bank, newest first.';

-- ------------------------------------------------------------
-- 8. The submit RPC is the only writer of practice history (R8.6)
--
-- Since P15c nothing in the client writes these tables: a practice attempt
-- lives in the browser until submit_practice_session writes the session, its
-- frozen question set, the cycle progress and every answer in one go. The
-- direct-write grants and policies from the save-as-you-go era were left
-- behind, and they are a way around everything the RPC checks — a student
-- could insert a "completed" session over questions they never answered and
-- read its results.
--
-- submit_practice_session is SECURITY DEFINER and owned by postgres, so it
-- needs none of this. Reads are untouched: the SELECT grants and the
-- "Read ...: self, admin, same-org staff" policies stay exactly as they are.
-- student_stage_stats already grants `authenticated` SELECT only.
-- ------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE
    public.practice_sessions,
    public.session_questions,
    public.practice_answers,
    public.student_question_progress
  FROM authenticated, anon;

DROP POLICY "Students can create own sessions" ON public.practice_sessions;
DROP POLICY "Students can update own sessions" ON public.practice_sessions;
DROP POLICY "Students can create own session questions" ON public.session_questions;
DROP POLICY "Students can update own answers" ON public.practice_answers;
DROP POLICY "Students can insert own question progress" ON public.student_question_progress;
DROP POLICY "Students can update own question progress" ON public.student_question_progress;
