-- ============================================================================
-- Revamp 2.6 — P10a: images on ad-hoc assessment questions and options
--
-- Decision 74. Today only the practice bank carries images (questions.image_path
-- + questions.option_N_image_path, both stored in the `question-images` bucket);
-- ad-hoc / template question payloads support none at all, so an admin building
-- a template cannot show a diagram, and staff cannot author picture options.
--
-- This migration adds, at the DB layer:
--
--   1. An OPTIONAL `image_path` on EVERY ad-hoc payload type, and an optional
--      `image_path` on each entry of `options[]` for mcq / mrq. Both are plain
--      storage object paths inside the new bucket. Item-level images for
--      matching / ordering are deliberately out of scope this round.
--      The keys stay optional, so every existing payload remains valid — the
--      CHECK is only ever stricter for payloads that actually carry the key.
--
--   2. A dedicated `assessment-images` bucket: PUBLIC read (students must render
--      the image mid-attempt, and every other image bucket in this project is
--      public-read so src/lib/storage.ts's getPublicUrl helpers work unchanged),
--      writes gated by the SAME authz as a question write — app.can_write_assessment
--      on the assessment whose id is the object's first folder segment. Path
--      convention: `{assessment_id}/{uuid}.{ext}`.
--
--   3. Image emission from the two sanitizing RPCs. Images are CONTENT, not keys:
--      get_attempt_questions must ship them or the runner renders a question with
--      a missing diagram, and get_attempt_result must ship them so the review /
--      marking screens can show what the student saw. Alongside each `image_path`
--      the RPCs emit `image_bucket`, because a bank question's image lives in
--      `question-images` while an ad-hoc one lives in `assessment-images` and the
--      sanitized payload otherwise gives the client no way to tell them apart.
--      No existing sanitization is weakened: no key, answer, tip or raw payload
--      is added to either RPC.
-- ============================================================================


-- ============================================================
-- SECTION 1 — payload contract: optional images
--
-- Contract delta (everything else is unchanged from P9a):
--
--   every type   {..., image_path?: non-blank string | null}
--   mcq | mrq    {..., options:[{text, is_correct?, image_path?: non-blank string | null}]}
--
-- `image_path` may be absent, JSON null (= no image, so a client that always
-- sends the key does not have to strip it) or a non-blank string. Anything else
-- — a number, an object, "" or "   " — is rejected, the same way `unit`,
-- `tolerance` and `rubric` are handled.
--
-- The function body below is P9a's, byte-identical except for the two blocks
-- marked "P10a". The CHECK constraint is NOT re-added: replacing the function
-- is enough for future writes, and re-validating every existing row would buy
-- nothing here (no row can carry an image_path yet) while risking an abort on
-- unverified prod content.
-- ============================================================
CREATE OR REPLACE FUNCTION public.assessment_payload_is_valid(p jsonb)
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
    ) THEN RETURN false; END IF;

    -- A question with no correct option can never be answered correctly.
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p->'options') AS e(elem)
      WHERE e.elem->'is_correct' = 'true'::jsonb
    ) THEN RETURN false; END IF;

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

COMMENT ON FUNCTION public.assessment_payload_is_valid(jsonb) IS
  'Structural validation of an ad-hoc assessment_questions.payload (decisions 65-67, images 74). Backs the assessment_questions_payload_shape CHECK. Never raises: an unrecognised or malformed payload is simply invalid.';

COMMENT ON COLUMN public.assessment_questions.payload IS
  'Ad-hoc question, one of: mcq | mrq | true_false | numeric | short_answer | cloze | matching | ordering | long_answer. Every type may carry an optional image_path (storage path in the assessment-images bucket); mcq/mrq options may each carry one too. Shape enforced by assessment_payload_is_valid(); see the P10A handoff for the per-type contract. Staff-read only — students receive sanitized content through get_attempt_questions().';


