-- ============================================================
-- Clavis — P16a: the practice bank is isolated from assessments
--
-- Decision 88. Two banks existed and one of them was reachable from both
-- sides: `questions` (practice, keyed to a sub-topic) could be picked into an
-- assessment, while `assessment_bank_questions` (assessments, keyed to
-- grade+subject, carrying difficulty) could only be COPIED in.
--
-- The link was also the more dangerous of the two paths. A picked bank
-- question was stored as a foreign key, so an admin editing that row silently
-- rewrote every published assessment and in-flight attempt referencing it —
-- exactly the hazard the copy-based path was introduced to prevent (P13a).
--
-- After this migration an assessment question is ALWAYS a self-contained
-- payload. `assessment_questions.question_id` is gone, and with it every
-- "bank question" branch in the attempt RPCs.
--
--   * grade_attempt_answer      -> ad-hoc arm only (logic byte-identical)
--   * get_attempt_questions     -> ad-hoc arm only
--   * get_attempt_result        -> ad-hoc arm only
--   * mark_attempt_answer       -> long-answer test no longer excludes bank
--   * clone_assessment_template -> copies payload + difficulty, never a link
--
-- DESTRUCTIVE. Assessment questions sourced from the practice bank are
-- DELETED, not converted (the operator chose this over a cross-bucket image
-- copy). `attempt_questions` and `attempt_answers` cascade, so past attempts
-- lose the rows that answered those questions. The stored score columns on
-- `assessment_attempts` are NOT recomputed: a historical attempt keeps the
-- score it was awarded, over a question list that is now shorter.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Remove every assessment question that came from the practice bank.
-- ------------------------------------------------------------
DELETE FROM public.assessment_questions
WHERE question_id IS NOT NULL;

-- Deleting from the middle of an assessment leaves gaps in `position`. Nothing
-- reads position as a contiguous index — every consumer sorts by it — but the
-- reorder RPC rewrites the whole run, so close the gaps now rather than leave
-- a first save to do it invisibly.
WITH resequenced AS (
  SELECT id, row_number() OVER (PARTITION BY assessment_id ORDER BY position, created_at) - 1 AS pos
  FROM public.assessment_questions
)
UPDATE public.assessment_questions aq
SET position = r.pos
FROM resequenced r
WHERE r.id = aq.id
  AND aq.position IS DISTINCT FROM r.pos;

-- ------------------------------------------------------------
-- 2. Drop the link. Every remaining row is a payload, so `payload` becomes
--    NOT NULL and the "exactly one source" CHECK has nothing left to choose
--    between.
-- ------------------------------------------------------------
ALTER TABLE public.assessment_questions
  DROP CONSTRAINT assessment_questions_one_source;

DROP INDEX IF EXISTS public.idx_assessment_questions_question;

ALTER TABLE public.assessment_questions
  DROP COLUMN question_id;

ALTER TABLE public.assessment_questions
  ALTER COLUMN payload SET NOT NULL;

ALTER TABLE public.assessment_questions
  DROP CONSTRAINT assessment_questions_payload_shape;

ALTER TABLE public.assessment_questions
  ADD CONSTRAINT assessment_questions_payload_shape
  CHECK (public.assessment_payload_is_valid(payload));

COMMENT ON TABLE public.assessment_questions IS
  'Ordered questions of an assessment. Always a self-contained ad-hoc payload — the practice bank is not reachable from here (decision 88).';

-- ------------------------------------------------------------
-- 2b. What an admin's own question needs in order to reach the bank.
--
--     Decision 88: a question an ADMIN writes inside a template is contributed
--     to the assessment bank when the template is published. A question a
--     TEACHER writes stays in their assessment and reaches no bank at all —
--     only admins may write `assessment_bank_questions`, and only templates
--     trip the trigger below.
--
--     `difficulty` is the one thing the bank requires that the authoring card
--     does not already collect. It lives here rather than only on the bank row
--     so the admin can set it while writing, before any bank row exists; the
--     UASA 5:3:2 mix is the reason the field exists at all, so defaulting it
--     silently would quietly skew the bank.
--
--     `banked_question_id` records the bank row THIS question created, which
--     is what makes contributing idempotent across re-publishes. It stays NULL
--     for a question copied OUT of the bank, so editing the copy can never
--     write back to the original — the same one-way rule P13a established.
-- ------------------------------------------------------------
ALTER TABLE public.assessment_questions
  ADD COLUMN difficulty public.question_difficulty NOT NULL DEFAULT 'medium';

