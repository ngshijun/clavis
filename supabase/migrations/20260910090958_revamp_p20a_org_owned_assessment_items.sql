-- ============================================================
-- Clavis revamp — P20a: an assessment item belongs to the platform, or to one center
--
-- Redesign step 1. `assessment_bank_questions` is the only store of ADMIN
-- assessment questions (decision 89), and a teacher's own question has nowhere
-- to live but inside a single assessment, as a payload row in
-- `assessment_questions`. The same act of authoring is therefore modelled
-- twice — the admin writes a reusable item, the teacher writes a throwaway —
-- and every tool has to exist twice to serve both (two generators, two
-- editors, a picker for one side only).
--
-- Ownership moves onto the row instead:
--
--   organization_id IS NULL  -> a PLATFORM item: admin-authored, offered to
--                               every center through the generators.
--   organization_id = <org>  -> that CENTER's own item, authored by its staff.
--
-- Boundaries this migration must hold:
--
--   * A center reads and writes ONLY its own items. Platform items stay
--     unreadable to staff — they carry answer keys (P13a) — and reach a
--     teacher only through the generator RPCs, which run as owner and return
--     no more than the picks they made.
--   * A TEMPLATE may reference PLATFORM items only. A published template is
--     visible to every center whose classroom matches its pairing, so a
--     reference to one center's private item would leak that item to all of
--     them.
--   * The generation pool is platform items + the caller's own center's items
--     for a teacher's assessment, and platform items alone for an admin's
--     template.
--
-- Existing rows are all admin-authored, so NULL (platform) is the correct
-- value for every one of them and no backfill is needed.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Ownership
-- ------------------------------------------------------------
ALTER TABLE public.assessment_bank_questions
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.assessment_bank_questions.organization_id IS
  'Owner of this item: NULL = platform item (admin-authored, drawn by every center''s generator and referenced by templates); set = that center''s own item, visible to its staff alone.';

COMMENT ON TABLE public.assessment_bank_questions IS
  'Every assessment question that is meant to be reused (decisions 89, 91). Filed under a sub-topic, which fixes topic, subject and grade. organization_id decides the owner: NULL = platform (admin), set = one center. A template references platform items; a delivered assessment copies.';

-- Staff list their own center's items; the generator adds the center's items
-- to the platform pool. Both filter on the owner, so the platform rows (the
-- bulk of the table, and already served by the sub-topic index) stay out of it.
CREATE INDEX idx_assessment_bank_questions_organization
  ON public.assessment_bank_questions USING btree (organization_id, sub_topic_id)
  WHERE organization_id IS NOT NULL;

-- Mirrors app.assessment_org_id: one RLS-bypassing lookup of an item's owner,
-- so the policies and the storage helper below agree by construction.
CREATE OR REPLACE FUNCTION app.assessment_item_org_id(p_item_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT organization_id
  FROM public.assessment_bank_questions
  WHERE id = p_item_id;
$$;

ALTER FUNCTION app.assessment_item_org_id(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.assessment_item_org_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.assessment_item_org_id(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION app.assessment_item_org_id(uuid) IS
  'The owning organization of an assessment item, or NULL for a platform item (and for an item that does not exist).';

-- ------------------------------------------------------------
-- 2. RLS: a center's staff own their center's items, and nothing else
--
-- The admin FOR ALL policies already shipped are untouched, so an admin still
-- reaches every row — including a center's, which is what lets an admin
-- promote a good one to the platform (organization_id -> NULL).
-- ------------------------------------------------------------
CREATE POLICY "Staff manage own center assessment items"
  ON public.assessment_bank_questions
  FOR ALL
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT app.current_org_id())
    AND (SELECT app.is_org_staff())
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = (SELECT app.current_org_id())
    AND (SELECT app.is_org_staff())
  );

CREATE POLICY "Staff manage own center assessment item tags"
  ON public.assessment_bank_question_tags
  FOR ALL
  TO authenticated
  USING (
    (SELECT app.is_org_staff())
    AND app.assessment_item_org_id(assessment_bank_question_id) = (SELECT app.current_org_id())
  )
  WITH CHECK (
    (SELECT app.is_org_staff())
    AND app.assessment_item_org_id(assessment_bank_question_id) = (SELECT app.current_org_id())
  );

-- ------------------------------------------------------------
-- 3. A template references PLATFORM items only
--
-- Two edges can break that: adding a reference, and moving a referenced item
-- to a center. Both already had a guard for the subject rule; each grows an
-- ownership branch with its own message, so a rejected write says which rule
-- it broke.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_template_question_scope()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF app.assessment_item_org_id(NEW.bank_question_id) IS NOT NULL THEN
    RAISE EXCEPTION 'A template cannot reference a center''s own question';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM assessment_templates t
    JOIN assessment_bank_questions bq ON bq.id = NEW.bank_question_id
    JOIN sub_topics st ON st.id = bq.sub_topic_id
    JOIN topics tp ON tp.id = st.topic_id
    WHERE t.id = NEW.template_id
      AND tp.subject_id = t.subject_id
  ) THEN
    RAISE EXCEPTION 'Question is not filed under this template subject';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_template_question_scope() IS
  'Rejects a template reference to a center-owned item (it would leak across centers) or to an item filed outside the template''s subject. Role independent.';

