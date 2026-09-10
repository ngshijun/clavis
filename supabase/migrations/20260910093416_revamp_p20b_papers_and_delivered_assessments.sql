-- ============================================================
-- Clavis revamp — P20b: papers are the library, assessments are deliveries
--
-- Redesign steps 2 and 3, which only work together.
--
-- Until now the same idea existed twice. `assessment_templates` was the
-- admin's reusable paper (an ordered list of references into the item bank,
-- pinned to a grade+subject, never attempted). `assessments` was the
-- teacher's, and it was BOTH the reusable thing and the delivered one: it
-- held its own payload copies, it belonged to exactly one classroom, and a
-- teacher who built a good paper could not use it again next term without
-- rebuilding it. Nothing was shared between the two: two generators, two
-- builder screens, two question-authoring paths, and a pairing kept
-- consistent by a pair of triggers.
--
-- One library, one delivery:
--
--   papers        — a reusable paper. organization_id NULL = the platform's
--                   (admin-authored), set = that center's own. Holds the
--                   delivery defaults and, when it was generated, the SPEC
--                   it came from, so it can be re-rolled wherever it lives.
--   paper_items   — the ordered references into assessment_bank_questions.
--                   A reference, not a copy: the item IS the question.
--   assessments   — a delivery of one paper into one classroom. It carries
--                   no content of its own until it is PUBLISHED, at which
--                   point publish_assessment snapshots the paper's items
--                   into `assessment_questions` and the content is frozen.
--
-- The freeze is the point. `attempt_questions` references
-- `assessment_questions` by id, and nothing stopped a teacher from editing
-- the payload of a published assessment — which rewrote the questions of
-- in-flight AND completed attempts. P9a called attempt_questions the frozen
-- snapshot, but it only freezes WHICH questions, never what they say. After
-- this migration no client may write `assessment_questions` at all: the
-- publish RPC is the only writer, and it runs once.
--
-- Data:
--   * every template becomes a PLATFORM paper (same id), its references
--     become paper_items;
--   * every assessment gets a CENTER paper carrying its title, settings and
--     generation spec, and each of its questions becomes a center-owned item
--     (same id) referenced by that paper — a teacher's back catalogue lands
--     in their bank, which is the point of the redesign. A question that
--     cannot be filed (no sub-topic exists for its classroom's subject) is
--     left out of the paper;
--   * a DRAFT assessment's `assessment_questions` rows are deleted — they are
--     now produced at publish. A PUBLISHED one keeps its rows: they are the
--     snapshot its attempts were taken against.
--
-- Authoring stays a teacher's job (decision 80): managers read the center's
-- papers and items, teachers write them. P20a granted items to org staff at
-- large; this migration narrows that to match.
-- ============================================================

-- ------------------------------------------------------------
-- 1. papers and paper_items
-- ------------------------------------------------------------
CREATE TABLE public.papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = the platform's paper, offered to every matching center.
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  -- draft = still composing; published = offered (a platform paper) or ready
  -- to deliver. A paper has no attempts to protect, so status never locks it.
  status public.assessment_status NOT NULL DEFAULT 'draft',
  -- The recipe this paper was generated from, kept so it can be re-rolled.
  -- NULL = hand-built.
  spec jsonb,
  time_limit_seconds integer CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
  shuffle_questions boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.papers OWNER TO postgres;

COMMENT ON TABLE public.papers IS
  'A reusable paper (decision 91): an ordered set of references into the item bank plus the delivery defaults. organization_id NULL = the platform''s, set = that center''s own. Never attempted — an assessment delivers it.';

COMMENT ON COLUMN public.papers.spec IS
  'The generation spec this paper was built from, or NULL for a hand-built one. Kept so the paper can be re-rolled; written only by the generator RPCs.';

CREATE INDEX idx_papers_organization ON public.papers USING btree (organization_id);

CREATE TRIGGER update_papers_updated_at
  BEFORE UPDATE ON public.papers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.paper_items (
  paper_id uuid NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.assessment_bank_questions(id) ON DELETE CASCADE,
  "position" integer NOT NULL CHECK ("position" >= 0),
  -- Provenance for re-rolling one line of a generated paper.
  generation_line smallint CHECK (generation_line >= 0),
  generation_difficulty public.question_difficulty,
  PRIMARY KEY (paper_id, item_id)
);

ALTER TABLE public.paper_items OWNER TO postgres;

COMMENT ON TABLE public.paper_items IS
  'The ordered items a paper is made of. A reference, not a copy: editing the item edits every paper holding it; deleting it from the bank drops it out of every paper.';

CREATE INDEX idx_paper_items_item ON public.paper_items USING btree (item_id);

-- ------------------------------------------------------------
-- 2. Who owns a paper, who may read it, who may write it
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.paper_org_id(p_paper_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT organization_id FROM public.papers WHERE id = p_paper_id;
$$;

ALTER FUNCTION app.paper_org_id(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.paper_org_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.paper_org_id(uuid) TO authenticated, service_role;

-- A platform paper reaches a center when it is published and holds at least
-- one item of a grade+subject that center actually teaches (decision 61).
-- The pairing is DERIVED from the items rather than stored, so it can never
-- disagree with them and a paper's subject is not a one-way door.
CREATE OR REPLACE FUNCTION app.paper_readable(p_paper_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.papers p
    WHERE p.id = p_paper_id
      AND (
        app.is_admin()
        OR (p.organization_id = app.current_org_id() AND app.is_org_staff())
        OR (
          p.organization_id IS NULL
          AND p.status = 'published'
          AND app.is_org_staff()
          AND EXISTS (
            SELECT 1
            FROM public.paper_items pi
            JOIN public.assessment_bank_questions bq ON bq.id = pi.item_id
            JOIN public.sub_topics st ON st.id = bq.sub_topic_id
            JOIN public.topics tp ON tp.id = st.topic_id
            JOIN public.subjects s ON s.id = tp.subject_id
            WHERE pi.paper_id = p.id
              AND app.has_matching_classroom(s.grade_level_id, s.id)
          )
        )
      )
  );
$$;

ALTER FUNCTION app.paper_readable(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.paper_readable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.paper_readable(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION app.paper_readable(uuid) IS
  'True when the caller may read the paper: an admin, staff of the owning center, or staff of a center that teaches a grade+subject the paper covers (published platform papers only).';

CREATE OR REPLACE FUNCTION app.can_write_paper(p_paper_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.papers p
    WHERE p.id = p_paper_id
      AND (
        app.is_admin()
        OR (p.organization_id = app.current_org_id() AND app.is_teacher())
      )
  );
$$;

ALTER FUNCTION app.can_write_paper(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.can_write_paper(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.can_write_paper(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION app.can_write_paper(uuid) IS
  'Admin on the platform''s papers, a TEACHER on their own center''s. Managers read teaching material, they do not author it (decision 80).';

-- ------------------------------------------------------------
-- 3. A paper only references items it is allowed to
--
--    A platform paper: platform items only — it is offered to every center,
--    so a reference to one center's item would leak it to all of them.
--    A center's paper: platform items plus its own.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_paper_item_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_paper_org uuid := app.paper_org_id(NEW.paper_id);
  v_item_org  uuid := app.assessment_item_org_id(NEW.item_id);
BEGIN
  IF v_item_org IS NOT NULL AND v_item_org IS DISTINCT FROM v_paper_org THEN
    RAISE EXCEPTION 'Question belongs to another center';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_paper_item_owner() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_paper_item_owner() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_enforce_paper_item_owner
  BEFORE INSERT ON public.paper_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_paper_item_owner();

-- The mirror edge: an item that a paper of another owner already holds may
-- not change hands. Replaces P17a/P20a's template-scope guard, whose subject
-- rule is gone with the stored pairing.
CREATE OR REPLACE FUNCTION public.enforce_bank_question_refile()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM paper_items pi
    JOIN papers p ON p.id = pi.paper_id
    WHERE pi.item_id = NEW.id
      AND NEW.organization_id IS DISTINCT FROM p.organization_id
  ) THEN
    RAISE EXCEPTION 'Question is used by a paper of another owner';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_bank_question_refile() IS
  'Stops an item from changing owner while a paper of the previous owner still references it. Role independent.';

DROP TRIGGER trg_enforce_bank_question_refile ON public.assessment_bank_questions;

CREATE TRIGGER trg_enforce_bank_question_refile
  BEFORE UPDATE OF organization_id ON public.assessment_bank_questions
  FOR EACH ROW
  WHEN (OLD.organization_id IS DISTINCT FROM NEW.organization_id)
  EXECUTE FUNCTION public.enforce_bank_question_refile();

-- ------------------------------------------------------------
-- 4. Move the templates and the assessments across
-- ------------------------------------------------------------
INSERT INTO public.papers (
  id, organization_id, title, description, status, spec,
  time_limit_seconds, shuffle_questions, created_by, created_at, updated_at
)
SELECT
  t.id, NULL, t.title, t.description, t.status, NULL,
  t.time_limit_seconds, t.shuffle_questions, t.created_by, t.created_at, t.updated_at
FROM public.assessment_templates t;

INSERT INTO public.paper_items (paper_id, item_id, "position")
SELECT tq.template_id, tq.bank_question_id, tq."position"
FROM public.assessment_template_questions tq;

-- One center paper per existing assessment.
CREATE TEMP TABLE assessment_paper ON COMMIT DROP AS
SELECT a.id AS assessment_id, gen_random_uuid() AS paper_id FROM public.assessments a;

INSERT INTO public.papers (
  id, organization_id, title, description, status, spec,
  time_limit_seconds, shuffle_questions, created_by, created_at, updated_at
)
SELECT
  ap.paper_id, a.organization_id, a.title, a.description, a.status, a.generation_spec,
  a.time_limit_seconds, a.shuffle_questions, a.created_by, a.created_at, a.updated_at
FROM public.assessments a
JOIN assessment_paper ap ON ap.assessment_id = a.id;

-- Each question becomes a center-owned item with the SAME id, filed where its
-- bank source was filed, or under the first sub-topic of the classroom's
-- subject. A question with nowhere to go is left out of the paper (its
-- snapshot row is untouched, so no attempt loses anything).
INSERT INTO public.assessment_bank_questions (
  id, payload, difficulty, sub_topic_id, organization_id, points,
  created_by, created_at, updated_at
)
SELECT
  aq.id, aq.payload, COALESCE(aq.generation_difficulty, 'medium'), filed.sub_topic_id,
  a.organization_id, aq.points, a.created_by, aq.created_at, aq.created_at
FROM public.assessment_questions aq
JOIN public.assessments a ON a.id = aq.assessment_id
JOIN LATERAL (
  SELECT COALESCE(
    (SELECT src.sub_topic_id
       FROM public.assessment_bank_questions src
      WHERE src.id = aq.bank_question_id),
    (SELECT st.id
       FROM public.sub_topics st
       JOIN public.topics tp ON tp.id = st.topic_id
       JOIN public.classrooms c ON c.id = a.classroom_id
      WHERE tp.subject_id = c.subject_id
      ORDER BY tp.display_order NULLS LAST, st.display_order NULLS LAST, st.created_at
      LIMIT 1)
  ) AS sub_topic_id
) filed ON filed.sub_topic_id IS NOT NULL;

INSERT INTO public.paper_items (paper_id, item_id, "position", generation_line, generation_difficulty)
SELECT ap.paper_id, aq.id, aq."position", aq.generation_line, aq.generation_difficulty
FROM public.assessment_questions aq
JOIN assessment_paper ap ON ap.assessment_id = aq.assessment_id
JOIN public.assessment_bank_questions bq ON bq.id = aq.id;

-- Close the gaps left by anything that could not be filed.
WITH resequenced AS (
  SELECT paper_id, item_id,
         row_number() OVER (PARTITION BY paper_id ORDER BY "position") - 1 AS pos
  FROM public.paper_items
)
UPDATE public.paper_items pi
SET "position" = r.pos
FROM resequenced r
WHERE r.paper_id = pi.paper_id
  AND r.item_id = pi.item_id
  AND pi."position" IS DISTINCT FROM r.pos;

-- A draft's questions are produced at publish now; a published one's are the
-- snapshot its attempts were taken against.
DELETE FROM public.assessment_questions aq
USING public.assessments a
WHERE a.id = aq.assessment_id
  AND a.status = 'draft';

-- ------------------------------------------------------------
-- 5. An assessment delivers a paper
-- ------------------------------------------------------------
ALTER TABLE public.assessments
  ADD COLUMN paper_id uuid REFERENCES public.papers(id) ON DELETE RESTRICT;

UPDATE public.assessments a
SET paper_id = ap.paper_id
FROM assessment_paper ap
WHERE ap.assessment_id = a.id;

ALTER TABLE public.assessments
  ALTER COLUMN paper_id SET NOT NULL,
  DROP COLUMN generation_spec;

CREATE INDEX idx_assessments_paper ON public.assessments USING btree (paper_id);

COMMENT ON COLUMN public.assessments.paper_id IS
  'The paper this assessment delivers. Fixed at delivery; publishing snapshots the paper''s items into assessment_questions.';

COMMENT ON TABLE public.assessments IS
  'One delivery of a paper into one classroom (decision 91). Holds no content while it is a draft; publishing freezes the paper''s items into assessment_questions, which attempts are then taken against.';

ALTER TABLE public.assessment_questions
  DROP COLUMN generation_line,
  DROP COLUMN generation_difficulty,
  DROP COLUMN bank_question_id;

COMMENT ON TABLE public.assessment_questions IS
  'The frozen snapshot of a published assessment: the paper''s items as they read at the moment of publication. Written only by publish_assessment; no client may write it.';

-- ------------------------------------------------------------
-- 6. Grants
--
-- assessment_questions: nobody but the publish RPC writes it, so the client
-- keeps SELECT alone. assessments: delivery creates the row and publication
-- sets the status, both through RPCs, so INSERT and both of those columns go.
-- ------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON TABLE public.assessment_questions FROM authenticated;

REVOKE INSERT, UPDATE ON TABLE public.assessments FROM authenticated;
GRANT UPDATE (
  title, description, time_limit_seconds, shuffle_questions,
  show_auto_score_while_pending, updated_at
) ON TABLE public.assessments TO authenticated;

DROP POLICY "Create assessments: teachers in own classroom" ON public.assessments;
DROP POLICY "Write assessment questions: assessment writers" ON public.assessment_questions;
DROP POLICY "Update assessment questions: assessment writers" ON public.assessment_questions;
DROP POLICY "Delete assessment questions: assessment writers" ON public.assessment_questions;

REVOKE ALL ON TABLE public.papers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.papers TO authenticated;
-- The owner is fixed at creation and the spec belongs to the generator.
GRANT UPDATE (title, description, status, time_limit_seconds, shuffle_questions, updated_at)
  ON TABLE public.papers TO authenticated;
GRANT ALL ON TABLE public.papers TO service_role;

REVOKE ALL ON TABLE public.paper_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.paper_items TO authenticated;
GRANT ALL ON TABLE public.paper_items TO service_role;

ALTER TABLE public.papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read papers: owner staff and matched centers"
  ON public.papers
  FOR SELECT
  TO authenticated
  USING (app.paper_readable(id));

CREATE POLICY "Write papers: admin on platform, teacher on own center"
  ON public.papers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (
      ((SELECT app.is_admin()) AND organization_id IS NULL)
      OR ((SELECT app.is_teacher()) AND organization_id = (SELECT app.current_org_id()))
    )
  );

CREATE POLICY "Update papers: writers"
  ON public.papers
  FOR UPDATE
  TO authenticated
  USING (app.can_write_paper(id))
  WITH CHECK (app.can_write_paper(id));

CREATE POLICY "Delete papers: writers"
  ON public.papers
  FOR DELETE
  TO authenticated
  USING (app.can_write_paper(id));

CREATE POLICY "Read paper items: readable papers"
  ON public.paper_items
  FOR SELECT
  TO authenticated
  USING (app.paper_readable(paper_id));

CREATE POLICY "Write paper items: paper writers"
  ON public.paper_items
  FOR INSERT
  TO authenticated
  WITH CHECK (app.can_write_paper(paper_id));

CREATE POLICY "Delete paper items: paper writers"
  ON public.paper_items
  FOR DELETE
  TO authenticated
  USING (app.can_write_paper(paper_id));

-- Items follow the same rule as the papers that hold them: staff of the
-- owning center read, its TEACHERS write (P20a granted both to org staff).
DROP POLICY "Staff manage own center assessment items" ON public.assessment_bank_questions;
DROP POLICY "Staff manage own center assessment item tags" ON public.assessment_bank_question_tags;

CREATE POLICY "Read own center assessment items: staff"
  ON public.assessment_bank_questions
  FOR SELECT
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT app.current_org_id())
    AND (SELECT app.is_org_staff())
  );

CREATE POLICY "Write own center assessment items: teachers"
  ON public.assessment_bank_questions
  FOR ALL
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT app.current_org_id())
    AND (SELECT app.is_teacher())
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = (SELECT app.current_org_id())
    AND (SELECT app.is_teacher())
  );

CREATE POLICY "Read own center assessment item tags: staff"
  ON public.assessment_bank_question_tags
  FOR SELECT
  TO authenticated
  USING (
    (SELECT app.is_org_staff())
    AND app.assessment_item_org_id(assessment_bank_question_id) = (SELECT app.current_org_id())
  );

CREATE POLICY "Write own center assessment item tags: teachers"
  ON public.assessment_bank_question_tags
  FOR ALL
  TO authenticated
  USING (
    (SELECT app.is_teacher())
    AND app.assessment_item_org_id(assessment_bank_question_id) = (SELECT app.current_org_id())
  )
  WITH CHECK (
    (SELECT app.is_teacher())
    AND app.assessment_item_org_id(assessment_bank_question_id) = (SELECT app.current_org_id())
  );

-- ------------------------------------------------------------
-- 7. A spec no longer names its subject — it IS one
--
-- The subject used to come from the template's stored pairing or the
-- classroom being generated into. A paper stores neither, so the spec must
-- be self-consistent: every sub-topic it names must exist, and all of them
-- must sit under ONE subject. That is the same rule, checked where the
-- evidence is.
-- ------------------------------------------------------------
DROP FUNCTION app.validate_generation_spec(jsonb, uuid);

CREATE FUNCTION app.validate_generation_spec(p_spec jsonb)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_line     jsonb;
  v_uuid     jsonb;
  v_mix      jsonb;
  v_level    text;
  v_share    numeric;
  v_total    numeric;
  v_count    numeric;
  v_all_ids  uuid[];
  v_found    bigint;
  v_subjects bigint;
BEGIN
  IF jsonb_typeof(p_spec) <> 'array' OR jsonb_array_length(p_spec) = 0 THEN
    RAISE EXCEPTION 'Generation spec must be a non-empty list';
  END IF;
  IF jsonb_array_length(p_spec) > 20 THEN
    RAISE EXCEPTION 'Generation spec has too many lines';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_spec) LOOP
    -- A missing key reads as the jsonb null literal, so it fails these the
    -- same way a wrongly-typed one does.
    IF jsonb_typeof(v_line) <> 'object'
       OR jsonb_typeof(COALESCE(v_line->'sub_topic_ids', 'null'::jsonb)) <> 'array'
       OR jsonb_array_length(v_line->'sub_topic_ids') = 0
       OR jsonb_array_length(v_line->'sub_topic_ids') > 20
       OR jsonb_typeof(COALESCE(v_line->'tag_ids', 'null'::jsonb)) <> 'array'
       OR jsonb_typeof(COALESCE(v_line->'count', 'null'::jsonb)) <> 'number'
       OR jsonb_typeof(COALESCE(v_line->'difficulty_mix', 'null'::jsonb)) <> 'object'
    THEN
      RAISE EXCEPTION 'Generation spec line is invalid';
    END IF;

    v_count := (v_line->>'count')::numeric;
    IF v_count <> floor(v_count) OR v_count < 1 OR v_count > 50 THEN
      RAISE EXCEPTION 'Generation spec line is invalid';
    END IF;

    FOR v_uuid IN
      SELECT value FROM jsonb_array_elements(v_line->'sub_topic_ids')
      UNION ALL
      SELECT value FROM jsonb_array_elements(v_line->'tag_ids')
    LOOP
      IF jsonb_typeof(v_uuid) <> 'string'
         OR (v_uuid #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION 'Generation spec line is invalid';
      END IF;
    END LOOP;

    -- The mix carries exactly the three levels, as integer percentages
    -- summing to 100.
    v_mix := v_line->'difficulty_mix';
    IF (SELECT count(*) FROM jsonb_object_keys(v_mix)) <> 3 THEN
      RAISE EXCEPTION 'Generation spec line is invalid';
    END IF;

    v_total := 0;
    FOREACH v_level IN ARRAY ARRAY['low', 'medium', 'high'] LOOP
      IF jsonb_typeof(COALESCE(v_mix->v_level, 'null'::jsonb)) <> 'number' THEN
        RAISE EXCEPTION 'Generation spec line is invalid';
      END IF;
      v_share := (v_mix->>v_level)::numeric;
      IF v_share <> floor(v_share) OR v_share < 0 OR v_share > 100 THEN
        RAISE EXCEPTION 'Generation spec line is invalid';
      END IF;
      v_total := v_total + v_share;
    END LOOP;

    IF v_total <> 100 THEN
      RAISE EXCEPTION 'Difficulty percentages must add up to 100';
    END IF;
  END LOOP;

  SELECT array_agg(DISTINCT (sub.value #>> '{}')::uuid) INTO v_all_ids
  FROM jsonb_array_elements(p_spec) AS line,
       jsonb_array_elements(line.value->'sub_topic_ids') AS sub;

  SELECT count(*), count(DISTINCT tp.subject_id) INTO v_found, v_subjects
  FROM public.sub_topics st
  JOIN public.topics tp ON tp.id = st.topic_id
  WHERE st.id = ANY (v_all_ids);

  IF v_found <> cardinality(v_all_ids) THEN
    RAISE EXCEPTION 'Sub-topic does not exist';
  END IF;

  IF v_subjects <> 1 THEN
    RAISE EXCEPTION 'A paper draws from one subject';
  END IF;
END;
$$;

ALTER FUNCTION app.validate_generation_spec(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.validate_generation_spec(jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.validate_generation_spec(jsonb) IS
  'Raises unless p_spec is a well-formed generation spec — each line naming 1..20 existing sub-topics, a difficulty mix of three integer percentages summing to 100, and a count of 1..50 — and every sub-topic it names sits under one subject. Internal to the generator RPCs.';

-- ------------------------------------------------------------
-- 8. Reading a paper's items
--
-- One path for every reader. An admin could join the bank directly; staff
-- cannot (the bank has no cross-owner read grant), and a center reading a
-- platform paper needs the same rows.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_paper_items(p_paper_id uuid)
RETURNS TABLE (
  id uuid,
  "position" integer,
  payload jsonb,
  difficulty public.question_difficulty,
  points numeric,
  sub_topic_id uuid,
  organization_id uuid,
  generation_line smallint,
  generation_difficulty public.question_difficulty,
  tag_ids uuid[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    bq.id,
    pi."position",
    bq.payload,
    bq.difficulty,
    bq.points,
    bq.sub_topic_id,
    bq.organization_id,
    pi.generation_line,
    pi.generation_difficulty,
    COALESCE(
      (SELECT array_agg(bt.tag_id)
         FROM assessment_bank_question_tags bt
        WHERE bt.assessment_bank_question_id = bq.id),
      '{}'
    )
  FROM paper_items pi
  JOIN assessment_bank_questions bq ON bq.id = pi.item_id
  WHERE pi.paper_id = p_paper_id
    AND app.paper_readable(p_paper_id)
  ORDER BY pi."position";
$$;

ALTER FUNCTION public.get_paper_items(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_paper_items(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paper_items(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_paper_items(uuid) IS
  'The items of a paper the caller may read, in order, with their tags. Empty for a paper they may not.';

-- ------------------------------------------------------------
-- 9. Reordering a paper
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_paper_items(p_paper_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_children bigint;
  v_matched  bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM papers WHERE id = p_paper_id) THEN
    RAISE EXCEPTION 'Paper not found: %', p_paper_id;
  END IF;

  IF NOT app.can_write_paper(p_paper_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this paper';
  END IF;

  SELECT count(*) INTO v_children FROM paper_items WHERE paper_id = p_paper_id;
  SELECT count(*) INTO v_matched
  FROM paper_items WHERE paper_id = p_paper_id AND item_id = ANY (p_ids);

  PERFORM app.assert_reorder_permutation('paper_items', p_ids, v_children, v_matched);

  UPDATE paper_items pi
  SET "position" = i.ord
  FROM unnest(p_ids) WITH ORDINALITY AS i(id, ord)
  WHERE pi.item_id = i.id
    AND pi.paper_id = p_paper_id;
END;
$$;

ALTER FUNCTION public.reorder_paper_items(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reorder_paper_items(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_paper_items(uuid, uuid[]) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 10. Generating a paper — one generator for both libraries
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_paper(p_title text, p_spec jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller     uuid := (SELECT auth.uid());
  v_org_id     uuid;
  v_new_id     uuid;
  v_line       jsonb;
  v_index      integer;
  v_position   integer := 0;
  v_used       uuid[] := '{}';
  v_picked     integer;
  v_bucket     record;
  v_pick       assessment_bank_questions%ROWTYPE;
  v_shortfalls jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- The owner follows the author: an admin builds the platform's papers, a
  -- teacher their own center's. Managers read teaching material (decision 80).
  IF app.is_admin() THEN
    v_org_id := NULL;
  ELSIF app.is_teacher() THEN
    v_org_id := app.current_org_id();
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Caller has no organization';
    END IF;
  ELSE
    RAISE EXCEPTION 'Only admins and teachers can generate papers';
  END IF;

  IF btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  PERFORM app.validate_generation_spec(p_spec);

  INSERT INTO papers (organization_id, title, spec, created_by)
  VALUES (v_org_id, btrim(p_title), p_spec, v_caller)
  RETURNING id INTO v_new_id;

  FOR v_line, v_index IN
    SELECT value, ordinality - 1 FROM jsonb_array_elements(p_spec) WITH ORDINALITY
  LOOP
    v_picked := 0;

    -- Easiest bucket first, so a paper reads low → medium → high.
    FOR v_bucket IN
      SELECT * FROM app.allocate_difficulty_mix(
        (v_line->>'count')::integer,
        v_line->'difficulty_mix'
      )
    LOOP
      FOR v_pick IN
        SELECT * FROM app.pick_bank_questions(
          v_org_id,
          app.generation_line_sub_topics(v_line),
          app.generation_line_tags(v_line),
          v_bucket.difficulty,
          v_used,
          v_bucket.n
        )
      LOOP
        INSERT INTO paper_items (paper_id, item_id, "position", generation_line, generation_difficulty)
        VALUES (v_new_id, v_pick.id, v_position, v_index, v_bucket.difficulty);
        v_used := v_used || v_pick.id;
        v_position := v_position + 1;
        v_picked := v_picked + 1;
      END LOOP;
    END LOOP;

    IF v_picked < (v_line->>'count')::integer THEN
      v_shortfalls := v_shortfalls || jsonb_build_object(
        'line', v_index,
        'requested', (v_line->>'count')::integer,
        'picked', v_picked
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('paper_id', v_new_id, 'shortfalls', v_shortfalls);
END;
$$;

ALTER FUNCTION public.generate_paper(text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.generate_paper(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_paper(text, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.generate_paper(text, jsonb) IS
  'Decision 90/91: builds a draft paper from random picks matching each spec line — across the line''s sub-topics, split by its difficulty ratio — owned by the platform for an admin and by the caller''s center for a teacher, drawing from the platform''s items plus that center''s own. The spec is kept on the paper. Returns {paper_id, shortfalls:[{line, requested, picked}]}.';

-- ------------------------------------------------------------
-- 11. Re-rolling one item of a generated paper
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regenerate_paper_item(p_paper_id uuid, p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row      paper_items%ROWTYPE;
  v_spec     jsonb;
  v_org_id   uuid;
  v_line     jsonb;
  v_used     uuid[];
  v_pick     assessment_bank_questions%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT app.can_write_paper(p_paper_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this paper';
  END IF;

  SELECT * INTO v_row FROM paper_items WHERE paper_id = p_paper_id AND item_id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question is not in this paper';
  END IF;

  SELECT p.spec, p.organization_id INTO v_spec, v_org_id FROM papers p WHERE p.id = p_paper_id;

  IF v_row.generation_line IS NULL OR v_spec IS NULL THEN
    RAISE EXCEPTION 'Question was not generated';
  END IF;

  v_line := v_spec -> v_row.generation_line;

  -- Everything the paper already holds is off the table, including the
  -- question being replaced.
  SELECT COALESCE(array_agg(pi.item_id), '{}') INTO v_used
  FROM paper_items pi WHERE pi.paper_id = p_paper_id;

  SELECT * INTO v_pick
  FROM app.pick_bank_questions(
    v_org_id,
    app.generation_line_sub_topics(v_line),
    app.generation_line_tags(v_line),
    v_row.generation_difficulty,
    v_used,
    1
  );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No other bank question matches these criteria';
  END IF;

  DELETE FROM paper_items WHERE paper_id = p_paper_id AND item_id = p_item_id;

  INSERT INTO paper_items (paper_id, item_id, "position", generation_line, generation_difficulty)
  VALUES (p_paper_id, v_pick.id, v_row."position", v_row.generation_line, v_row.generation_difficulty);

  RETURN jsonb_build_object('item_id', v_pick.id, 'position', v_row."position");
END;
$$;

ALTER FUNCTION public.regenerate_paper_item(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.regenerate_paper_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_paper_item(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.regenerate_paper_item(uuid, uuid) IS
  'Replaces one generated item of a paper with another random pick from its spec line at the SAME difficulty, excluding everything the paper already holds. Returns the new {item_id, position}.';

-- ------------------------------------------------------------
-- 12. Adopting a paper into a center's library
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adopt_paper(p_paper_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_org_id uuid;
  v_source papers%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT app.is_teacher() THEN
    RAISE EXCEPTION 'Only teachers can adopt papers';
  END IF;

  v_org_id := app.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no organization';
  END IF;

  IF NOT app.paper_readable(p_paper_id) THEN
    RAISE EXCEPTION 'Paper not found: %', p_paper_id;
  END IF;

  SELECT * INTO v_source FROM papers WHERE id = p_paper_id;

  INSERT INTO papers (
    organization_id, title, description, status, spec,
    time_limit_seconds, shuffle_questions, created_by
  )
  VALUES (
    v_org_id, v_source.title, v_source.description, 'draft', v_source.spec,
    v_source.time_limit_seconds, v_source.shuffle_questions, v_caller
  )
  RETURNING id INTO v_new_id;

  -- References, not copies: the adopted paper points at the same items. Only
  -- platform items can travel this way, which the owner trigger enforces.
  INSERT INTO paper_items (paper_id, item_id, "position", generation_line, generation_difficulty)
  SELECT v_new_id, pi.item_id, pi."position", pi.generation_line, pi.generation_difficulty
  FROM paper_items pi
  WHERE pi.paper_id = p_paper_id;

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION public.adopt_paper(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.adopt_paper(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adopt_paper(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.adopt_paper(uuid) IS
  'Copies a paper the caller may read into their own center''s library as a draft, referencing the same items. Returns the new paper id.';

-- ------------------------------------------------------------
-- 13. Delivering a paper into a classroom
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deliver_paper(
  p_paper_id     uuid,
  p_classroom_id uuid,
  p_title        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_org_id uuid;
  v_source papers%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT app.is_teacher() THEN
    RAISE EXCEPTION 'Only teachers can deliver papers';
  END IF;

  IF NOT app.is_classroom_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'You do not teach this classroom';
  END IF;

  v_org_id := app.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no organization';
  END IF;

  IF NOT app.paper_readable(p_paper_id) THEN
    RAISE EXCEPTION 'Paper not found: %', p_paper_id;
  END IF;

  SELECT * INTO v_source FROM papers WHERE id = p_paper_id;

  INSERT INTO assessments (
    organization_id, classroom_id, paper_id, created_by, title, description,
    status, time_limit_seconds, shuffle_questions
  )
  VALUES (
    v_org_id, p_classroom_id, p_paper_id, v_caller,
    btrim(COALESCE(NULLIF(btrim(COALESCE(p_title, '')), ''), v_source.title)),
    v_source.description, 'draft', v_source.time_limit_seconds, v_source.shuffle_questions
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION public.deliver_paper(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.deliver_paper(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deliver_paper(uuid, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.deliver_paper(uuid, uuid, text) IS
  'Creates a DRAFT assessment in the caller''s classroom delivering the given paper, inheriting its title and delivery settings. Returns the new assessment id.';

-- ------------------------------------------------------------
-- 14. Publishing freezes the paper into the assessment
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_assessment(p_assessment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_paper_id uuid;
  v_status   assessment_status;
  v_items    bigint;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT app.can_write_assessment(p_assessment_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this assessment';
  END IF;

  SELECT a.paper_id, a.status INTO v_paper_id, v_status
  FROM assessments a WHERE a.id = p_assessment_id;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Assessment is already published';
  END IF;

  SELECT count(*) INTO v_items FROM paper_items WHERE paper_id = v_paper_id;
  IF v_items = 0 THEN
    RAISE EXCEPTION 'Add a question before publishing';
  END IF;

  -- The snapshot. From here the assessment carries its own copy of every
  -- question, and no edit to the paper or the bank can reach an attempt.
  INSERT INTO assessment_questions (assessment_id, payload, "position", points)
  SELECT p_assessment_id, bq.payload, pi."position", bq.points
  FROM paper_items pi
  JOIN assessment_bank_questions bq ON bq.id = pi.item_id
  WHERE pi.paper_id = v_paper_id;

  UPDATE assessments SET status = 'published' WHERE id = p_assessment_id;
END;
$$;

ALTER FUNCTION public.publish_assessment(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.publish_assessment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_assessment(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.publish_assessment(uuid) IS
  'Freezes the assessment''s paper into assessment_questions and marks it published. The only writer of assessment_questions, and it runs once per assessment.';

-- Publication is one-way: the snapshot is what attempts were taken against.
CREATE OR REPLACE FUNCTION public.enforce_assessment_publish_once()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF OLD.status = 'published' AND NEW.status <> 'published' THEN
    RAISE EXCEPTION 'A published assessment cannot return to draft';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_assessment_publish_once() OWNER TO postgres;

CREATE TRIGGER trg_enforce_assessment_publish_once
  BEFORE UPDATE OF status ON public.assessments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.enforce_assessment_publish_once();

-- ------------------------------------------------------------
-- 15. The replaced machinery
-- ------------------------------------------------------------
DROP FUNCTION public.get_template_questions(uuid);
DROP FUNCTION public.clone_assessment_template(uuid, uuid);
DROP FUNCTION public.generate_template_from_bank(text, uuid, uuid, jsonb);
DROP FUNCTION public.generate_assessment_from_bank(uuid, text, jsonb);
DROP FUNCTION public.regenerate_assessment_question(uuid);
DROP FUNCTION public.reorder_assessment_questions(uuid, uuid[]);

DROP TABLE public.assessment_template_questions;
DROP TABLE public.assessment_templates;

DROP FUNCTION public.enforce_template_question_scope();
DROP FUNCTION app.assessment_template_visible(uuid);
