-- ============================================================
-- Clavis revamp — P24a: the assessment product is removed.
--
-- Clavis is practice and classrooms. The item bank, papers, the generator,
-- deliveries, attempts, marking and answer release are no longer part of
-- the product, so what they stored and every function that served them go
-- with them rather than linger as surface nothing reaches.
--
--   D1  Eleven tables go, rows and all: the item bank and its tags, papers
--       and their items, assessments with their frozen questions and their
--       assignments, attempts with their questions and answers — and
--       sub_topics, which existed only to file bank items. Practice files
--       under stages. Learning points (tags, tag_topics, question_tags) stay:
--       practice questions carry them.
--   D2  Forty-one functions go: every RPC, trigger function, generator
--       internal and RLS helper that only assessments called. That includes
--       app.is_teacher(), app.has_matching_classroom() and
--       app.teacher_shares_classroom_with_student(): general by name, but
--       nothing that survives calls them.
--   D3  `long_answer` was the one item type that needs a marker, and there
--       is no marker left. The validator and the grader forget it, so
--       public.item_payload_is_valid accepts exactly the fourteen practice
--       types and questions_payload_check no longer narrows a list of its
--       own: the validator is the rule.
--   D4  The dashboards report practice only. get_student_rollups,
--       get_class_rollups, get_org_overview and get_platform_totals lose
--       their assessment columns; a student is at risk on low mastery or no
--       recent practice, and "last activity" is the latest practice session.
--       Who may call them, and what each caller sees, is unchanged.
--   D5  The `assessment-images` storage policies go. The bucket itself is
--       deleted by hand (section 1).
--   D6  What survives stops naming what is gone: three comments, and two
--       CHECK names student_stage_stats kept from before P19a.
--
-- DESTRUCTIVE: drops tables that hold data wherever assessments were used.
--
-- Nothing here is a compatibility layer: no table is kept empty, no column
-- is kept NULL and no function is kept as a stub.
-- ============================================================

-- ------------------------------------------------------------
-- 1. assessment-images storage policies (D5)
--
-- They go first: the three write policies call
-- app.can_write_assessment_image(), dropped in section 4.
--
-- The bucket itself is deleted by hand from the dashboard once its objects
-- are cleared (as the announcement-images bucket was in P15a). A DELETE on
-- storage.buckets from SQL is refused unless storage.allow_delete_query is
-- set, and it would leave the files of a bucket that still holds any.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Assessment images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Assessment authors can upload assessment images" ON storage.objects;
DROP POLICY IF EXISTS "Assessment authors can update assessment images" ON storage.objects;
DROP POLICY IF EXISTS "Assessment authors can delete assessment images" ON storage.objects;

-- ------------------------------------------------------------
-- 2. The RPCs and the generator (D2)
--
-- Before the tables: app.pick_bank_questions returns
-- SETOF assessment_bank_questions, so the table cannot go while it stands.
-- ------------------------------------------------------------

-- Sitting an assessment.
DROP FUNCTION public.start_assessment_attempt(uuid);
DROP FUNCTION public.get_attempt_questions(uuid);
DROP FUNCTION public.complete_assessment_attempt(uuid);
DROP FUNCTION public.get_attempt_result(uuid);

-- Marking, releasing answers, following completion.
DROP FUNCTION public.mark_attempt_answer(uuid, numeric, text);
DROP FUNCTION public.release_assessment_answers(uuid, boolean);
DROP FUNCTION public.get_assessment_completion(uuid);

-- Delivering a paper to a classroom.
DROP FUNCTION public.deliver_paper(uuid, uuid, text);
DROP FUNCTION public.publish_assessment(uuid);

-- The paper library.
DROP FUNCTION public.adopt_paper(uuid);
DROP FUNCTION public.get_paper_items(uuid);
DROP FUNCTION public.get_paper_pairings();
DROP FUNCTION public.reorder_paper_items(uuid, uuid[]);