CREATE OR REPLACE FUNCTION public.enforce_bank_question_refile()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM assessment_template_questions tq WHERE tq.bank_question_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NOT NULL THEN
    RAISE EXCEPTION 'Question is used by a template and cannot be moved to a center';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM assessment_template_questions tq
    JOIN assessment_templates t ON t.id = tq.template_id
    JOIN sub_topics st ON st.id = NEW.sub_topic_id
    JOIN topics tp ON tp.id = st.topic_id
    WHERE tq.bank_question_id = NEW.id
      AND tp.subject_id <> t.subject_id
  ) THEN
    RAISE EXCEPTION 'Question is used by a template of another subject';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_bank_question_refile() IS
  'Guards a referenced item against the two moves a template cannot follow: out of its subject, and into a center''s ownership. Role independent.';

DROP TRIGGER trg_enforce_bank_question_refile ON public.assessment_bank_questions;

CREATE TRIGGER trg_enforce_bank_question_refile
  BEFORE UPDATE OF sub_topic_id, organization_id ON public.assessment_bank_questions
  FOR EACH ROW
  WHEN (
    OLD.sub_topic_id IS DISTINCT FROM NEW.sub_topic_id
    OR OLD.organization_id IS DISTINCT FROM NEW.organization_id
  )
  EXECUTE FUNCTION public.enforce_bank_question_refile();

-- ------------------------------------------------------------
-- 4. The generation pool is owner-aware
--
-- p_organization_id = the center whose own items join the platform pool, or
-- NULL for platform items alone. `bq.organization_id = NULL` is never true, so
-- the NULL case needs no branch of its own.
-- ------------------------------------------------------------
DROP FUNCTION app.pick_bank_questions(uuid[], uuid[], public.question_difficulty, uuid[], integer);

CREATE FUNCTION app.pick_bank_questions(
  p_organization_id uuid,
  p_sub_topic_ids uuid[],
  p_tag_ids uuid[],
  p_difficulty public.question_difficulty,
  p_exclude uuid[],
  p_count integer
)
RETURNS SETOF public.assessment_bank_questions
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT bq.*
  FROM public.assessment_bank_questions bq
  WHERE bq.sub_topic_id = ANY (p_sub_topic_ids)
    AND (bq.organization_id IS NULL OR bq.organization_id = p_organization_id)
    AND (p_difficulty IS NULL OR bq.difficulty = p_difficulty)
    AND (
      cardinality(p_tag_ids) = 0
      OR EXISTS (
        SELECT 1 FROM public.assessment_bank_question_tags bt
        WHERE bt.assessment_bank_question_id = bq.id
          AND bt.tag_id = ANY (p_tag_ids)
      )
    )
    AND NOT (bq.id = ANY (p_exclude))
  ORDER BY random()
  LIMIT p_count;
$$;

