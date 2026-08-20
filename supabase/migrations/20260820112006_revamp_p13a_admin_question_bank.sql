-- ============================================================
-- Clavis revamp — P13a: the admin assessment question bank
--
-- Decision 81: admin gets a bank of ASSESSMENT questions, distinct from the
-- practice `questions` bank. The two are deliberately separate:
--
--   * practice `questions` are filed under a sub_topic (that IS the learning
--     map's unit of progress), carry option tips, and stay mcq|mrq|
--     short_answer so the practice runner's binary grading holds.
--   * bank questions are exam items. They are filed under grade+subject only,
--     carry NO tips, and support all nine ad-hoc assessment types.
--
-- Shape: a bank question IS an ad-hoc payload. It reuses
-- `assessment_payload_is_valid()` verbatim, so the bank supports every type
-- the builder already offers and the grading trigger needs NO new branch.
-- `explanation` is optional in every payload variant, so "no tips and no
-- explanation" needs no new contract — the authoring UI simply omits them.
--
-- Composition is BY COPY, not by reference: picking a bank question into a
-- template copies its payload + points into assessment_questions. A later
-- bank edit therefore cannot mutate a published assessment or an in-flight
-- attempt, and cannot retroactively change released answers. This mirrors
-- how clone_assessment_template already copies rather than links.
--
-- Difficulty follows the MOE UASA format's `Aras Kesukaran`
-- (Rendah : Sederhana : Tinggi), which every primary subject except English
-- specifies at a 5:3:2 ratio — hence exactly three levels, not a 1-5 scale.
--
-- Access: admin-only, full stop. The bank is the template-authoring surface
-- and its payloads contain answer keys, so there is no read grant for org
-- staff or students and therefore no key-exposure path to close.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Difficulty vocabulary (MOE `Aras Kesukaran`)
-- ------------------------------------------------------------
CREATE TYPE public.question_difficulty AS ENUM ('low', 'medium', 'high');

COMMENT ON TYPE public.question_difficulty IS
  'MOE UASA Aras Kesukaran: low = Rendah, medium = Sederhana, high = Tinggi. The published format targets a 5:3:2 distribution.';

-- ------------------------------------------------------------
-- 2. bank_questions
-- ------------------------------------------------------------
CREATE TABLE public.bank_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Same contract as assessment_questions.payload, so a pick is a straight copy.
  payload jsonb NOT NULL
    CHECK (public.assessment_payload_is_valid(payload)),

  difficulty public.question_difficulty NOT NULL,

  -- Filed by grade + subject only. Sub-topics are the practice map's unit and
  -- deliberately do not reach the exam bank; tags carry the finer axis.
  grade_level_id uuid NOT NULL
    REFERENCES public.grade_levels(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL
    REFERENCES public.subjects(id) ON DELETE RESTRICT,

  -- Default mark carried into the assessment on pick; the builder may still
  -- re-point the copied question afterwards.
  points numeric NOT NULL DEFAULT 1 CHECK (points > 0),

  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_questions OWNER TO postgres;

COMMENT ON TABLE public.bank_questions IS
  'Admin-authored assessment question bank (decision 81). Separate from the practice `questions` bank: filed by grade+subject, no option tips, all nine ad-hoc types. Picked into a template BY COPY of payload+points.';

COMMENT ON COLUMN public.bank_questions.payload IS
  'Ad-hoc question payload, identical contract to assessment_questions.payload (assessment_payload_is_valid). Contains the answer key — admin-read only.';

-- The picker filters by grade+subject first, then difficulty.
CREATE INDEX idx_bank_questions_grade_subject
  ON public.bank_questions USING btree (grade_level_id, subject_id);
CREATE INDEX idx_bank_questions_difficulty
  ON public.bank_questions USING btree (difficulty);

CREATE TRIGGER update_bank_questions_updated_at
  BEFORE UPDATE ON public.bank_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- The subject must actually belong to the grade level (the curriculum is a
-- strict grade -> subject tree; a mismatched pair would make the question
-- unreachable through the picker's cascading filter).
CREATE OR REPLACE FUNCTION public.enforce_bank_question_curriculum()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.subjects s
    WHERE s.id = NEW.subject_id
      AND s.grade_level_id = NEW.grade_level_id
  ) THEN
    RAISE EXCEPTION 'Subject does not belong to this grade level';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_bank_question_curriculum() OWNER TO postgres;

COMMENT ON FUNCTION public.enforce_bank_question_curriculum() IS
  'Rejects a bank question whose subject is not a child of its grade level. Role independent: a BEFORE trigger also covers the admin FOR ALL and service_role paths.';

CREATE TRIGGER enforce_bank_question_curriculum
  BEFORE INSERT OR UPDATE OF grade_level_id, subject_id ON public.bank_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_bank_question_curriculum();

-- ------------------------------------------------------------
-- 3. bank_question_tags — reuses the existing admin `tags` vocabulary
-- ------------------------------------------------------------
CREATE TABLE public.bank_question_tags (
  bank_question_id uuid NOT NULL
    REFERENCES public.bank_questions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL
    REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bank_question_id, tag_id)
);

ALTER TABLE public.bank_question_tags OWNER TO postgres;

COMMENT ON TABLE public.bank_question_tags IS
  'Learning-point tags on a bank question (many-to-many), sharing the same admin-managed `tags` vocabulary as question_tags.';

CREATE INDEX idx_bank_question_tags_tag
  ON public.bank_question_tags USING btree (tag_id);

-- ------------------------------------------------------------
-- 4. Grants. Supabase grants ALL on new public tables to anon/authenticated
--    by default, so every revoke below is load-bearing. Table-level (not
--    column-level) grants are correct here: the table has no server-computed
--    column to protect, and RLS restricts every path to admin.
-- ------------------------------------------------------------
REVOKE ALL ON TABLE public.bank_questions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bank_questions TO authenticated;
GRANT ALL ON TABLE public.bank_questions TO service_role;

-- No UPDATE on the join table: the row is nothing but its primary key.
REVOKE ALL ON TABLE public.bank_question_tags FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.bank_question_tags TO authenticated;
GRANT ALL ON TABLE public.bank_question_tags TO service_role;

-- ------------------------------------------------------------
-- 5. RLS — admin only, both tables
-- ------------------------------------------------------------
ALTER TABLE public.bank_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_question_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bank questions"
  ON public.bank_questions
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Admins manage bank question tags"
  ON public.bank_question_tags
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

-- ------------------------------------------------------------
-- 6. Storage: bank question images live in the EXISTING assessment-images
--    bucket under a `bank/` prefix.
--
--    Same bucket is the point: picking a bank question copies its payload
--    verbatim, image_path included, so nothing rewrites the path and no
--    storage object is duplicated. The bucket is already public-read, so a
--    student renders the copied image mid-attempt with no new policy.
--
--    P10a's helper maps `<assessment_id>/...` to that assessment's write
--    authz and denies anything whose first segment is not a uuid — which
--    would deny `bank/...`. Extend it with the admin-only bank branch.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.can_write_assessment_image(p_object_name text)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
  SELECT CASE
    -- assessment-images/bank/<bank_question_id>/... — the admin bank.
    WHEN (storage.foldername(p_object_name))[1] = 'bank'
      THEN app.is_admin()
    WHEN (storage.foldername(p_object_name))[1]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN app.can_write_assessment(((storage.foldername(p_object_name))[1])::uuid)
    ELSE false
  END;
$$;

COMMENT ON FUNCTION app.can_write_assessment_image(text) IS
  'Storage RLS helper for the assessment-images bucket. `bank/...` is the admin question bank (admin only); `<assessment_id>/...` follows that assessment''s write authz (app.can_write_assessment). False for anything else.';
