-- ============================================================
-- Clavis 2.3 revamp — P7a part 2/2: question learning-point tags
--
-- Decision 57: a reusable, platform-global learning-point vocabulary.
--   * tags(id, name unique lowercased/trimmed, created_at) — admin-managed
--     (curriculum is global/admin-owned).
--   * question_tags(question_id, tag_id, PK both) — many-to-many. A question
--     carries multiple tags; a tag is reused across questions.
--   * RLS: admin CRUD both; SELECT to all authenticated (labels are
--     non-sensitive and enable later analytics; not student-blocking).
--
-- Independent of the templates migration (no ordering dependency).
-- ============================================================

-- ------------------------------------------------------------
-- 1. tags — normalized (lowercased + trimmed) unique vocabulary
-- ------------------------------------------------------------
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
    CHECK (name = lower(btrim(name)) AND name <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tags OWNER TO postgres;

COMMENT ON TABLE public.tags IS
  'Platform-global learning-point vocabulary, admin-managed. name is stored lowercased + trimmed and is unique.';

-- ------------------------------------------------------------
-- 2. question_tags — many-to-many join (PK is the pair, no UPDATE)
-- ------------------------------------------------------------
CREATE TABLE public.question_tags (
  question_id uuid NOT NULL
    REFERENCES public.questions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL
    REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, tag_id)
);

ALTER TABLE public.question_tags OWNER TO postgres;

COMMENT ON TABLE public.question_tags IS
  'Learning-point tags on a question (many-to-many). Admin-managed.';

-- The PK covers question_id-first lookups; index the reverse direction
-- (all questions carrying a tag) for later tag analytics.
CREATE INDEX idx_question_tags_tag ON public.question_tags USING btree (tag_id);

-- ------------------------------------------------------------
-- 3. Grants. Supabase's default privileges grant ALL on new public tables
--    to anon/authenticated, so every revoke below is load-bearing. Writes
--    are RLS-gated to admin; SELECT is open to authenticated.
-- ------------------------------------------------------------
REVOKE ALL ON TABLE public.tags FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tags TO authenticated;
GRANT ALL ON TABLE public.tags TO service_role;

-- No UPDATE on the join table: the row is nothing but its primary key.
REVOKE ALL ON TABLE public.question_tags FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.question_tags TO authenticated;
GRANT ALL ON TABLE public.question_tags TO service_role;

-- ------------------------------------------------------------
-- 4. RLS: tags — admin CRUD, authenticated read
-- ------------------------------------------------------------
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tags"
  ON public.tags
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Read tags: authenticated"
  ON public.tags
  FOR SELECT
  TO authenticated
  USING (true);

-- ------------------------------------------------------------
-- 5. RLS: question_tags — admin CRUD, authenticated read
-- ------------------------------------------------------------
ALTER TABLE public.question_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage question tags"
  ON public.question_tags
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Read question tags: authenticated"
  ON public.question_tags
  FOR SELECT
  TO authenticated
  USING (true);