ALTER FUNCTION app.pick_bank_questions(uuid, uuid[], uuid[], public.question_difficulty, uuid[], integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.pick_bank_questions(uuid, uuid[], uuid[], public.question_difficulty, uuid[], integer) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION app.pick_bank_questions(uuid, uuid[], uuid[], public.question_difficulty, uuid[], integer) IS
  'Up to p_count random items filed under ANY of p_sub_topic_ids — platform items plus p_organization_id''s own (NULL = platform only) — at p_difficulty (NULL = any), carrying ANY of p_tag_ids (empty = any), not in p_exclude. Internal to the generator RPCs.';

-- ---- Teacher: generate a draft assessment (platform + own center) ----
CREATE OR REPLACE FUNCTION public.generate_assessment_from_bank(
  p_classroom_id uuid,
  p_title text,
  p_spec jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller     uuid := (SELECT auth.uid());
  v_org_id     uuid;
  v_subject_id uuid;
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

  IF NOT app.is_teacher() THEN
    RAISE EXCEPTION 'Only teachers can generate assessments';
  END IF;

  IF NOT app.is_classroom_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'You do not teach this classroom';
  END IF;

  v_org_id := app.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no organization';
  END IF;

  IF btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  SELECT c.subject_id INTO v_subject_id FROM classrooms c WHERE c.id = p_classroom_id;

  PERFORM app.validate_generation_spec(p_spec, v_subject_id);

  INSERT INTO assessments (
    organization_id, created_by, title, status, classroom_id, generation_spec
  )
  VALUES (v_org_id, v_caller, btrim(p_title), 'draft', p_classroom_id, p_spec)
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
        INSERT INTO assessment_questions (
          assessment_id, payload, position, points,
          generation_line, generation_difficulty, bank_question_id
        )
        VALUES (
          v_new_id, v_pick.payload, v_position, v_pick.points,
          v_index, v_bucket.difficulty, v_pick.id
        );
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

  RETURN jsonb_build_object('assessment_id', v_new_id, 'shortfalls', v_shortfalls);
END;
$$;

COMMENT ON FUNCTION public.generate_assessment_from_bank(uuid, text, jsonb) IS
  'Decision 90: builds a draft assessment in the caller''s classroom from random picks matching each spec line — drawn across the line''s sub-topics and split by its difficulty ratio, over the platform items plus the caller''s own center''s (copies, with provenance). Returns {assessment_id, shortfalls:[{line, requested, picked}]}.';

-- ---- Teacher: regenerate one question (same pool as the draft was built from) ----
CREATE OR REPLACE FUNCTION public.regenerate_assessment_question(p_question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_question assessment_questions%ROWTYPE;
  v_spec     jsonb;
  v_status   assessment_status;
  v_org_id   uuid;
  v_line     jsonb;
  v_used     uuid[];
  v_pick     assessment_bank_questions%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_question FROM assessment_questions WHERE id = p_question_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found: %', p_question_id;
  END IF;

  IF NOT app.can_write_assessment(v_question.assessment_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this assessment';
  END IF;

  SELECT a.generation_spec, a.status, a.organization_id
    INTO v_spec, v_status, v_org_id
  FROM assessments a WHERE a.id = v_question.assessment_id;

  -- Published assessments are locked: attempts snapshot these rows.
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft assessments can be regenerated';
  END IF;

  IF v_question.generation_line IS NULL OR v_spec IS NULL THEN
    RAISE EXCEPTION 'Question was not generated';
  END IF;

  v_line := v_spec -> v_question.generation_line;

  -- Everything the assessment already holds is off the table, including
  -- the question being replaced.
  SELECT COALESCE(array_agg(aq.bank_question_id), '{}') INTO v_used
  FROM assessment_questions aq
  WHERE aq.assessment_id = v_question.assessment_id
    AND aq.bank_question_id IS NOT NULL;

  -- Same bucket as the question it replaces, so the line's ratio holds; same
  -- pool as the draft was generated from (the assessment's own center).
  SELECT * INTO v_pick
  FROM app.pick_bank_questions(
    v_org_id,
    app.generation_line_sub_topics(v_line),
    app.generation_line_tags(v_line),
    v_question.generation_difficulty,
    v_used,
    1
  );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No other bank question matches these criteria';
  END IF;

  UPDATE assessment_questions
  SET payload = v_pick.payload,
      points = v_pick.points,
      bank_question_id = v_pick.id
  WHERE id = p_question_id;

  RETURN jsonb_build_object(
    'id', p_question_id,
    'payload', v_pick.payload,
    'points', v_pick.points,
    'bank_question_id', v_pick.id
  );
END;
$$;

COMMENT ON FUNCTION public.regenerate_assessment_question(uuid) IS
  'Decision 90: replaces one generated question of a DRAFT assessment with another random pick from its spec line at the SAME difficulty, over the same pool (platform items plus the assessment''s own center''s) and excluding every item already in the assessment. Returns the new {id, payload, points, bank_question_id}.';

-- ---- Admin: generate a template (platform items only) ----
CREATE OR REPLACE FUNCTION public.generate_template_from_bank(
  p_title text,
  p_grade_level_id uuid,
  p_subject_id uuid,
  p_spec jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller     uuid := (SELECT auth.uid());
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

  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only admins can generate templates';
  END IF;

  IF btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM subjects s WHERE s.id = p_subject_id AND s.grade_level_id = p_grade_level_id
  ) THEN
    RAISE EXCEPTION 'Subject does not belong to this grade level';
  END IF;

  PERFORM app.validate_generation_spec(p_spec, p_subject_id);

  INSERT INTO assessment_templates (title, grade_level_id, subject_id, created_by)
  VALUES (btrim(p_title), p_grade_level_id, p_subject_id, v_caller)
  RETURNING id INTO v_new_id;

  FOR v_line, v_index IN
    SELECT value, ordinality - 1 FROM jsonb_array_elements(p_spec) WITH ORDINALITY
  LOOP
    v_picked := 0;

    FOR v_bucket IN
      SELECT * FROM app.allocate_difficulty_mix(
        (v_line->>'count')::integer,
        v_line->'difficulty_mix'
      )
    LOOP
      -- NULL owner: a template may never reference a center's own item.
      FOR v_pick IN
        SELECT * FROM app.pick_bank_questions(
          NULL,
          app.generation_line_sub_topics(v_line),
          app.generation_line_tags(v_line),
          v_bucket.difficulty,
          v_used,
          v_bucket.n
        )
      LOOP
        INSERT INTO assessment_template_questions (template_id, bank_question_id, position)
        VALUES (v_new_id, v_pick.id, v_position);
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

  RETURN jsonb_build_object('template_id', v_new_id, 'shortfalls', v_shortfalls);
END;
$$;

COMMENT ON FUNCTION public.generate_template_from_bank(text, uuid, uuid, jsonb) IS
  'Decision 90, admin variant: builds a draft template from random PLATFORM item picks matching each spec line — across the line''s sub-topics, split by its difficulty ratio — as references. Returns {template_id, shortfalls:[{line, requested, picked}]}.';

-- ------------------------------------------------------------
-- 5. Storage: an item's images follow the item's owner
--
-- Item images live at `assessment-images/bank/<item_id>/…` (P13a) and the
-- path is written verbatim into the payload, so a center's item keeps the
-- same shape as a platform one — only the write authz differs.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.can_write_assessment_image(p_object_name text)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
  SELECT CASE
    -- assessment-images/bank/<item_id>/... — a reusable item: the admin for a
    -- platform item, a center's staff for their own.
    WHEN (storage.foldername(p_object_name))[1] = 'bank'
      THEN
        app.is_admin()
        OR (
          app.is_org_staff()
          AND (storage.foldername(p_object_name))[2]
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND app.assessment_item_org_id(((storage.foldername(p_object_name))[2])::uuid)
              = app.current_org_id()
        )
    WHEN (storage.foldername(p_object_name))[1]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN app.can_write_assessment(((storage.foldername(p_object_name))[1])::uuid)
    ELSE false
  END;
$$;

COMMENT ON FUNCTION app.can_write_assessment_image(text) IS
  'Storage RLS helper for the assessment-images bucket. `bank/<item_id>/...` follows that item''s owner (admin for a platform item, the owning center''s staff otherwise); `<assessment_id>/...` follows that assessment''s write authz (app.can_write_assessment). False for anything else.';