ALTER TABLE public.assessment_questions
  ADD COLUMN banked_question_id uuid
    REFERENCES public.assessment_bank_questions(id) ON DELETE SET NULL;

CREATE INDEX idx_assessment_questions_banked
  ON public.assessment_questions USING btree (banked_question_id)
  WHERE banked_question_id IS NOT NULL;

COMMENT ON COLUMN public.assessment_questions.difficulty IS
  'Difficulty the bank copy is tagged with when an admin template is published (decision 88). Meaningless on a teacher-authored question, which never reaches a bank.';
COMMENT ON COLUMN public.assessment_questions.banked_question_id IS
  'The assessment_bank_questions row this question contributed, or NULL. Set only by bank_template_questions(); NULL on a question copied out of the bank, so the copy can never write back.';

-- ------------------------------------------------------------
-- 3. The attempt RPCs, with the bank arm removed.
--
--    Each body below is its previous definition MINUS the bank branch; the
--    ad-hoc arm is carried over unchanged, so no grading or rendering
--    behaviour moves for the questions that remain.
-- ------------------------------------------------------------

-- ---- grade_attempt_answer ----
CREATE OR REPLACE FUNCTION public.grade_attempt_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payload jsonb;
  v_points numeric;
  v_type text;
  v_correct_options integer[];
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

  SELECT aq.payload, aq.points
  INTO v_payload, v_points
  FROM assessment_questions aq
  WHERE aq.id = NEW.assessment_question_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  BEGIN
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
-- ---- get_attempt_questions ----
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

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      atq.question_order,
      jsonb_build_object(
        'assessment_question_id', aq.id,
        'question_order', atq.question_order,
        'points', aq.points,
        'type', aq.payload->>'type',
        'question', aq.payload->>'question',
        'image_path', CASE
          WHEN jsonb_typeof(aq.payload->'image_path') = 'string'
               AND btrim(aq.payload->>'image_path') <> ''
            THEN aq.payload->>'image_path'
          ELSE NULL::text
        END,
        'image_bucket', CASE
          WHEN jsonb_typeof(aq.payload->'image_path') = 'string'
               AND btrim(aq.payload->>'image_path') <> ''
            THEN 'assessment-images'
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
                      THEN 'assessment-images'
                    ELSE NULL::text
                  END
                )
                ORDER BY e.ord
              ),
              '[]'::jsonb
            )
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(aq.payload->'options') = 'array' THEN aq.payload->'options'
                ELSE '[]'::jsonb
              END
            ) WITH ORDINALITY AS e(elem, ord)
            WHERE jsonb_typeof(e.elem) = 'object'
        )
      )
      || CASE
           WHEN aq.payload->>'type' = 'numeric' THEN
             jsonb_build_object('unit', aq.payload->>'unit')

           WHEN aq.payload->>'type' = 'cloze' THEN
             jsonb_build_object(
               'text', aq.payload->>'text',
               'blanks', (
                 SELECT COALESCE(
                   jsonb_agg(jsonb_build_object('index', e.elem->'index') ORDER BY e.ord),
                   '[]'::jsonb
                 )
                 FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(aq.payload->'blanks') = 'array'
                        THEN aq.payload->'blanks' ELSE '[]'::jsonb END
                 ) WITH ORDINALITY AS e(elem, ord)
                 WHERE jsonb_typeof(e.elem) = 'object'
               )
             )

           WHEN aq.payload->>'type' = 'matching' THEN
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
                   CASE WHEN jsonb_typeof(aq.payload->'left') = 'array'
                        THEN aq.payload->'left' ELSE '[]'::jsonb END
                 ) WITH ORDINALITY AS e(elem, ord)
                 WHERE jsonb_typeof(e.elem) = 'object'
               ),
               'right', (
                 SELECT COALESCE(
                   jsonb_agg(
                     jsonb_build_object('id', e.elem->>'id', 'text', e.elem->>'text')
                     ORDER BY md5(p_attempt_id::text || COALESCE(e.elem->>'id', ''))
                   ),
                   '[]'::jsonb
                 )
                 FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(aq.payload->'right') = 'array'
                        THEN aq.payload->'right' ELSE '[]'::jsonb END
                 ) AS e(elem)
                 WHERE jsonb_typeof(e.elem) = 'object'
               )
             )

           WHEN aq.payload->>'type' = 'ordering' THEN
             jsonb_build_object(
               'items', (
                 SELECT COALESCE(
                   jsonb_agg(
                     jsonb_build_object('id', e.elem->>'id', 'text', e.elem->>'text')
                     ORDER BY md5(p_attempt_id::text || COALESCE(e.elem->>'id', ''))
                   ),
                   '[]'::jsonb
                 )
                 FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(aq.payload->'items') = 'array'
                        THEN aq.payload->'items' ELSE '[]'::jsonb END
                 ) AS e(elem)
                 WHERE jsonb_typeof(e.elem) = 'object'
               )
             )

           ELSE '{}'::jsonb
         END AS item
    FROM attempt_questions atq
    JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
    WHERE atq.attempt_id = p_attempt_id
  ) x;

  RETURN v_result;
