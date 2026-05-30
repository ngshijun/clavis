-- ============================================================
-- Restrict student_profiles SELECT (PRIVACY-IMPROVING CHANGE)
--
-- The old policy "All authenticated users can view student profiles"
-- used USING (true), exposing every student's coins, xp, current_streak,
-- subscription_tier, grade_level_id and friend_code to any logged-in
-- user. The client even queried by friend_code and by partial name
-- (src/composables/useFriendSearch.ts), leaking the entire roster.
--
-- New policy: a student can read their own row; a linked parent can read
-- their child's row; admins can read all rows. Friend search is moved
-- behind a SECURITY DEFINER RPC that returns only id/name/avatar for an
-- EXACT friend_code match.
--
-- Interaction with the leaderboard, verified function-by-function:
--   * leaderboard view -> was security_invoker='true' and JOINs
--     student_profiles directly, so under the restricted policy an
--     invoking student would only see their OWN row (empty leaderboard).
--     RLS cannot grant "read only when accessed via this view", so the
--     fix is to run the view as its owner: this migration redefines it
--     WITH (security_invoker='false'). The view projects only public-safe
--     columns (id, name, avatar, xp, streak, grade, rank) -- never coins,
--     food, friend_code or subscription_tier -- so the privacy goal holds
--     while the all-students ranking keeps working. (See bottom of file.)
--   * weekly_leaderboard view -> selects from _weekly_leaderboard_data()
--     which is SECURITY DEFINER, so it bypasses RLS internally and is
--     unaffected even though the view itself is security_invoker='true'.
--   * get_student_profile_for_dialog (SECURITY DEFINER) -> runs as owner,
--     bypasses RLS, unaffected.
-- ============================================================

DROP POLICY IF EXISTS "All authenticated users can view student profiles" ON public.student_profiles;

-- Own row OR linked parent OR admin. Other students' rows are NOT directly
-- readable: the leaderboard reads them through a security-definer view (see
-- bottom of file) and friend search goes through search_student_by_friend_code,
-- so sensitive columns (coins, food, friend_code, subscription_tier) are never
-- exposed by a direct table SELECT.
CREATE POLICY "Read student profiles: self, linked parent, admin"
  ON public.student_profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      WHERE psl.parent_id = (SELECT auth.uid())
        AND psl.student_id = public.student_profiles.id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.user_type = 'admin'::public.user_type
    )
  );

-- ------------------------------------------------------------
-- Friend search RPC: exact friend_code match only, minimal columns
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_student_by_friend_code(p_code text)
RETURNS TABLE(id uuid, name text, avatar_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sp.id, p.name, p.avatar_path
  FROM public.student_profiles sp
  JOIN public.profiles p ON p.id = sp.id
  WHERE sp.friend_code = upper(btrim(p_code))
    AND sp.id <> (SELECT auth.uid())
  LIMIT 1;
$$;

ALTER FUNCTION public.search_student_by_friend_code(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.search_student_by_friend_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_student_by_friend_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_student_by_friend_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_student_by_friend_code(text) TO service_role;

-- ------------------------------------------------------------
-- Partial-name friend search (product-required): students can still find
-- friends by typing part of a name. Runs as owner so it works under the
-- restricted SELECT policy, but returns ONLY public-safe columns
-- (id, name, avatar_path, friend_code) -- never coins/food/xp/streak/tier.
-- Excludes the caller, caps at 20 rows, and escapes LIKE wildcards so a
-- user cannot dump the roster by typing '%'.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_students_by_name(p_query text)
RETURNS TABLE(id uuid, name text, avatar_path text, friend_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sp.id, p.name, p.avatar_path, sp.friend_code
  FROM public.student_profiles sp
  JOIN public.profiles p ON p.id = sp.id
  WHERE p.user_type = 'student'::public.user_type
    AND btrim(p_query) <> ''
    AND p.name ILIKE '%' ||
        replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_')
        || '%'
    AND sp.id <> (SELECT auth.uid())
  ORDER BY p.name
  LIMIT 20;
$$;

ALTER FUNCTION public.search_students_by_name(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.search_students_by_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_students_by_name(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_students_by_name(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_students_by_name(text) TO service_role;

-- ------------------------------------------------------------
-- Keep the global leaderboard working under the restricted policy.
--
-- The leaderboard ranks ALL students, but with security_invoker='true'
-- the view inherited the caller's RLS and would now return only the
-- caller's own row. Re-run it as the owner (security_invoker='false')
-- so it can read every student row. This is safe: the view projects
-- ONLY public-safe columns (id, name, avatar_path, xp, streak, grade,
-- rank) and never coins/food/friend_code/subscription_tier.
--
-- Column list/order is identical to 20260409161311_add_grade_rank_to_
-- leaderboard_view.sql (CREATE OR REPLACE VIEW requires this); only the
-- security_invoker setting changes.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.leaderboard WITH (security_invoker='false') AS
  SELECT
    p.id,
    p.name,
    p.avatar_path,
    sp.xp,
    public.calculate_display_streak(p.id) AS current_streak,
    gl.name AS grade_level_name,
    rank() OVER (ORDER BY sp.xp DESC) AS rank,
    gl.id AS grade_level_id,
    rank() OVER (PARTITION BY gl.id ORDER BY sp.xp DESC) AS grade_rank
  FROM profiles p
    JOIN student_profiles sp ON p.id = sp.id
    LEFT JOIN grade_levels gl ON sp.grade_level_id = gl.id
  WHERE p.user_type = 'student'::public.user_type
  ORDER BY sp.xp DESC;

ALTER VIEW public.leaderboard OWNER TO postgres;
