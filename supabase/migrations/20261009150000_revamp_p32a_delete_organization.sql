-- ============================================================
-- Clavis revamp — P32a: an admin deletes an organization.
--
-- An organization is the tenant: deleting it destroys everything a
-- tuition center has in Clavis. It is the one delete on the platform
-- that takes people's accounts with it, so it is hedged about.
--
--   D1  Only an admin deletes an organization, and only through
--       public.delete_organization(): the row cannot simply be
--       deleted, because its accounts hold it (profiles.organization_id
--       is ON DELETE RESTRICT).
--   D2  The caller must hand back the organization's name exactly as
--       it stands. The page asks for it to be typed; checking it here
--       means no request that merely carries an id deletes a tenant,
--       and one made from a stale page, after a rename, is refused.
--   D3  It is all or nothing: one transaction. Either the organization
--       and everything in it is gone, or nothing has changed.
--   D4  What goes: every classroom, live or archived, with its rosters,
--       its assignments and every practice session recorded in it; then
--       every account of the organization (managers, teachers and
--       students), sign-in and all; then the organization. A classroom
--       is deleted here without being archived first (R10.7 is the
--       manager's rule; this is the platform's).
--   D5  Accounts are deleted from auth.users in SQL rather than one by
--       one through the admin API, so that D3 holds. Everything the
--       auth schema keeps for a user cascades from that row.
--   D6  Files cannot be deleted from SQL. The function hands back the
--       paths of the classroom covers it orphaned and the caller
--       removes them through the Storage API, which an admin is now
--       allowed to do.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Delete an organization (D1 to D5)
-- ------------------------------------------------------------

CREATE FUNCTION public.delete_organization(p_organization_id uuid, p_name text)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_name text;
  v_covers text[];
BEGIN
  IF NOT (SELECT app.is_admin()) THEN
    RAISE EXCEPTION 'Not an admin' USING ERRCODE = '42501';
  END IF;

  -- Held until the end, so nobody is added to the organization while it goes.
  SELECT o.name INTO v_name
  FROM public.organizations o
  WHERE o.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such organization' USING ERRCODE = 'P0002';
  END IF;

  IF p_name IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'The name given is not the organization''s name' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(c.cover_image_path), '{}') INTO v_covers
  FROM public.classrooms c
  WHERE c.organization_id = p_organization_id
    AND c.cover_image_path IS NOT NULL;

  -- Classrooms first: each points at the manager who made it.
  DELETE FROM public.classrooms c WHERE c.organization_id = p_organization_id;

  DELETE FROM auth.users u
  WHERE u.id IN (SELECT p.id FROM public.profiles p WHERE p.organization_id = p_organization_id);

  DELETE FROM public.organizations o WHERE o.id = p_organization_id;

  RETURN v_covers;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_organization(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_organization(uuid, text) TO authenticated, service_role;


-- ------------------------------------------------------------
-- 2. An admin removes classroom covers (D6)
--
-- A manager's policy asks whether the classroom the file belongs to
-- is theirs, which cannot be answered once the classroom is gone.
-- ------------------------------------------------------------

CREATE POLICY "Admins can delete classroom images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'classroom-images' AND (SELECT app.is_admin()));