END;
$$;
-- ---- get_attempt_result ----
CREATE OR REPLACE FUNCTION public.get_attempt_result(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_attempt assessment_attempts%ROWTYPE;
  v_assessment assessments%ROWTYPE;
  v_is_staff boolean;
  v_reveal_keys boolean;
  v_withhold_score boolean;
  v_pending integer;
  v_earned_points numeric;
  v_total_points numeric;
  v_questions jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_attempt
  FROM assessment_attempts
  WHERE id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found: %', p_attempt_id;
  END IF;

  SELECT * INTO v_assessment
  FROM assessments
  WHERE id = v_attempt.assessment_id;

  v_is_staff := app.is_admin()
    OR (
      app.is_org_staff()
      AND app.assessment_org_id(v_attempt.assessment_id) = app.current_org_id()
    );

  IF NOT v_is_staff THEN
    IF v_attempt.student_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Not authorized to view this attempt result';
    END IF;

    IF v_attempt.completed_at IS NULL THEN
      RAISE EXCEPTION 'Results are available after the attempt is submitted';
    END IF;
  END IF;

  -- Derived live, not read from the stored counter: the gate below must be
  -- right even for a staff peek at an attempt that has not been through
  -- recompute yet.
  SELECT
    COUNT(*) FILTER (WHERE ans.id IS NOT NULL AND ans.awarded_points IS NULL)::integer,
    COALESCE(SUM(COALESCE(ans.awarded_points, 0)), 0)::numeric,
    COALESCE(SUM(aq.points), 0)::numeric
  INTO v_pending, v_earned_points, v_total_points
  FROM attempt_questions atq
  JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
  LEFT JOIN attempt_answers ans
    ON ans.attempt_id = atq.attempt_id
   AND ans.assessment_question_id = atq.assessment_question_id
  WHERE atq.attempt_id = p_attempt_id;

  v_reveal_keys := v_is_staff OR v_assessment.answers_released_at IS NOT NULL;

  v_withhold_score := (NOT v_is_staff)
    AND v_pending > 0
    AND NOT v_assessment.show_auto_score_while_pending;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.question_order), '[]'::jsonb)
  INTO v_questions
  FROM (
    SELECT
      atq.question_order,
      jsonb_build_object(
        'assessment_question_id', atq.assessment_question_id,
        'question_order', atq.question_order,
        'points', aq.points,
        -- Images (P10a). Content, not correctness — never gated.
        'image_path', CASE
          WHEN jsonb_typeof(aq.payload->'image_path') = 'string'
               AND btrim(aq.payload->>'image_path') <> ''
            THEN aq.payload->>'image_path'
          ELSE NULL::text
        END,
        'image_bucket', CASE
          WHEN jsonb_typeof(aq.payload->'image_path') = 'string'
               AND btrim(aq.payload->>'image_path') <> ''
            THEN 'assessment-images'
          ELSE NULL::text
        END,
        'option_images', (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'number', e.ord::integer,
                  'image_path', e.elem->>'image_path',
                  'image_bucket', 'assessment-images'
                )
                ORDER BY e.ord
              ),
              '[]'::jsonb
            )
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(aq.payload->'options') = 'array'
                   THEN aq.payload->'options' ELSE '[]'::jsonb END
            ) WITH ORDINALITY AS e(elem, ord)
            WHERE jsonb_typeof(e.elem) = 'object'
              AND jsonb_typeof(e.elem->'image_path') = 'string'
              AND btrim(e.elem->>'image_path') <> ''
        ),
        -- The answer row id — what mark_attempt_answer takes.
        'answer_id', ans.id,
        -- The caller's / student's own submission. Not a key: the owner can
        -- read these columns of their own rows directly anyway.
        'selected_options', to_jsonb(ans.selected_options),
        'text_answer', ans.text_answer,
        'response', ans.response,
        'answered_at', ans.answered_at
      )
      || CASE
           -- Withheld score: no correctness, no points, no marker feedback
           -- — a per-question breakdown IS the score, in pieces.
           WHEN v_withhold_score THEN jsonb_build_object(
             'is_correct', NULL::boolean,
             'awarded_points', NULL::numeric,
             'marker_comment', NULL::text,
             'marked_at', NULL::timestamptz
           )
           ELSE jsonb_build_object(
             -- no answer row -> false (unanswered); row with NULL -> pending
             'is_correct', CASE WHEN ans.id IS NULL THEN to_jsonb(false)
                                ELSE to_jsonb(ans.is_correct) END,
             'awarded_points', ans.awarded_points,
             'marker_comment', ans.marker_comment,
             'marked_at', ans.marked_at
           )
         END
      || CASE
           WHEN NOT v_reveal_keys THEN '{}'::jsonb
           ELSE jsonb_build_object('correct',
             CASE
               WHEN aq.payload->>'type' IN ('mcq', 'mrq') THEN
                 jsonb_build_object('correct_options', (
                   SELECT COALESCE(jsonb_agg(e.ord::integer ORDER BY e.ord), '[]'::jsonb)
                   FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(aq.payload->'options') = 'array'
                          THEN aq.payload->'options' ELSE '[]'::jsonb END
                   ) WITH ORDINALITY AS e(elem, ord)
                   WHERE jsonb_typeof(e.elem) = 'object'
                     AND e.elem->'is_correct' = 'true'::jsonb
                 ))

               WHEN aq.payload->>'type' = 'true_false' THEN
                 jsonb_build_object('answer', aq.payload->'answer')

               WHEN aq.payload->>'type' = 'numeric' THEN
                 jsonb_build_object(
                   'answer', aq.payload->'answer',
                   'tolerance', aq.payload->'tolerance'
                 )

               WHEN aq.payload->>'type' = 'short_answer' THEN
                 jsonb_build_object('accepted_answers', aq.payload->'accepted_answers')

               WHEN aq.payload->>'type' = 'cloze' THEN
                 jsonb_build_object('blanks', (
                   SELECT COALESCE(
                     jsonb_agg(
                       jsonb_build_object(
                         'index', e.elem->'index',
                         'accepted', e.elem->'accepted'
                       ) ORDER BY e.ord
                     ),
                     '[]'::jsonb
                   )
                   FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(aq.payload->'blanks') = 'array'
                          THEN aq.payload->'blanks' ELSE '[]'::jsonb END
                   ) WITH ORDINALITY AS e(elem, ord)
                   WHERE jsonb_typeof(e.elem) = 'object'
                 ))

               WHEN aq.payload->>'type' = 'matching' THEN
                 jsonb_build_object('pairs', aq.payload->'pairs')

               WHEN aq.payload->>'type' = 'ordering' THEN
                 jsonb_build_object('correct_order', aq.payload->'correct_order')

               WHEN aq.payload->>'type' = 'long_answer' THEN
                 jsonb_build_object('rubric', aq.payload->'rubric')

               ELSE '{}'::jsonb
             END
             || CASE
                  WHEN jsonb_typeof(aq.payload->'explanation') = 'string'
                    THEN jsonb_build_object('explanation', aq.payload->>'explanation')
                  ELSE '{}'::jsonb
                END
           )
         END AS item
    FROM attempt_questions atq
    JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
    LEFT JOIN attempt_answers ans
      ON ans.attempt_id = atq.attempt_id
     AND ans.assessment_question_id = atq.assessment_question_id
    WHERE atq.attempt_id = p_attempt_id
  ) x;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'assessment_id', v_attempt.assessment_id,
    'student_id', v_attempt.student_id,
    'started_at', v_attempt.started_at,
    'completed_at', v_attempt.completed_at,
    'total_questions', v_attempt.total_questions,
    'pending_count', v_pending,
    'score_withheld', v_withhold_score,
    'answers_revealed', v_reveal_keys,
    'answers_released_at', v_assessment.answers_released_at,
    'show_auto_score_while_pending', v_assessment.show_auto_score_while_pending,
    'correct_count', CASE WHEN v_withhold_score THEN NULL::jsonb
                          ELSE to_jsonb(v_attempt.correct_count) END,
    'score_percent', CASE WHEN v_withhold_score THEN NULL::jsonb
                          ELSE to_jsonb(v_attempt.score_percent) END,
    'points_awarded', CASE WHEN v_withhold_score THEN NULL::jsonb
                           ELSE to_jsonb(v_earned_points) END,
    'points_total', CASE WHEN v_withhold_score THEN NULL::jsonb
                         ELSE to_jsonb(v_total_points) END,
    'questions', v_questions
  );
