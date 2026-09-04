-- ============================================================
-- Clavis revamp — P17a: a template is an ordered list of bank questions
--
-- Decision 89. Until now an admin template was an `assessments` row flagged
-- is_template, holding its own `assessment_questions` copies, while the same
-- admin also kept an assessment bank the template could copy FROM. The same
-- question therefore lived twice, and nothing kept the copies together: an
-- edit in one never reached the other, a typo had to be fixed once per
-- template, and "which one is the real question?" had no answer.
--
-- Now the bank is the ONLY store of admin questions:
--
--   * `assessment_bank_questions` is filed under a sub-topic (the curriculum
--     already fixes topic, subject and grade from it), so the grade+subject
--     columns go. Sub-topics were kept out of the exam bank in P13a on
--     purpose; the auto-generation mode that follows needs them, and an
--     unfiled bank cannot feed it.
--   * `assessment_templates` owns a title, a grade+subject pairing, a status
--     and the delivery settings a clone inherits — and NO question content.
--   * `assessment_template_questions` is the ordered set of references. One
--     bank question may sit in any number of templates; editing it edits
--     every template at once; removing it from a template leaves the bank
--     alone; deleting it from the bank drops it out of every template.
--
-- Safe where the practice-bank link (removed in P16a) was not: a template is
-- never attempted. Only a teacher's CLONE is, and cloning still copies the
-- payloads into `assessment_questions`, so a later bank edit reaches no
-- attempt.
--
-- `assessments` sheds its template machinery: is_template, the grade+subject
-- pairing (which non-templates never carried), the three CHECKs that told the
-- two kinds apart, and the helper functions/policies that let staff read
-- templates through it. Every assessment is now an org-owned, classroom-owned
-- row, so both of those columns become NOT NULL.
--
-- Data: existing templates move across; their questions become bank rows
-- with the SAME id (so the reference join is the identity) filed under the
-- first sub-topic of the template's subject at medium difficulty, because the
-- old rows carried neither a sub-topic nor a difficulty. Existing bank rows
-- are refiled the same way. A subject with no sub-topic cannot file anything,
-- and rows that land there are deleted rather than left half-filed.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The bank is filed under a sub-topic
-- ------------------------------------------------------------
ALTER TABLE public.assessment_bank_questions
  ADD COLUMN sub_topic_id uuid REFERENCES public.sub_topics(id) ON DELETE RESTRICT;

UPDATE public.assessment_bank_questions bq
SET sub_topic_id = (
  SELECT st.id
  FROM public.sub_topics st
  JOIN public.topics tp ON tp.id = st.topic_id
  WHERE tp.subject_id = bq.subject_id
  ORDER BY tp.display_order NULLS LAST, st.display_order NULLS LAST, st.created_at
  LIMIT 1
);

DELETE FROM public.assessment_bank_questions WHERE sub_topic_id IS NULL;

-- The grade<->subject consistency trigger guarded the pairing columns; the
-- curriculum tables now carry that relationship for us.
DROP TRIGGER enforce_assessment_bank_question_curriculum ON public.assessment_bank_questions;
DROP FUNCTION public.enforce_assessment_bank_question_curriculum();

ALTER TABLE public.assessment_bank_questions
  ALTER COLUMN sub_topic_id SET NOT NULL,
  DROP COLUMN grade_level_id,
  DROP COLUMN subject_id;

CREATE INDEX idx_assessment_bank_questions_sub_topic
  ON public.assessment_bank_questions USING btree (sub_topic_id);

COMMENT ON TABLE public.assessment_bank_questions IS
  'The only store of admin assessment questions (decision 89). Filed under a sub-topic, which fixes topic, subject and grade. A template references these rows; a teacher''s clone copies them.';

COMMENT ON COLUMN public.assessment_bank_questions.sub_topic_id IS
  'Where the question is filed. Topic, subject and grade follow from it through the curriculum tables.';

