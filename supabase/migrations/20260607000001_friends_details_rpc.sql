-- ============================================================
-- Restore friends & friend-request details under restricted
-- student_profiles SELECT (REGRESSION FIX)
--
-- 20260530000002_restrict_student_profiles_select.sql replaced the open
-- "All authenticated users can view student profiles" policy (USING (true))
-- with a self / linked-parent / admin policy. That migration moved friend
-- *search* and the *leaderboard* behind SECURITY DEFINER objects, but the
-- friends list and friend-requests reads in src/stores/friends.ts still
-- embed the OTHER student's profile via a direct nested PostgREST select:
--
--   recipient:student_profiles!friendships_recipient_id_fkey(
--     id, updated_at, profiles!inner(name, avatar_path))
--
-- Under the restricted policy that embedded row comes back NULL for a
-- friend, the client parser throws, and the whole fetch fails -> the UI
-- shows "No friends yet" / 0 requests even when friendships exist.
--
-- Fix: expose both reads through SECURITY DEFINER RPCs that run as owner
-- (bypassing the SELECT policy) but return ONLY public-safe columns
-- (id, name, avatar_path, updated_at, closeness_*). Each function is scoped
-- to the caller via auth.uid() so it can only ever return the caller's own
-- friendships / requests -- never the wider roster. Sensitive columns
-- (coins, food, friend_code, subscription_tier) are never projected, so the
-- privacy goal of 20260530000002 is preserved.
-- ============================================================

-- ------------------------------------------------------------
-- Accepted friends of the caller, with the other party's public profile.
-- closeness_xp/level come from the friendship row; daily-gift "sent/received
-- today" flags stay client-side (daily_coin_gifts RLS already allows the
-- caller to read their own gifts).
-- ------------------------------------------------------------
create or replace function public.get_friends()
returns table (
  friendship_id uuid,
  friend_id uuid,
  name text,
  avatar_path text,
  closeness_xp integer,
  closeness_level integer,
  friend_since timestamptz,
  last_active timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.id,
    other_sp.id,
    other_p.name,
    other_p.avatar_path,
    f.closeness_xp,
    f.closeness_level,
    coalesce(f.responded_at, f.created_at),
    other_sp.updated_at
  from public.friendships f
  join public.student_profiles other_sp
    on other_sp.id = case
         when f.requester_id = (select auth.uid()) then f.recipient_id
         else f.requester_id
       end
  join public.profiles other_p on other_p.id = other_sp.id
  where f.status = 'accepted'
    and (select auth.uid()) in (f.requester_id, f.recipient_id);
$$;

alter function public.get_friends() owner to postgres;

revoke all on function public.get_friends() from public;
revoke all on function public.get_friends() from anon;
grant execute on function public.get_friends() to authenticated;
grant execute on function public.get_friends() to service_role;

-- ------------------------------------------------------------
-- Pending friend requests involving the caller, with the other party's
-- public profile. direction = 'sent' when the caller is the requester,
-- 'received' when the caller is the recipient.
-- ------------------------------------------------------------
create or replace function public.get_friend_requests()
returns table (
  friendship_id uuid,
  student_id uuid,
  name text,
  avatar_path text,
  created_at timestamptz,
  direction text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.id,
    other_sp.id,
    other_p.name,
    other_p.avatar_path,
    f.created_at,
    case
      when f.requester_id = (select auth.uid()) then 'sent'
      else 'received'
    end
  from public.friendships f
  join public.student_profiles other_sp
    on other_sp.id = case
         when f.requester_id = (select auth.uid()) then f.recipient_id
         else f.requester_id
       end
  join public.profiles other_p on other_p.id = other_sp.id
  where f.status = 'pending'
    and (select auth.uid()) in (f.requester_id, f.recipient_id)
  order by f.created_at desc;
$$;

alter function public.get_friend_requests() owner to postgres;

revoke all on function public.get_friend_requests() from public;
revoke all on function public.get_friend_requests() from anon;
grant execute on function public.get_friend_requests() to authenticated;
grant execute on function public.get_friend_requests() to service_role;
