-- ============================================================================
-- Badge icons storage bucket
--
-- Public bucket — badge icons are non-sensitive and rendered everywhere
-- (own profile, leaderboard, friend dialogs, parent dashboard). The seed
-- catalogs reference paths like `badges/first_steps.png` which were a
-- relative-URL artifact; this migration normalizes them to plain filenames
-- (`first_steps.png`) since `getBadgeIconUrl` now prefixes the bucket name.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('badges', 'badges', true)
on conflict (id) do update set public = true;

update public.badges
  set icon_path = regexp_replace(icon_path, '^badges/', '')
  where icon_path like 'badges/%';