-- ------------------------------------------------------------
-- 2. Templates and their references
-- ------------------------------------------------------------
CREATE TABLE public.assessment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  -- The pairing decides which centers may see and clone the template
  -- (decision 61) and which sub-topics its questions may come from. It is
  -- fixed at creation: changing it would invalidate every reference.
  grade_level_id uuid NOT NULL REFERENCES public.grade_levels(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  -- draft = admin still composing; published = visible to matching staff.
  -- Content is never locked by status: a template has no attempts to protect.
  status public.assessment_status NOT NULL DEFAULT 'draft',
  -- Delivery settings a clone starts from.
  time_limit_seconds integer CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
  shuffle_questions boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assessment_templates OWNER TO postgres;

COMMENT ON TABLE public.assessment_templates IS
  'Admin-authored assessment template (decision 89): title, pairing, status and delivery settings. Its questions are references into assessment_bank_questions; it is never assigned or attempted, only cloned.';

CREATE INDEX idx_assessment_templates_grade_subject
  ON public.assessment_templates USING btree (grade_level_id, subject_id);

CREATE TRIGGER update_assessment_templates_updated_at
  BEFORE UPDATE ON public.assessment_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.assessment_template_questions (
  template_id uuid NOT NULL REFERENCES public.assessment_templates(id) ON DELETE CASCADE,
  bank_question_id uuid NOT NULL REFERENCES public.assessment_bank_questions(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (template_id, bank_question_id)
);

ALTER TABLE public.assessment_template_questions OWNER TO postgres;

COMMENT ON TABLE public.assessment_template_questions IS
  'The ordered set of bank questions a template is made of. A reference, not a copy: the bank row IS the question. Deleting the bank row removes it from every template.';

CREATE INDEX idx_assessment_template_questions_bank_question
  ON public.assessment_template_questions USING btree (bank_question_id);

-- A template only holds questions filed under its own subject. Two edges
-- can break that: adding a reference, and refiling a bank question under
-- another subject while it is referenced. The pairing itself cannot change
-- (no UPDATE grant on those columns below), so those two are the lot.
CREATE OR REPLACE FUNCTION public.enforce_template_question_scope()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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

ALTER FUNCTION public.enforce_template_question_scope() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_template_question_scope() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_enforce_template_question_scope
  BEFORE INSERT ON public.assessment_template_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_template_question_scope();

CREATE OR REPLACE FUNCTION public.enforce_bank_question_refile()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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

ALTER FUNCTION public.enforce_bank_question_refile() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_bank_question_refile() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_enforce_bank_question_refile
  BEFORE UPDATE OF sub_topic_id ON public.assessment_bank_questions
  FOR EACH ROW
  WHEN (OLD.sub_topic_id IS DISTINCT FROM NEW.sub_topic_id)
  EXECUTE FUNCTION public.enforce_bank_question_refile();

-- ------------------------------------------------------------
-- 3. Move the existing templates across
-- ------------------------------------------------------------
INSERT INTO public.assessment_templates (
  id, title, description, grade_level_id, subject_id, status,
  time_limit_seconds, shuffle_questions, created_by, created_at, updated_at
)
SELECT
  a.id, a.title, a.description, a.grade_level_id, a.subject_id, a.status,
  a.time_limit_seconds, a.shuffle_questions, a.created_by, a.created_at, a.updated_at
FROM public.assessments a
WHERE a.is_template;

-- Each template question becomes a bank row with the same id, filed under
-- the first sub-topic of the template's subject at medium difficulty (the
-- old rows carried neither). Questions of a subject with no sub-topic have
-- nowhere to go and are left behind.
INSERT INTO public.assessment_bank_questions (
  id, payload, difficulty, sub_topic_id, points, created_by, created_at, updated_at
)
SELECT
  aq.id, aq.payload, 'medium', filed.sub_topic_id, aq.points,
  a.created_by, aq.created_at, aq.created_at
FROM public.assessment_questions aq
JOIN public.assessments a ON a.id = aq.assessment_id
JOIN LATERAL (
  SELECT st.id AS sub_topic_id
  FROM public.sub_topics st
  JOIN public.topics tp ON tp.id = st.topic_id
  WHERE tp.subject_id = a.subject_id
  ORDER BY tp.display_order NULLS LAST, st.display_order NULLS LAST, st.created_at
  LIMIT 1
) filed ON true
WHERE a.is_template;

INSERT INTO public.assessment_template_questions (template_id, bank_question_id, position)
SELECT aq.assessment_id, aq.id, aq.position
FROM public.assessment_questions aq
JOIN public.assessment_bank_questions bq ON bq.id = aq.id
JOIN public.assessments a ON a.id = aq.assessment_id
WHERE a.is_template;

-- ------------------------------------------------------------
-- 4. assessments: no more templates
-- ------------------------------------------------------------
DELETE FROM public.assessments WHERE is_template;

DROP POLICY "Read assessment templates: matched org staff" ON public.assessments;
DROP POLICY "Read assessment questions: matched templates for org staff" ON public.assessment_questions;

DROP FUNCTION app.assessment_template_visible(uuid);
DROP FUNCTION app.assessment_is_template(uuid);

ALTER TABLE public.assessments
  DROP CONSTRAINT assessments_template_org_check,
  DROP CONSTRAINT assessments_scope_check,
  DROP CONSTRAINT assessments_classroom_matches_kind;

DROP INDEX public.idx_assessments_is_template;

ALTER TABLE public.assessments
  DROP COLUMN is_template,
  DROP COLUMN grade_level_id,
  DROP COLUMN subject_id,
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN classroom_id SET NOT NULL;

COMMENT ON COLUMN public.assessments.organization_id IS
  'Owning tuition center.';

-- The assignment guard loses its template branch: nothing in `assessments`
-- is a template any more.
CREATE OR REPLACE FUNCTION public.enforce_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_classroom_id uuid;
BEGIN
  SELECT a.classroom_id INTO v_classroom_id
  FROM assessments a
  WHERE a.id = NEW.assessment_id;

  -- A missing assessment is left to the FK constraint to report.
  IF NEW.classroom_id IS NOT NULL AND NEW.classroom_id <> v_classroom_id THEN
    RAISE EXCEPTION 'Assessment belongs to a different classroom';
  END IF;

  IF NEW.student_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM classroom_students cs
       WHERE cs.student_id = NEW.student_id
         AND cs.classroom_id = v_classroom_id
     )
  THEN
    RAISE EXCEPTION 'Student is not in this assessment''s classroom';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_assignment_scope() IS
  'Assignment guard (decisions 62/81): an assessment only reaches its OWN classroom or a student enrolled in it. Role-independent.';

