-- ============================================================
-- Clavis 2.3 revamp — P7a part 1/2: admin assessment templates
--
-- Decisions 54-56:
--   * Admin (platform-level, no org) authors assessments flagged as
--     TEMPLATES, visible as a shared read-only library to ALL centers.
--   * A manager/teacher clones a template into a new org-scoped, editable
--     assessment owned by the caller (clone_assessment_template), then
--     edits + assigns it normally. The template and other centers are
--     unaffected.
--
-- Schema:
--   * assessments.organization_id becomes NULLABLE.
--   * assessments.is_template boolean NOT NULL DEFAULT false.
--   * CHECK: a template has NO org, a normal assessment HAS an org.
--       platform template = (is_template = true  AND organization_id IS NULL)
--       normal assessment = (is_template = false AND organization_id IS NOT NULL)
--
-- Access (decisions 55-56):
--   * Admin: full CRUD on templates via the pre-existing "Admins manage
--     assessments" FOR ALL policy (is_admin(), org-agnostic). The CHECK
--     constraint forces any org-less assessment to be a template, so an
--     admin can only author org-less rows AS templates.
--   * Org staff (manager/teacher): NEW read-only cross-center SELECT of
--     templates (assessments + their questions, for preview/clone). They
--     CANNOT create/edit/delete templates — the existing write policies are
--     all org-scoped (organization_id = current_org_id()), which never
--     matches a template's NULL org.
--   * Students: never see templates (not org staff; no assignment path).
--
-- Assignment guard: a template can NEVER be an assignment target — enforced
-- by a BEFORE INSERT/UPDATE trigger on assessment_assignments (role
-- independent: it blocks even the admin FOR ALL / service-role paths that
-- RLS does not gate). The org-staff assignment policies already reject
-- templates implicitly (assessment_org_id = NULL never equals current_org_id).
--
-- The P3a/P6a attempt-side sanitizing contracts are UNTOUCHED: templates are
-- never attempted, so get_attempt_questions / get_attempt_result / the
-- attempt_answers is_correct revoke / grade_attempt_answer all stay exactly
-- as shipped. This migration adds no path from a student to a template.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Schema: nullable org + is_template + the template/org CHECK
-- ------------------------------------------------------------
ALTER TABLE public.assessments
  ALTER COLUMN organization_id DROP NOT NULL,
  ADD COLUMN is_template boolean NOT NULL DEFAULT false;

ALTER TABLE public.assessments
  ADD CONSTRAINT assessments_template_org_check
  CHECK (
    (is_template AND organization_id IS NULL)
    OR (NOT is_template AND organization_id IS NOT NULL)
  );

COMMENT ON COLUMN public.assessments.is_template IS
  'true = platform template (organization_id NULL, admin-authored, cloned by centers). false = normal org-scoped assessment.';

COMMENT ON COLUMN public.assessments.organization_id IS
  'Owning tuition center. NULL only for platform templates (is_template = true).';

-- Fast lookups of the (small) template library.
CREATE INDEX idx_assessments_is_template
  ON public.assessments USING btree (is_template)
  WHERE is_template;