-- The generator and its internals.
DROP FUNCTION public.generate_paper(text, jsonb);
DROP FUNCTION public.regenerate_paper_item(uuid, uuid);
DROP FUNCTION app.validate_generation_spec(jsonb);
DROP FUNCTION app.generation_line_sub_topics(jsonb);
DROP FUNCTION app.generation_line_tags(jsonb);
DROP FUNCTION app.allocate_difficulty_mix(integer, jsonb);
DROP FUNCTION app.pick_bank_questions(uuid, uuid[], uuid[], public.question_difficulty, uuid[], integer);

-- Sub-topics.
DROP FUNCTION public.reorder_sub_topics(uuid, uuid[]);

-- ------------------------------------------------------------
-- 3. The tables (D1)
--
-- Children before parents. Each table takes its own policies, triggers,
-- indexes and constraints with it; nothing outside these eleven references
-- any of them, so no CASCADE is needed.
-- ------------------------------------------------------------
DROP TABLE public.attempt_answers;
DROP TABLE public.attempt_questions;
DROP TABLE public.assessment_attempts;
DROP TABLE public.assessment_assignments;
DROP TABLE public.assessment_questions;
DROP TABLE public.assessments;
DROP TABLE public.paper_items;
DROP TABLE public.papers;
DROP TABLE public.assessment_bank_question_tags;
DROP TABLE public.assessment_bank_questions;
DROP TABLE public.sub_topics;

-- draft / published, of an assessment and of a paper.
DROP TYPE public.assessment_status;

-- ------------------------------------------------------------
-- 4. What the tables were holding up (D2)
--
-- The trigger functions lost their triggers and the RLS helpers their
-- policies in section 3. A helper goes before the helpers it calls.
-- ------------------------------------------------------------

-- Trigger functions.
DROP FUNCTION public.grade_attempt_answer();
DROP FUNCTION public.enforce_attempt_time_limit();
DROP FUNCTION public.enforce_assignment_scope();
DROP FUNCTION public.enforce_assessment_publish_once();
DROP FUNCTION public.enforce_paper_item_owner();
DROP FUNCTION public.enforce_bank_question_refile();

-- Scoring.
DROP FUNCTION app.recompute_attempt_score(uuid);

-- RLS helpers.
DROP FUNCTION app.can_read_attempt(uuid);
DROP FUNCTION app.student_assessment_visible(uuid);
DROP FUNCTION app.can_mark_assessment(uuid);
DROP FUNCTION app.can_write_assessment_image(text);
DROP FUNCTION app.can_write_assessment(uuid);
DROP FUNCTION app.assessment_org_id(uuid);
DROP FUNCTION app.assessment_item_org_id(uuid);
DROP FUNCTION app.can_write_paper(uuid);
DROP FUNCTION app.paper_readable(uuid);
DROP FUNCTION app.paper_org_id(uuid);
DROP FUNCTION app.has_matching_classroom(uuid, uuid);
DROP FUNCTION app.teacher_shares_classroom_with_student(uuid);

-- No policy and no function is written for teachers alone any more; the
-- role is still read where it matters (profiles.user_type, app.is_org_staff).
DROP FUNCTION app.is_teacher();

-- ------------------------------------------------------------
-- 5. `long_answer` is not an item type (D3)
--
-- Both functions are P23a's and P23b's, whole, less the one branch: the
-- validator's long_answer block and the grader's "pending, never
-- auto-graded" return. A long_answer payload is now what any unknown type
-- is — invalid to store, and 0 of 0 if it were ever marked.
--
-- Same signatures, so CREATE OR REPLACE keeps owner and grants.
-- ------------------------------------------------------------

-- 5.1 The validator.
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

  -- Unknown type.
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.item_payload_is_valid(jsonb) IS
  'Structural validation of an item payload — the schema a practice question stores. Fourteen types: mcq, mrq, pick_words, true_false, tick_table, cloze, short_answer, word_completion, numeric (forms number, money, fraction, mixed, ratio, time, measure), matching, ordering, rearrange, classify, label_picture. Optional image_path and tip on every type (image_path is required for label_picture). Backs the payload CHECK on questions. Mirrored by the app''s zod schema (src/lib/items/schema.ts). Never raises: an unrecognised or malformed payload is simply invalid.';