-- ============================================================
-- SECTION 2 — `assessment-images` storage bucket (decision 74)
--
-- Read model: PUBLIC, exactly like avatars / question-images / option-images /
-- curriculum-images / badges. Students must render a question image mid-attempt
-- and src/lib/storage.ts resolves every image with getPublicUrl(); signed URLs
-- would need a different helper on every surface and buy nothing, since an
-- assessment image is not an answer key.
--
-- Write model: the object's FIRST folder segment is the assessment id, and the
-- writer must pass app.can_write_assessment() on it — i.e. exactly the authz
-- that governs writing the question the image belongs to (admin anywhere incl.
-- templates, manager org-wide, teacher on assessments they created). A flat
-- bucket-wide staff grant would let any teacher in any org overwrite or delete
-- another org's images.
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('assessment-images', 'assessment-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
WHERE id = 'assessment-images';

-- Object name -> assessment id -> question-write authz. The CASE guard keeps a
-- non-uuid folder from ever reaching the cast (a raise inside an RLS policy
-- would surface as an error instead of a denial).
CREATE OR REPLACE FUNCTION app.can_write_assessment_image(p_object_name text)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_object_name))[1]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN app.can_write_assessment(((storage.foldername(p_object_name))[1])::uuid)
    ELSE false
  END;
$$;

ALTER FUNCTION app.can_write_assessment_image(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.can_write_assessment_image(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_write_assessment_image(text) FROM anon;
GRANT EXECUTE ON FUNCTION app.can_write_assessment_image(text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.can_write_assessment_image(text) TO service_role;

COMMENT ON FUNCTION app.can_write_assessment_image(text) IS
  'Storage RLS helper: may the caller write assessment-images/<assessment_id>/... ? Same authz as writing that assessment''s questions (app.can_write_assessment). False for any object whose first folder segment is not a uuid.';

DROP POLICY IF EXISTS "Assessment images are publicly accessible" ON storage.objects;
CREATE POLICY "Assessment images are publicly accessible"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'assessment-images');

DROP POLICY IF EXISTS "Assessment authors can upload assessment images" ON storage.objects;
CREATE POLICY "Assessment authors can upload assessment images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'assessment-images'
    AND app.can_write_assessment_image(name)
  );

DROP POLICY IF EXISTS "Assessment authors can update assessment images" ON storage.objects;
CREATE POLICY "Assessment authors can update assessment images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'assessment-images'
    AND app.can_write_assessment_image(name)
  )
  WITH CHECK (
    bucket_id = 'assessment-images'
    AND app.can_write_assessment_image(name)
  );

DROP POLICY IF EXISTS "Assessment authors can delete assessment images" ON storage.objects;
CREATE POLICY "Assessment authors can delete assessment images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'assessment-images'
    AND app.can_write_assessment_image(name)
  );


-- ============================================================
-- SECTION 3 — get_attempt_questions: emit images
--
-- Unchanged contract: attempt owner only, never a key, per-attempt scramble of
-- `right` / `items`. P9a already emitted `image_path` for BANK questions and
-- options (and a hardcoded NULL for ad-hoc options); this adds the ad-hoc
-- payload images and, next to every image, the bucket that holds it:
--
--   bank question / option  -> "question-images"   (where the bank UI uploads)
--   ad-hoc question / option-> "assessment-images"
--   no image                -> image_path NULL, image_bucket NULL
--
-- A blank or non-string payload image_path is treated as no image (the CHECK
-- already rejects those on write; this keeps a hand-edited row harmless).
-- ============================================================
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
        'type', COALESCE(bank.type::text, aq.payload->>'type'),
        'question', COALESCE(bank.question, aq.payload->>'question'),
        'image_path', CASE
          WHEN aq.question_id IS NOT NULL THEN bank.image_path
          WHEN jsonb_typeof(aq.payload->'image_path') = 'string'
               AND btrim(aq.payload->>'image_path') <> ''
            THEN aq.payload->>'image_path'
          ELSE NULL::text
        END,
        'image_bucket', CASE
          WHEN aq.question_id IS NOT NULL THEN
            CASE WHEN bank.image_path IS NOT NULL THEN 'question-images' ELSE NULL::text END
          WHEN jsonb_typeof(aq.payload->'image_path') = 'string'
               AND btrim(aq.payload->>'image_path') <> ''
            THEN 'assessment-images'
          ELSE NULL::text
        END,
        'options', CASE
          WHEN bank.id IS NOT NULL THEN (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'number', o.opt_number,
                  'text', o.opt_text,
                  'image_path', o.opt_image,
                  'image_bucket', CASE WHEN o.opt_image IS NOT NULL
                                       THEN 'question-images' ELSE NULL::text END
                )
                ORDER BY o.opt_number
              ),
              '[]'::jsonb
            )
            FROM (
              VALUES
                (1, bank.option_1_text, bank.option_1_image_path),
                (2, bank.option_2_text, bank.option_2_image_path),
                (3, bank.option_3_text, bank.option_3_image_path),
                (4, bank.option_4_text, bank.option_4_image_path)
            ) AS o(opt_number, opt_text, opt_image)
            WHERE btrim(COALESCE(o.opt_text, '')) <> '' OR o.opt_image IS NOT NULL
          )
          ELSE (
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
        END
      )
      || CASE
           WHEN aq.question_id IS NOT NULL THEN '{}'::jsonb

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
    LEFT JOIN questions bank ON bank.id = aq.question_id
    WHERE atq.attempt_id = p_attempt_id
  ) x;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_attempt_questions(uuid) IS
  'Sanitized question snapshot for one attempt (owner only). Emits the per-type content the runner needs — including question/option images as image_path + image_bucket — and never a key: no is_correct, answer, accepted_answers, tolerance, blanks.accepted, pairs, correct_order, explanation or raw payload.';


