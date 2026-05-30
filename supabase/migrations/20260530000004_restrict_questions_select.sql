-- ============================================================
-- Restrict questions SELECT to authenticated; revoke anon access
--
-- The questions table contains the answer keys (option_N_is_correct and
-- the short-answer `answer` column). The old policy "Questions are
-- viewable by everyone" used USING (true) with no TO clause, so it
-- applied to PUBLIC (including anon), and anon held GRANT ALL on the
-- table — making the answer keys world-readable.
--
-- Fix: scope the SELECT policy to authenticated and revoke the anon
-- table grant. Authenticated practice reads are unaffected (the client
-- only ever reads questions while logged in).
-- ============================================================

DROP POLICY IF EXISTS "Questions are viewable by everyone" ON public.questions;

CREATE POLICY "Questions are viewable by authenticated users"
  ON public.questions
  FOR SELECT
  TO authenticated
  USING (true);

-- Remove all table privileges from anon (it had GRANT ALL).
REVOKE ALL ON TABLE public.questions FROM anon;