-- ------------------------------------------------------------
-- 2. Helper: is this assessment a template?
--    SECURITY DEFINER (RLS-bypassing) so policies/triggers can read the
--    flag without adding an edge to the policy dependency graph, mirroring
--    app.assessment_org_id. Empty search_path, owner postgres.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.assessment_is_template(p_assessment_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(
    (SELECT is_template FROM public.assessments WHERE id = p_assessment_id),
    false
  );
$$;

ALTER FUNCTION app.assessment_is_template(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.assessment_is_template(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assessment_is_template(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.assessment_is_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.assessment_is_template(uuid) TO service_role;

-- ------------------------------------------------------------
-- 3. RLS: assessments — org staff read templates (cross-center, read-only)
--
-- Additive SELECT policy (permissive policies are OR'd). Admin already
-- reads every row via "Admins manage assessments" FOR ALL; the existing
-- "Read assessments: org staff, assigned students" policy returns false for
-- a template row (org-null never equals current_org_id, and a template has
-- no assignment), so this policy is the only path org staff have to a
-- template. Students are not org staff -> no access.
-- ------------------------------------------------------------
CREATE POLICY "Read assessment templates: org staff"
  ON public.assessments
  FOR SELECT
  TO authenticated
  USING (
    is_template
    AND (SELECT app.is_org_staff())
  );

-- ------------------------------------------------------------
-- 4. RLS: assessment_questions — org staff read a TEMPLATE's questions
--
-- The P3a-fix "Read assessment questions: staff only" policy scopes org
-- staff to assessment_org_id = current_org_id(), which is NULL for a
-- template and so denies. This additive policy grants org staff read of a
-- template's questions (for the preview/clone UI). Admin still reads all via
-- the staff-only policy's is_admin() branch. No write policy is added:
-- org staff cannot edit template questions (can_write_assessment denies on
-- the NULL org); the clone RPC copies them with definer rights instead.
-- ------------------------------------------------------------
CREATE POLICY "Read assessment questions: templates for org staff"
  ON public.assessment_questions
  FOR SELECT
  TO authenticated
  USING (
    (SELECT app.is_org_staff())
    AND app.assessment_is_template(assessment_id)
  );

-- ------------------------------------------------------------
-- 5. Assignment guard: a template can NEVER be an assignment target.
--
-- A CHECK constraint cannot reach another table, and RLS does not gate the
-- admin FOR ALL / service-role write paths, so the hard guarantee is a
-- BEFORE INSERT/UPDATE trigger. Org-staff assignments are additionally
-- blocked at the policy layer (assessment_org_id NULL != current_org_id),
-- but this trigger makes it impossible for every role.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_template_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF app.assessment_is_template(NEW.assessment_id) THEN
    RAISE EXCEPTION 'Cannot assign a template assessment';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.reject_template_assignment() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_template_assignment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_template_assignment() FROM anon;
REVOKE ALL ON FUNCTION public.reject_template_assignment() FROM authenticated;

CREATE TRIGGER trg_reject_template_assignment
  BEFORE INSERT OR UPDATE ON public.assessment_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_template_assignment();

-- ------------------------------------------------------------
-- 6. clone_assessment_template(p_template_id) -> new assessment id
--
-- Decision 56. SECURITY DEFINER: the caller reads a cross-center template
-- (which their own RLS allows for read) and writes into their own org. The
-- new row is a normal, editable, org-scoped draft owned by the caller.
--
-- Caller must be org staff (manager OR teacher) with an org. Source must
-- exist and be a template. Copies title/description/time_limit_seconds/
-- shuffle_questions + every assessment_questions row (position, points,
-- question_id, payload). Returns the new assessment id.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clone_assessment_template(p_template_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_org_id uuid;
  v_template assessments%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only org staff (manager or teacher) clone; admins author templates.
  IF NOT app.is_org_staff() THEN
    RAISE EXCEPTION 'Only managers and teachers can clone templates';
  END IF;

  v_org_id := app.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no organization';
  END IF;

  SELECT * INTO v_template
  FROM assessments
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  IF NOT v_template.is_template THEN
    RAISE EXCEPTION 'Assessment is not a template: %', p_template_id;
  END IF;

  -- The clone is a normal, editable draft owned by the caller in their org.
  INSERT INTO assessments (
    organization_id, created_by, title, description,
    status, time_limit_seconds, shuffle_questions, is_template
  )
  VALUES (
    v_org_id, v_caller, v_template.title, v_template.description,
    'draft', v_template.time_limit_seconds, v_template.shuffle_questions, false
  )
  RETURNING id INTO v_new_id;

  INSERT INTO assessment_questions (
    assessment_id, question_id, payload, position, points
  )
  SELECT v_new_id, aq.question_id, aq.payload, aq.position, aq.points
  FROM assessment_questions aq
  WHERE aq.assessment_id = p_template_id;

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION public.clone_assessment_template(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.clone_assessment_template(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clone_assessment_template(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clone_assessment_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clone_assessment_template(uuid) TO service_role;

COMMENT ON FUNCTION public.clone_assessment_template(uuid) IS
  'Clones a platform template into a new org-scoped editable draft owned by the calling manager/teacher (copies questions). Returns the new assessment id.';