-- ============================================================
-- SECTION 4 — get_attempt_result: carry images on both paths
--
-- P9b's body, unchanged except that every question now also carries:
--
--   image_path    text|null    the question image (bank or ad-hoc)
--   image_bucket  text|null    "question-images" | "assessment-images"
--   option_images jsonb array  [{number, image_path, image_bucket}] — ONLY the
--                              options that actually have an image, so the
--                              review / marking screen can render a picture
--                              option next to the student's choice.
--
-- Images are content, not correctness: they are emitted for staff AND for the
-- owner regardless of the release gate and regardless of score withholding
-- (the student saw them during the attempt). Option TEXT is deliberately not
-- duplicated here — the student review page already has it from
-- get_attempt_questions, and staff read the payload directly.
-- ============================================================
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
          WHEN aq.question_id IS NOT NULL THEN bank.image_path
          WHEN jsonb_typeof(aq.payload->'image_path') = 'string'
               AND btrim(aq.payload->>'image_path') <> ''
            THEN aq.payload->>'image_path'
          ELSE NULL::text
        END,
        'image_bucket', CASE
          WHEN aq.question_id IS NOT NULL THEN
            CASE WHEN bank.image_path IS NOT NULL THEN 'question-images' ELSE NULL::text END
          WHEN jsonb_typeof(aq.payload->'image_path') = 'string'
               AND btrim(aq.payload->>'image_path') <> ''
            THEN 'assessment-images'
          ELSE NULL::text
        END,
        'option_images', CASE
          WHEN aq.question_id IS NOT NULL THEN (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'number', o.opt_number,
                  'image_path', o.opt_image,
                  'image_bucket', 'question-images'
                )
                ORDER BY o.opt_number
              ),
              '[]'::jsonb
            )
            FROM (
              VALUES
                (1, bank.option_1_image_path),
                (2, bank.option_2_image_path),
                (3, bank.option_3_image_path),
                (4, bank.option_4_image_path)
            ) AS o(opt_number, opt_image)
            WHERE o.opt_image IS NOT NULL
          )
          ELSE (
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
          )
        END,
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
               WHEN aq.question_id IS NOT NULL THEN
                 CASE
                   WHEN bank.type::text = 'short_answer' THEN
                     jsonb_build_object(
                       'accepted_answers',
                       CASE WHEN bank.answer IS NULL THEN '[]'::jsonb
                            ELSE jsonb_build_array(bank.answer) END
                     )
                   ELSE
                     jsonb_build_object('correct_options', (
                       SELECT COALESCE(jsonb_agg(o.opt_num ORDER BY o.opt_num), '[]'::jsonb)
                       FROM (VALUES
                         (1, bank.option_1_is_correct),
                         (2, bank.option_2_is_correct),
                         (3, bank.option_3_is_correct),
                         (4, bank.option_4_is_correct)
                       ) AS o(opt_num, is_correct)
                       WHERE o.is_correct IS TRUE
                     ))
                 END

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
                  WHEN aq.question_id IS NULL
                   AND jsonb_typeof(aq.payload->'explanation') = 'string'
                    THEN jsonb_build_object('explanation', aq.payload->>'explanation')
                  ELSE '{}'::jsonb
                END
           )
         END AS item
    FROM attempt_questions atq
    JOIN assessment_questions aq ON aq.id = atq.assessment_question_id
    LEFT JOIN questions bank ON bank.id = aq.question_id
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

COMMENT ON FUNCTION public.get_attempt_result(uuid) IS
  'Attempt result, gated: owner after submission (keys only once answers_released_at is set; no score at all while marking is pending if show_auto_score_while_pending is false), org staff any time with full visibility. Question/option images (image_path + image_bucket + option_images) are content and are never gated. is_correct NULL = awaiting marking.';
