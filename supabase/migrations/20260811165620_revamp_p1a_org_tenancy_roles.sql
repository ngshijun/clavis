-- ============================================================
-- Clavis 2.0 revamp — P1a part 2/3: B2B org tenancy + 4-role model
--
-- * Deletes parent accounts (auth.users rows; profiles cascade).
-- * Swaps the role enum: user_type ('admin','student','parent') ->
--   user_role ('admin','manager','teacher','student'). New type +
--   column cast avoids ALTER TYPE ADD VALUE transaction restrictions
--   and leaves no dead 'parent' value.
-- * Creates organizations; profiles.organization_id (NULL = platform
--   admin, enforced by CHECK).
-- * Seeds "Clavis Demo Center" and attaches every existing student.
-- * student_profiles.created_by (creating teacher) + username
--   (unique, nullable for legacy email-based students).
--
-- DESTRUCTIVE: deletes all parent auth.users rows. Their
-- payment_history records survive (FKs detached in part 1/3).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop every remaining policy whose expression references
--    profiles.user_type (ALTER COLUMN TYPE refuses to run while
--    policies depend on the column). All are recreated org-scoped
--    in part 3/3.
-- ------------------------------------------------------------
-- grade_levels
DROP POLICY "Admins can insert grade levels" ON public.grade_levels;
DROP POLICY "Admins can update grade levels" ON public.grade_levels;
DROP POLICY "Admins can delete grade levels" ON public.grade_levels;
-- subjects
DROP POLICY "Admins can insert subjects" ON public.subjects;
DROP POLICY "Admins can update subjects" ON public.subjects;
DROP POLICY "Admins can delete subjects" ON public.subjects;
-- topics
DROP POLICY "Allow admin insert on topics" ON public.topics;
DROP POLICY "Allow admin update on topics" ON public.topics;
DROP POLICY "Allow admin delete on topics" ON public.topics;
-- sub_topics (policy names predate the topics/sub_topics rename)
DROP POLICY "Admins can insert topics" ON public.sub_topics;
DROP POLICY "Admins can update topics" ON public.sub_topics;
DROP POLICY "Admins can delete topics" ON public.sub_topics;
-- questions
DROP POLICY "Admins can insert questions" ON public.questions;
DROP POLICY "Admins can update questions" ON public.questions;
DROP POLICY "Admins can delete questions" ON public.questions;
-- announcements
DROP POLICY "Admins can insert announcements" ON public.announcements;
DROP POLICY "Admins can update announcements" ON public.announcements;
DROP POLICY "Admins can delete announcements" ON public.announcements;
DROP POLICY "Admins can view all announcements" ON public.announcements;
DROP POLICY "Students and parents can view relevant announcements" ON public.announcements;
-- question_feedback
DROP POLICY "Admins can update feedback" ON public.question_feedback;
DROP POLICY "Admins can delete feedback" ON public.question_feedback;
DROP POLICY "Users can view relevant feedback" ON public.question_feedback;

-- ------------------------------------------------------------
-- 2. Delete parent accounts. profiles / announcement_reads /
--    question_feedback rows cascade from auth.users; payment_history
--    is already detached and keeps its rows.
-- ------------------------------------------------------------
DELETE FROM auth.users
WHERE id IN (SELECT id FROM public.profiles WHERE user_type = 'parent');

-- ------------------------------------------------------------
-- 3. Role enum swap
--
-- Beyond the policies dropped explicitly above, dashboard-created
-- storage.objects policies (admin upload/update/delete for the
-- avatars / question-images / announcement-images / curriculum-images
-- buckets) also reference profiles.user_type and block the ALTER.
-- They are captured from pg_policies, dropped, and recreated verbatim
-- after the swap with '::user_type' casts rewritten to '::user_role'
-- ('admin' exists in both enums, so the semantics are unchanged).
-- ------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM ('admin', 'manager', 'teacher', 'student');

DO $$
DECLARE
  pol RECORD;
  pols jsonb := '[]'::jsonb;
  v_qual text;
  v_check text;
BEGIN
  -- Capture and drop every remaining policy whose expression references
  -- the user_type column/enum.
  FOR pol IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE qual LIKE '%user_type%' OR with_check LIKE '%user_type%'
  LOOP
    pols := pols || jsonb_build_object(
      'schemaname', pol.schemaname,
      'tablename', pol.tablename,
      'policyname', pol.policyname,
      'permissive', pol.permissive,
      'roles', array_to_string(pol.roles, ', '),
      'cmd', pol.cmd,
      'qual', pol.qual,
      'with_check', pol.with_check
    );
    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;

  -- The swap itself
  EXECUTE 'ALTER TABLE public.profiles
             ALTER COLUMN user_type TYPE public.user_role
             USING (user_type::text::public.user_role)';
  EXECUTE 'DROP TYPE public.user_type';

  -- Recreate the captured policies against the new enum
  FOR pol IN
    SELECT *
    FROM jsonb_to_recordset(pols) AS p(
      schemaname text, tablename text, policyname text, permissive text,
      roles text, cmd text, qual text, with_check text
    )
  LOOP
    v_qual := replace(replace(pol.qual, '::public.user_type', '::public.user_role'), '::user_type', '::user_role');
    v_check := replace(replace(pol.with_check, '::public.user_type', '::public.user_role'), '::user_type', '::user_role');
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s %s %s',
      pol.policyname, pol.schemaname, pol.tablename,
      pol.permissive, pol.cmd, pol.roles,
      CASE WHEN v_qual IS NOT NULL THEN 'USING (' || v_qual || ')' ELSE '' END,
      CASE WHEN v_check IS NOT NULL THEN 'WITH CHECK (' || v_check || ')' ELSE '' END
    );
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 4. Organizations (tuition centers)
-- ------------------------------------------------------------
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

-- ------------------------------------------------------------
-- 5. profiles.organization_id — single-org membership.
--    NULL = platform admin, everyone else must belong to one org.
-- ------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX idx_profiles_organization_id ON public.profiles (organization_id);

-- ------------------------------------------------------------
-- 6. Seed org + attach existing students
-- ------------------------------------------------------------
INSERT INTO public.organizations (name)
VALUES ('Clavis Demo Center')
ON CONFLICT (name) DO NOTHING;

UPDATE public.profiles
SET organization_id = (SELECT id FROM public.organizations WHERE name = 'Clavis Demo Center')
WHERE user_type <> 'admin' AND organization_id IS NULL;

-- Admin <=> no org; manager/teacher/student <=> exactly one org.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_admin_iff_no_org
  CHECK ((user_type = 'admin') = (organization_id IS NULL));

-- ------------------------------------------------------------
-- 7. Teacher->student relation + username-based student logins
-- ------------------------------------------------------------
ALTER TABLE public.student_profiles
  ADD COLUMN created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN username text,
  ADD CONSTRAINT student_profiles_username_key UNIQUE (username);

CREATE INDEX idx_student_profiles_created_by ON public.student_profiles (created_by);
