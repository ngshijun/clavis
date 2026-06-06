-- ============================================================
-- Lock down friendships UPDATE
--
-- The friend_system migration granted authenticated
--   UPDATE (status, responded_at, closeness_xp, closeness_level, updated_at)
-- on friendships, and the "update own friendships" policy had USING but
-- no WITH CHECK. Together this let any participant directly PATCH the row
-- via PostgREST: a requester could self-accept their own outgoing request
-- (set status='accepted'), and either party could set arbitrary
-- closeness_xp / closeness_level, bypassing respond_friend_request's
-- recipient-only rule and send_daily_coins's mutual-gift requirement.
--
-- Every legitimate friendship transition already flows through the
-- SECURITY DEFINER RPCs (send_friend_request, respond_friend_request,
-- send_daily_coins, remove_friend, decay_closeness_xp), which run as the
-- function owner and are unaffected by the authenticated grant. So we
-- revoke the direct UPDATE grant entirely and drop the now-dead UPDATE
-- policy — the RPCs become the only write path.
-- ============================================================

REVOKE UPDATE ON TABLE public.friendships FROM authenticated;

DROP POLICY IF EXISTS "update own friendships" ON public.friendships;
