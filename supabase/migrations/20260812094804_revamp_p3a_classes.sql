-- ============================================================
-- Clavis 2.0 revamp — P3a part 1/2: classes & class membership
--
-- Decision 24: classes are teacher-owned and org-scoped. ANY student in
-- the same organization can be a member (the created_by "own students"
-- notion applies to provisioning, not to class membership).
--
-- Write scoping:
--   manager -> org-wide (any class in their organization)
--   teacher -> own classes only (classes.teacher_id = auth.uid())
--   admin   -> everything (platform role, organization_id IS NULL)
-- Read scoping: any staff member of the owning org, plus students for
-- the classes they belong to (so the client can render class names).
-- ============================================================

-- ------------------------------------------------------------
-- 1. classes
-- ------------------------------------------------------------
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.classes OWNER TO postgres;

COMMENT ON TABLE public.classes IS
  'Teacher-owned, org-scoped class. First consumer is assessment assignment (P3).';

CREATE INDEX idx_classes_organization ON public.classes USING btree (organization_id);
CREATE INDEX idx_classes_teacher ON public.classes USING btree (teacher_id);

CREATE TRIGGER update_classes_updated_at
  BEFORE UPDATE ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 2. class_members
-- ------------------------------------------------------------
CREATE TABLE public.class_members (
  class_id uuid NOT NULL
    REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL
    REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_id)
);

ALTER TABLE public.class_members OWNER TO postgres;

COMMENT ON TABLE public.class_members IS
  'Class roster. Any student of the class''s organization may be a member.';

CREATE INDEX idx_class_members_student ON public.class_members USING btree (student_id);

-- ------------------------------------------------------------
-- 3. Helpers. app.is_admin() / app.current_org_id() /
--    app.is_org_staff() already exist (P1a); same shape here:
--    SECURITY DEFINER STABLE, empty search_path, owner postgres,
--    always called wrapped in (SELECT ...) inside policies.
-- ------------------------------------------------------------

-- Role-differentiated write policies need to tell a manager from a teacher.
CREATE OR REPLACE FUNCTION app.is_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_type = 'manager'
  );
$$;

-- Is the caller a student member of this class?
--
-- SECURITY DEFINER on purpose: class_members' own SELECT policy has to
-- reach public.classes to scope staff reads by organization. If the
-- classes policy reached back into class_members directly, Postgres
-- would abort every query with "infinite recursion detected in policy".
-- Reading the roster through a definer function breaks that cycle.
CREATE OR REPLACE FUNCTION app.is_class_member(p_class_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_members cm
    WHERE cm.class_id = p_class_id
      AND cm.student_id = auth.uid()
  );
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['app.is_manager()', 'app.is_class_member(uuid)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 4. Grants. Supabase's default privileges grant ALL on new public
--    tables to anon/authenticated, so the revokes are load-bearing.
-- ------------------------------------------------------------
REVOKE ALL ON TABLE public.classes FROM PUBLIC;
REVOKE ALL ON TABLE public.classes FROM anon;
REVOKE ALL ON TABLE public.classes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.classes TO authenticated;
GRANT ALL ON TABLE public.classes TO service_role;

REVOKE ALL ON TABLE public.class_members FROM PUBLIC;
REVOKE ALL ON TABLE public.class_members FROM anon;
REVOKE ALL ON TABLE public.class_members FROM authenticated;
-- No UPDATE: the row is nothing but its primary key. Membership changes
-- are add/remove.
GRANT SELECT, INSERT, DELETE ON TABLE public.class_members TO authenticated;
GRANT ALL ON TABLE public.class_members TO service_role;

-- ------------------------------------------------------------
-- 5. RLS: classes
-- ------------------------------------------------------------
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage classes"
  ON public.classes
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Read classes: org staff, student members"
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (
    ((SELECT app.is_org_staff()) AND organization_id = (SELECT app.current_org_id()))
    OR app.is_class_member(id)
  );

CREATE POLICY "Create classes: manager org-wide, teacher own"
  ON public.classes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT app.is_org_staff())
    AND organization_id = (SELECT app.current_org_id())
    AND (
      teacher_id = (SELECT auth.uid())
      OR (
        (SELECT app.is_manager())
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = public.classes.teacher_id
            AND p.organization_id = (SELECT app.current_org_id())
            AND p.user_type = 'teacher'::public.user_role
        )
      )
    )
  );

CREATE POLICY "Update classes: manager org-wide, teacher own"
  ON public.classes
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = (SELECT app.current_org_id())
    AND ((SELECT app.is_manager()) OR teacher_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    organization_id = (SELECT app.current_org_id())
    AND ((SELECT app.is_manager()) OR teacher_id = (SELECT auth.uid()))
  );

CREATE POLICY "Delete classes: manager org-wide, teacher own"
  ON public.classes
  FOR DELETE
  TO authenticated
  USING (
    organization_id = (SELECT app.current_org_id())
    AND ((SELECT app.is_manager()) OR teacher_id = (SELECT auth.uid()))
  );

-- ------------------------------------------------------------
-- 6. RLS: class_members
-- ------------------------------------------------------------
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage class members"
  ON public.class_members
  FOR ALL
  TO authenticated
  USING ((SELECT app.is_admin()))
  WITH CHECK ((SELECT app.is_admin()));

CREATE POLICY "Read class members: self, org staff"
  ON public.class_members
  FOR SELECT
  TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR (
      (SELECT app.is_org_staff())
      AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = public.class_members.class_id
          AND c.organization_id = (SELECT app.current_org_id())
      )
    )
  );

CREATE POLICY "Add class members: manager org-wide, teacher own classes"
  ON public.class_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = public.class_members.class_id
        AND c.organization_id = (SELECT app.current_org_id())
        AND ((SELECT app.is_manager()) OR c.teacher_id = (SELECT auth.uid()))
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.class_members.student_id
        AND p.organization_id = (SELECT app.current_org_id())
        AND p.user_type = 'student'::public.user_role
    )
  );

CREATE POLICY "Remove class members: manager org-wide, teacher own classes"
  ON public.class_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = public.class_members.class_id
        AND c.organization_id = (SELECT app.current_org_id())
        AND ((SELECT app.is_manager()) OR c.teacher_id = (SELECT auth.uid()))
    )
  );
