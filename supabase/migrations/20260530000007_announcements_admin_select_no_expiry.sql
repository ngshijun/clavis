-- ============================================================
-- Announcements SELECT: admins see all (incl. expired), audience gated by expiry
--
-- The old single policy "Authenticated users can view relevant
-- announcements" ANDed the expiry gate (expires_at IS NULL OR
-- expires_at > now()) across ALL branches, including the admin branch.
-- This hid expired announcements from admins, blocking them from
-- managing/cleaning up expired rows.
--
-- Replace with two policies:
--   * Admins: no expiry predicate (manage every row).
--   * Students/parents: expiry gate retained, audience-scoped.
-- Multiple permissive SELECT policies are OR-combined, preserving the
-- exact student/parent visibility of the original policy.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can view relevant announcements" ON public.announcements;

-- Admins: see every announcement regardless of expiry.
CREATE POLICY "Admins can view all announcements"
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.user_type = 'admin'::public.user_type
    )
  );

-- Students and parents: only non-expired announcements for their audience.
CREATE POLICY "Students and parents can view relevant announcements"
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (
    (expires_at IS NULL OR expires_at > now())
    AND (
      (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.user_type = 'student'::public.user_type
        )
        AND target_audience = ANY (ARRAY['all'::public.announcement_audience, 'students_only'::public.announcement_audience])
      )
      OR (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = (SELECT auth.uid())
            AND p.user_type = 'parent'::public.user_type
        )
        AND target_audience = ANY (ARRAY['all'::public.announcement_audience, 'parents_only'::public.announcement_audience])
      )
    )
  );
