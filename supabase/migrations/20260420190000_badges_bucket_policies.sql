-- ============================================================================
-- Badges bucket — size limit, mime type allowlist, RLS policies
--
-- Mirrors the pattern used by pet-images (admin-managed image assets):
--   - 5 MB file size limit
--   - image/png + image/webp only
--   - public SELECT for everyone (badges render across the whole app)
--   - INSERT / UPDATE / DELETE restricted to admin profiles
-- ============================================================================

update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/webp']
  where id = 'badges';

-- Public read --------------------------------------------------------------
create policy "Public can read badge icons"
  on storage.objects
  for select
  to public
  using (bucket_id = 'badges');

-- Admin-only writes --------------------------------------------------------
create policy "Admins can upload badge icons"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'badges'
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.user_type = 'admin'
    )
  );

create policy "Admins can update badge icons"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'badges'
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.user_type = 'admin'
    )
  );

create policy "Admins can delete badge icons"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'badges'
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.user_type = 'admin'
    )
  );