-- 5.2 The validator's types are practice's types, so the CHECK stops
--     spelling out a list of its own to keep long_answer out.
ALTER TABLE public.questions DROP CONSTRAINT questions_payload_check;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_payload_check CHECK (public.item_payload_is_valid(payload));

-- 5.3 The grader.
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
  'The one item grader (P21-D4, P23b). Returns how many gradable parts the item has (total) and how many the response got right (correct): x of 1 for mcq/true_false/short_answer/word_completion/numeric/rearrange; a part a correct option for mrq/pick_words (right picks minus wrong picks, never below 0); per blank/pair/position/row/item/label for cloze/matching/ordering/tick_table/classify/label_picture; 0 of 0 when ungradable. Pure and never raises. Internal to practice marking.';

-- ------------------------------------------------------------
-- 6. The dashboards report practice only (D4)
--
-- Each function is its latest definition (P19a for the two rollups, P6a for
-- the two admin ones) less its assessment columns and the CTEs that fed
-- them. The authorization in each body is untouched.
--
-- Three of them lose RETURNS TABLE columns, which CREATE OR REPLACE cannot
-- express: dropped and re-created, with the grants they had.
-- get_platform_totals returns jsonb and is replaced in place.
-- ------------------------------------------------------------

-- 6.1 get_student_rollups — one row per student.
--
--    at_risk = average best score under 50, or no practice in 14 days
--              (never practised counts). An overdue assignment used to be
--              a third reason.
DROP FUNCTION public.get_student_rollups(uuid, uuid);

CREATE FUNCTION public.get_student_rollups(
  p_classroom_id    uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  student_id           uuid,
  student_name         text,
  username             text,
  map_mastery          numeric,
  stages_attempted     integer,
  stages_completed     integer,
  last_practice_at     timestamptz,
  at_risk              boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid           uuid := (SELECT auth.uid());
  v_role          public.user_role;
  v_org           uuid;
  v_classroom_org uuid;
  -- At-risk thresholds (decision 36) — tune here.
  c_mastery_floor constant numeric  := 50;                 -- avg best_score below this = at risk
  c_stale_window  constant interval := interval '14 days'; -- no practice in this window = at risk
  c_star_floor    constant integer  := 60;                 -- best_score >= this = >=1 star (completed)
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.user_type, p.organization_id INTO v_role, v_org
  FROM profiles p WHERE p.id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_role NOT IN ('admin', 'manager', 'teacher') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_classroom_id IS NOT NULL THEN
    SELECT c.organization_id INTO v_classroom_org FROM classrooms c WHERE c.id = p_classroom_id;
    IF v_classroom_org IS NULL THEN
      RAISE EXCEPTION 'Classroom not found: %', p_classroom_id;
    END IF;
    -- Teacher must teach this classroom; manager must own its org; admin unrestricted.
    IF NOT (
         v_role = 'admin'
      OR (v_role = 'manager' AND v_org = v_classroom_org)
      OR (v_role = 'teacher' AND (SELECT app.is_classroom_teacher(p_classroom_id)))
    ) THEN
      RAISE EXCEPTION 'Not authorized to view this classroom';
    END IF;
  ELSIF v_role = 'admin' AND p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required for platform admins';
  END IF;

  RETURN QUERY
  WITH targets AS (
    SELECT sp.id AS student_id, p.name AS student_name, sp.username AS username
    FROM student_profiles sp
    JOIN profiles p ON p.id = sp.id
    WHERE
      (p_classroom_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM classroom_students cs
                    WHERE cs.classroom_id = p_classroom_id AND cs.student_id = sp.id))
      OR
      (p_classroom_id IS NULL AND (
           (v_role = 'admin'   AND p.organization_id = p_organization_id)
        OR (v_role = 'manager' AND p.organization_id = v_org)
        OR (v_role = 'teacher' AND EXISTS (
              SELECT 1 FROM classroom_students cs
              JOIN classroom_teachers ct ON ct.classroom_id = cs.classroom_id
              WHERE cs.student_id = sp.id AND ct.teacher_id = v_uid))
      ))
  ),
  base AS (
    SELECT
      t.student_id,
      t.student_name,
      t.username,
      (SELECT ROUND(AVG(st.best_score_percent), 1)
         FROM student_stage_stats st WHERE st.student_id = t.student_id) AS map_mastery,
      (SELECT COUNT(*)::integer
         FROM student_stage_stats st WHERE st.student_id = t.student_id) AS stages_attempted,
      (SELECT COUNT(*)::integer
         FROM student_stage_stats st
         WHERE st.student_id = t.student_id
           AND st.best_score_percent >= c_star_floor) AS stages_completed,
      (SELECT MAX(ps.created_at)
         FROM practice_sessions ps WHERE ps.student_id = t.student_id) AS last_practice_at
    FROM targets t
  )
  SELECT
    b.student_id,
    b.student_name,
    b.username,
    b.map_mastery,
    b.stages_attempted,
    b.stages_completed,
    b.last_practice_at,
    (
         (b.map_mastery IS NOT NULL AND b.map_mastery < c_mastery_floor)
      OR (b.last_practice_at IS NULL OR b.last_practice_at < now() - c_stale_window)
    ) AS at_risk
  FROM base b
  ORDER BY b.student_name;