END;
$$;
-- ---- mark_attempt_answer ----
CREATE OR REPLACE FUNCTION public.mark_attempt_answer(
  p_answer_id uuid,
  p_points numeric,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_attempt_id uuid;
  v_assessment_question_id uuid;
  v_assessment_id uuid;
  v_completed_at timestamptz;
  v_max_points integer;
  v_is_manual boolean;
  v_award numeric;
  v_is_correct boolean;
  v_marked_at timestamptz;
  v_correct_count integer;
  v_total_questions integer;
  v_score_percent integer;
  v_pending integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT ans.attempt_id, ans.assessment_question_id
  INTO v_attempt_id, v_assessment_question_id
  FROM attempt_answers ans
  WHERE ans.id = p_answer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Answer not found: %', p_answer_id;
  END IF;

  -- FOR UPDATE serializes two markers working on the same attempt: each
  -- mark recomputes the whole attempt, so the writes must not interleave.
  SELECT att.assessment_id, att.completed_at
  INTO v_assessment_id, v_completed_at
  FROM assessment_attempts att
  WHERE att.id = v_attempt_id
  FOR UPDATE;

  IF NOT app.can_mark_assessment(v_assessment_id) THEN
    RAISE EXCEPTION 'Not authorized to mark this answer';
  END IF;

  IF v_completed_at IS NULL THEN
    RAISE EXCEPTION 'Only submitted attempts can be marked';
  END IF;

  SELECT aq.points,
         (aq.payload->>'type' = 'long_answer')
  INTO v_max_points, v_is_manual
  FROM assessment_questions aq
  WHERE aq.id = v_assessment_question_id;

  IF NOT COALESCE(v_is_manual, false) THEN
    RAISE EXCEPTION 'Only long-answer questions are marked by hand';
  END IF;

  -- NaN would slip past a naive range test (NaN > every numeric in
  -- Postgres, so `p_points > max` would catch it, but `p_points < 0`
  -- would not); reject it explicitly.
  IF p_points IS NULL OR p_points = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Awarded points must be a number between 0 and %', v_max_points;
  END IF;

  IF p_points < 0 OR p_points > v_max_points THEN
    RAISE EXCEPTION 'Awarded points must be between 0 and %', v_max_points;
  END IF;

  -- Same rounding as the auto grader (2 dp); full marks = "correct".
  v_award := round(p_points, 2);
  v_is_correct := (v_award >= v_max_points);

  -- Touches ONLY server-owned columns, so neither the time-limit trigger
  -- (section 5) nor the grading trigger (P9a's UPDATE OF list) fires.
  UPDATE attempt_answers
  SET
    awarded_points = v_award,
    is_correct = v_is_correct,
    marked_by = v_caller,
    marked_at = now(),
    marker_comment = NULLIF(btrim(COALESCE(p_comment, '')), '')
  WHERE id = p_answer_id
  RETURNING marked_at INTO v_marked_at;

  PERFORM app.recompute_attempt_score(v_attempt_id);

  SELECT att.correct_count, att.total_questions, att.score_percent,
         att.pending_manual_count
  INTO v_correct_count, v_total_questions, v_score_percent, v_pending
  FROM assessment_attempts att
  WHERE att.id = v_attempt_id;

  RETURN jsonb_build_object(
    'answer_id', p_answer_id,
    'attempt_id', v_attempt_id,
    'awarded_points', v_award,
    'is_correct', v_is_correct,
    'marked_at', v_marked_at,
    'correct_count', v_correct_count,
    'total_questions', v_total_questions,
    'score_percent', v_score_percent,
    'pending_count', v_pending
  );
END;
$$;
-- ---- clone_assessment_template ----
CREATE OR REPLACE FUNCTION public.clone_assessment_template(
  p_template_id  uuid,
  p_classroom_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller   uuid := (SELECT auth.uid());
  v_org_id   uuid;
  v_template assessments%ROWTYPE;
  v_new_id   uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Authoring is a teacher's job (decision 80), and it happens inside a
  -- classroom they actually teach (decision 81).
  IF NOT app.is_teacher() THEN
    RAISE EXCEPTION 'Only teachers can clone templates';
  END IF;

  IF NOT app.is_classroom_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'You do not teach this classroom';
  END IF;

  v_org_id := app.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no organization';
  END IF;

  SELECT * INTO v_template FROM assessments WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  IF NOT v_template.is_template THEN
    RAISE EXCEPTION 'Assessment is not a template: %', p_template_id;
  END IF;

  -- The template's pairing still gates WHO may use it: the target classroom
  -- must be of that grade and subject.
  IF NOT EXISTS (
    SELECT 1 FROM classrooms c
    WHERE c.id = p_classroom_id
      AND c.organization_id = v_org_id
      AND c.grade_level_id = v_template.grade_level_id
      AND c.subject_id = v_template.subject_id
  ) THEN
    RAISE EXCEPTION 'No classroom matches this template grade and subject';
  END IF;

  INSERT INTO assessments (
    organization_id, created_by, title, description,
    status, time_limit_seconds, shuffle_questions, is_template,
    classroom_id
  )
  VALUES (
    v_org_id, v_caller, v_template.title, v_template.description,
    'draft', v_template.time_limit_seconds, v_template.shuffle_questions, false,
    p_classroom_id
  )
  RETURNING id INTO v_new_id;

  -- Difficulty rides along; `banked_question_id` deliberately does NOT. The
  -- clone is a teacher's copy in their own classroom, and it must never be
  -- able to write back into the admin bank.
  INSERT INTO assessment_questions (
    assessment_id, payload, position, points, difficulty
  )
  SELECT v_new_id, aq.payload, aq.position, aq.points, aq.difficulty
  FROM assessment_questions aq
  WHERE aq.assessment_id = p_template_id;

  RETURN v_new_id;
END;
$$;
-- ------------------------------------------------------------
-- 4. Publishing an admin template contributes its questions to the bank.
--
--    Publish, not insert: adding a question inserts an "Untitled Question"
--    placeholder immediately and the card autosaves into it, so banking at
--    insert would bank an empty question. Publishing is the moment the admin
--    says the template is finished.
--
--    Contributing is a COPY in the same one-way sense as taking a question OUT
--    of the bank (P13a): after this runs the two rows are independent, and a
--    later edit to either leaves the other alone. `banked_question_id` makes a
--    re-publish add only what is new rather than duplicating the lot.
--
--    Definer, because `assessment_bank_questions` is admin-only under RLS and
--    this writes on the template author's behalf. Only `is_template` rows
--    reach here, and only an admin can create one, so a teacher's assessment
--    has no path into the bank.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bank_template_questions()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_question record;
  v_bank_id uuid;
BEGIN
  FOR v_question IN
    SELECT aq.id, aq.payload, aq.difficulty, aq.points
    FROM assessment_questions aq
    WHERE aq.assessment_id = NEW.id
      AND aq.banked_question_id IS NULL
    ORDER BY aq.position
  LOOP
    INSERT INTO assessment_bank_questions (
      payload, difficulty, grade_level_id, subject_id, points, created_by
    )
    VALUES (
      v_question.payload, v_question.difficulty, NEW.grade_level_id,
      NEW.subject_id, v_question.points, NEW.created_by
    )
    RETURNING id INTO v_bank_id;

    UPDATE assessment_questions
    SET banked_question_id = v_bank_id
    WHERE id = v_question.id;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bank_template_questions() IS
  'Contributes an admin template''s own questions to the assessment bank on publish (decision 88). Idempotent via assessment_questions.banked_question_id.';

-- Templates only, and only on the draft -> published edge. A template stays
-- editable after publishing, so re-publishing is a normal thing to do; the
-- WHEN clause keeps a plain re-save from firing this at all.
CREATE TRIGGER bank_template_questions_on_publish
  AFTER UPDATE OF status ON public.assessments
  FOR EACH ROW
  WHEN (
    NEW.is_template
    AND NEW.status = 'published'
    AND OLD.status IS DISTINCT FROM 'published'
    AND NEW.grade_level_id IS NOT NULL
    AND NEW.subject_id IS NOT NULL
  )
  EXECUTE FUNCTION public.bank_template_questions();
