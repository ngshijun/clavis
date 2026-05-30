-- ============================================================
-- Scope weekly_leaderboard_rewards SELECT to owner + admin
--
-- The old policy "Authenticated users can read weekly rewards" used
-- USING (true), letting every authenticated user read every student's
-- per-student reward rows (week_start, rank, weekly_xp, coins_awarded,
-- seen_at). Scope it to the owning student plus admin. Aggregate
-- standings remain available via the weekly_leaderboard view.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can read weekly rewards" ON public.weekly_leaderboard_rewards;

CREATE POLICY "Students and admins can read weekly rewards"
  ON public.weekly_leaderboard_rewards
  FOR SELECT
  TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.user_type = 'admin'::public.user_type
    )
  );