END;
$$;

ALTER FUNCTION public.get_student_rollups(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_student_rollups(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_rollups(uuid, uuid) TO authenticated;

-- 6.2 get_class_rollups — one row per classroom.
DROP FUNCTION public.get_class_rollups(uuid);

CREATE FUNCTION public.get_class_rollups(p_organization_id uuid DEFAULT NULL)
RETURNS TABLE (
  classroom_id         uuid,
  classroom_name       text,
  grade_level_id       uuid,
  grade_level_name     text,
  subject_id           uuid,
  subject_name         text,
  teacher_count        integer,
  student_count        integer,
  avg_map_mastery      numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role public.user_role;
  v_org  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.user_type, p.organization_id INTO v_role, v_org
  FROM profiles p WHERE p.id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_role NOT IN ('admin', 'manager', 'teacher') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_role = 'admin' AND p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required for platform admins';
  END IF;

  RETURN QUERY
  WITH cls AS (
    SELECT c.id, c.name, c.grade_level_id, c.subject_id
    FROM classrooms c
    WHERE (v_role = 'admin'   AND c.organization_id = p_organization_id)
       OR (v_role = 'manager' AND c.organization_id = v_org)
       OR (v_role = 'teacher' AND EXISTS (
             SELECT 1 FROM classroom_teachers ct
             WHERE ct.classroom_id = c.id AND ct.teacher_id = v_uid))
  ),
  mem AS (
    SELECT cs.classroom_id, cs.student_id
    FROM classroom_students cs
    JOIN cls ON cls.id = cs.classroom_id
  ),
  student_counts AS (
    SELECT m.classroom_id, COUNT(*) AS n FROM mem m GROUP BY m.classroom_id
  ),
  teacher_counts AS (
    SELECT ct.classroom_id, COUNT(*) AS n
    FROM classroom_teachers ct
    JOIN cls ON cls.id = ct.classroom_id
    GROUP BY ct.classroom_id
  ),
  per_student AS (
    SELECT m.classroom_id, m.student_id, AVG(st.best_score_percent) AS mastery
    FROM mem m
    JOIN student_stage_stats st ON st.student_id = m.student_id
    GROUP BY m.classroom_id, m.student_id
  ),
  class_mastery AS (
    SELECT ps.classroom_id, ROUND(AVG(ps.mastery), 1) AS avg_mastery
    FROM per_student ps GROUP BY ps.classroom_id
  )
  SELECT
    c.id,
    c.name,
    c.grade_level_id,
    gl.name,
    c.subject_id,
    s.name,
    COALESCE(tc.n, 0)::integer,
    COALESCE(sc.n, 0)::integer,
    cm2.avg_mastery
  FROM cls c
  JOIN grade_levels gl ON gl.id = c.grade_level_id
  JOIN subjects s ON s.id = c.subject_id
  LEFT JOIN student_counts sc  ON sc.classroom_id  = c.id
  LEFT JOIN teacher_counts tc  ON tc.classroom_id  = c.id
  LEFT JOIN class_mastery  cm2 ON cm2.classroom_id = c.id
  ORDER BY c.name;
END;
$$;

ALTER FUNCTION public.get_class_rollups(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_class_rollups(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_rollups(uuid) TO authenticated;

-- 6.3 get_org_overview — platform admin only. last_activity_at is the
--     center's latest practice session.
DROP FUNCTION public.get_org_overview();

CREATE FUNCTION public.get_org_overview()
RETURNS TABLE (
  organization_id   uuid,
  organization_name text,
  teacher_count     integer,
  manager_count     integer,
  student_count     integer,
  classroom_count   integer,
  last_activity_at  timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role public.user_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.user_type INTO v_role FROM profiles p WHERE p.id = v_uid;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only platform admins may view the organization overview';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    (SELECT COUNT(*)::integer FROM profiles p WHERE p.organization_id = o.id AND p.user_type = 'teacher'),
    (SELECT COUNT(*)::integer FROM profiles p WHERE p.organization_id = o.id AND p.user_type = 'manager'),
    (SELECT COUNT(*)::integer FROM profiles p WHERE p.organization_id = o.id AND p.user_type = 'student'),
    (SELECT COUNT(*)::integer FROM classrooms c WHERE c.organization_id = o.id),
    (SELECT MAX(ps.created_at) FROM practice_sessions ps
       JOIN profiles p ON p.id = ps.student_id WHERE p.organization_id = o.id)
  FROM organizations o
  ORDER BY o.name;
END;
$$;

ALTER FUNCTION public.get_org_overview() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_org_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_overview() TO authenticated;

-- 6.4 get_platform_totals — platform admin only.
CREATE OR REPLACE FUNCTION public.get_platform_totals()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role public.user_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.user_type INTO v_role FROM profiles p WHERE p.id = v_uid;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only platform admins may view platform totals';
  END IF;

  RETURN jsonb_build_object(
    'org_count',        (SELECT COUNT(*) FROM organizations),
    'manager_count',    (SELECT COUNT(*) FROM profiles WHERE user_type = 'manager'),
    'teacher_count',    (SELECT COUNT(*) FROM profiles WHERE user_type = 'teacher'),
    'student_count',    (SELECT COUNT(*) FROM profiles WHERE user_type = 'student'),
    'classroom_count',  (SELECT COUNT(*) FROM classrooms),
    'last_activity_at', (SELECT MAX(created_at) FROM practice_sessions)
  );
END;
$$;

-- ------------------------------------------------------------
-- 7. What the survivors say about themselves (D6)
-- ------------------------------------------------------------
COMMENT ON FUNCTION app.sanitize_item_payload(jsonb, text, text) IS
  'The one item sanitizer (P21-D6, P23b): the content a runner may show, and never a key or a tip. Emits type, question, image_path + image_bucket, options[{number, text, image_path, image_bucket}], plus by type: labels (true_false); form, unit, units, clock, terms (numeric); length, first_letter (word_completion); text, mode, reuse, blanks[{index, choices?}], bank (cloze); left, right (matching); items (ordering, rearrange); groups, items (tick_table, classify); markers[{id, number, x, y}], mode, bank (label_picture). Lists a pupil must not see in the builder''s order are scrambled by md5(seed || id). Internal to the practice content RPCs.';

COMMENT ON TABLE public.stages IS
  'The practice path under a topic: ordered stages, each holding its own practice questions. Practice questions, sessions, cycle progress and learning-map stats all reference stages. display_order defines the map order.';

COMMENT ON TABLE public.topics IS
  'Topics within a subject. Part of curriculum hierarchy: grade_levels -> subjects -> topics -> stages';

-- student_stage_stats was student_sub_topic_stats until P19a, and two of its
-- CHECKs still said so: the last of the name in the schema.
ALTER TABLE public.student_stage_stats
  RENAME CONSTRAINT student_sub_topic_stats_best_score_percent_check
  TO student_stage_stats_best_score_percent_check;
ALTER TABLE public.student_stage_stats
  RENAME CONSTRAINT student_sub_topic_stats_sessions_completed_check
  TO student_stage_stats_sessions_completed_check;