-- ------------------------------------------------------------
-- 5. Access
--
-- Admin: everything. Org staff: read a PUBLISHED template whose pairing
-- matches one of their classrooms (decision 61), and the reference rows of
-- such a template (ids and positions only — the bank stays admin-only, and
-- the payloads reach staff through get_template_questions below).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.assessment_template_visible(p_template_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assessment_templates t
    WHERE t.id = p_template_id
      AND t.status = 'published'
      AND app.has_matching_classroom(t.grade_level_id, t.subject_id)
  );
$$;

ALTER FUNCTION app.assessment_template_visible(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.assessment_template_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.assessment_template_visible(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION app.assessment_template_visible(uuid) IS
  'True when the template is published and its pairing matches one of the caller''s classrooms (admin: any published template). Decision 61.';

REVOKE ALL ON TABLE public.assessment_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.assessment_templates TO authenticated;
-- The pairing is fixed at creation (see the scope trigger above).
GRANT UPDATE (title, description, status, time_limit_seconds, shuffle_questions, updated_at)
  ON TABLE public.assessment_templates TO authenticated;
GRANT ALL ON TABLE public.assessment_templates TO service_role;

REVOKE ALL ON TABLE public.assessment_template_questions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.assessment_template_questions TO authenticated;
GRANT ALL ON TABLE public.assessment_template_questions TO service_role;

ALTER TABLE public.assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_template_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage assessment templates"
  ON public.assessment_templates
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Read published templates: matched org staff"
  ON public.assessment_templates
  FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    AND (SELECT app.is_org_staff())
    AND app.has_matching_classroom(grade_level_id, subject_id)
  );

CREATE POLICY "Admins manage template questions"
  ON public.assessment_template_questions
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Read template questions: visible templates"
  ON public.assessment_template_questions
  FOR SELECT
  TO authenticated
  USING (
    (SELECT app.is_org_staff())
    AND app.assessment_template_visible(template_id)
  );

-- ------------------------------------------------------------
-- 6. Reading a template's questions
--
-- One path for every role. The admin could join the bank directly, but staff
-- cannot (the bank has no staff read grant), and a staff preview of a
-- template needs the same rows. Authorization mirrors the SELECT policies.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_template_questions(p_template_id uuid)
RETURNS TABLE (
  id uuid,
  "position" integer,
  payload jsonb,
  difficulty public.question_difficulty,
  points numeric,
  sub_topic_id uuid,
  tag_ids uuid[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    bq.id,
    tq.position,
    bq.payload,
    bq.difficulty,
    bq.points,
    bq.sub_topic_id,
    COALESCE(
      (SELECT array_agg(bt.tag_id ORDER BY bt.created_at)
       FROM assessment_bank_question_tags bt
       WHERE bt.assessment_bank_question_id = bq.id),
      '{}'::uuid[]
    )
  FROM assessment_template_questions tq
  JOIN assessment_bank_questions bq ON bq.id = tq.bank_question_id
  WHERE tq.template_id = p_template_id
    AND (
      app.is_admin()
      OR (app.is_org_staff() AND app.assessment_template_visible(p_template_id))
    )
  ORDER BY tq.position;
$$;

ALTER FUNCTION public.get_template_questions(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_template_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_template_questions(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_template_questions(uuid) IS
  'A template''s questions in order, with the bank payload each reference points at. Admin: any template; org staff: a published template matching one of their classrooms. Anything else is empty.';

-- ------------------------------------------------------------
-- 7. Reordering
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_template_questions(p_template_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_children bigint;
  v_matched bigint;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to edit this template';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM assessment_templates WHERE id = p_template_id) THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  SELECT count(*) INTO v_children
  FROM assessment_template_questions tq WHERE tq.template_id = p_template_id;

  SELECT count(*) INTO v_matched
  FROM assessment_template_questions tq
  WHERE tq.template_id = p_template_id AND tq.bank_question_id = ANY (p_ids);

  PERFORM app.assert_reorder_permutation('assessment_template_questions', p_ids, v_children, v_matched);

  UPDATE assessment_template_questions tq
  SET position = i.ord
  FROM unnest(p_ids) WITH ORDINALITY AS i(id, ord)
  WHERE tq.bank_question_id = i.id
    AND tq.template_id = p_template_id;
END;
$$;

ALTER FUNCTION public.reorder_template_questions(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reorder_template_questions(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_template_questions(uuid, uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.reorder_template_questions(uuid, uuid[]) IS
  'Positional reorder of one template''s references (admin only): position = 1-based index of p_ids (bank question ids).';

-- ------------------------------------------------------------
-- 8. Cloning: copy the bank payloads into a teacher's own assessment
-- ------------------------------------------------------------
DROP FUNCTION public.clone_assessment_template(uuid, uuid);

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
  v_template assessment_templates%ROWTYPE;
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

  SELECT * INTO v_template
  FROM assessment_templates
  WHERE id = p_template_id AND status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
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
    status, time_limit_seconds, shuffle_questions, classroom_id
  )
  VALUES (
    v_org_id, v_caller, v_template.title, v_template.description,
    'draft', v_template.time_limit_seconds, v_template.shuffle_questions,
    p_classroom_id
  )
  RETURNING id INTO v_new_id;

  -- A teacher's copy in their own classroom: payload, order and marks, and
  -- nothing that could ever reach back into the admin bank.
  INSERT INTO assessment_questions (assessment_id, payload, position, points)
  SELECT v_new_id, bq.payload, tq.position, bq.points
  FROM assessment_template_questions tq
  JOIN assessment_bank_questions bq ON bq.id = tq.bank_question_id
  WHERE tq.template_id = p_template_id;

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION public.clone_assessment_template(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.clone_assessment_template(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clone_assessment_template(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.clone_assessment_template(uuid, uuid) IS
  'Clones a published template into a new draft assessment owned by the calling teacher in the given classroom, copying each referenced bank question''s payload and points. Returns the new assessment id.';
