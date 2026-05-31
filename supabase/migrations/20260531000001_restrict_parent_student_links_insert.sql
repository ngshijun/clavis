-- ============================================================
-- Restrict parent_student_links INSERT to the invitation RPC (security-9)
--
-- The old policy "Users can create links when accepting invitation" allowed any
-- authenticated user to INSERT a link as long as they were one side of it:
--   WITH CHECK (parent_id = auth.uid() OR student_id = auth.uid())
-- Via direct PostgREST this let a user UNILATERALLY link themselves to an
-- arbitrary counterparty (a student attaching themselves to any parent, or a
-- parent attaching any student), bypassing the mutual invitation handshake.
--
-- Links are only ever created legitimately inside
-- accept_parent_student_invitation(), which is SECURITY DEFINER and therefore
-- runs as the table owner and bypasses RLS. No client code inserts into this
-- table directly (only SELECT and DELETE). The direct INSERT policy is thus
-- unnecessary and is removed: with no INSERT policy, RLS default-denies direct
-- inserts while the SECURITY DEFINER RPC path keeps working unchanged.
-- ============================================================

DROP POLICY IF EXISTS "Users can create links when accepting invitation"
  ON public.parent_student_links;
