-- ============================================================
-- Clavis revamp — P46a: an account is closed, and can be opened again.
--
-- Someone leaves a tuition center: their account is closed. They can no
-- longer sign in and are in no classroom, and nothing they did is
-- deleted, so the account can be opened again.
--
--   D1  profiles.closed_at is when the account was closed, and null while
--       it is open. Their practice sessions and answers stay on record.
--   D2  Closing and opening are public.set_account_closed(): a manager
--       does it to a teacher or a student of their organization, and an
--       admin to a manager. Nobody does it to their own account.
--   D3  A closed account cannot sign in. auth.users.banned_until is set,
--       which the auth server refuses at sign-in and whenever a session
--       is renewed, and the sessions the account holds are deleted. A
--       token already handed out runs out within the hour; the app
--       itself refuses a closed profile at once.
--   D4  A closed account is in no classroom. It is taken off every roster
--       as a manager would take it off one by one, so a student's rows in
--       those classrooms' assignments go with them (P31a). It is then
--       counted on no dashboard, and a closed student takes no seat.
--   D5  Opening it again lifts D1 and D3. It is put back in no classroom:
--       the manager adds it where it belongs now.
--   D6  The username and the email it signs in with stay its own, so
--       they cannot be given to another account meanwhile.
-- ============================================================


-- ------------------------------------------------------------
-- 1. When an account was closed (D1)
-- ------------------------------------------------------------

ALTER TABLE public.profiles ADD COLUMN closed_at timestamptz;

COMMENT ON COLUMN public.profiles.closed_at IS
  'When the account was closed; null while it is open. A closed account cannot sign in and is in no classroom.';


-- ------------------------------------------------------------
-- 2. Closing an account, and opening it again (D2 to D5)
-- ------------------------------------------------------------

CREATE FUNCTION public.set_account_closed(p_user_id uuid, p_closed boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_type public.user_role;
  v_organization_id uuid;
BEGIN
  -- Held until the end, so the account is not changed under the check.
  SELECT p.user_type, p.organization_id INTO v_type, v_organization_id
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such account' USING ERRCODE = 'P0002';
  END IF;

  IF p_user_id = (SELECT auth.uid()) OR NOT (
    (
      (SELECT app.is_manager())
      AND v_organization_id = (SELECT app.current_org_id())
      AND v_type IN ('teacher', 'student')
    )
    OR ((SELECT app.is_admin()) AND v_type = 'manager')
  ) THEN
    RAISE EXCEPTION 'Not allowed to close or open this account' USING ERRCODE = '42501';
  END IF;

  IF p_closed THEN
    UPDATE public.profiles p SET closed_at = now() WHERE p.id = p_user_id AND p.closed_at IS NULL;

    DELETE FROM public.classroom_students cs WHERE cs.student_id = p_user_id;
    DELETE FROM public.classroom_teachers ct WHERE ct.teacher_id = p_user_id;

    -- A date far off rather than infinity, which the auth server cannot read.
    UPDATE auth.users u SET banned_until = now() + interval '100 years' WHERE u.id = p_user_id;
    DELETE FROM auth.sessions s WHERE s.user_id = p_user_id;
  ELSE
    UPDATE public.profiles p SET closed_at = NULL WHERE p.id = p_user_id;
    UPDATE auth.users u SET banned_until = NULL WHERE u.id = p_user_id;
  END IF;
END;
$function$;

ALTER FUNCTION public.set_account_closed(uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_account_closed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_account_closed(uuid, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.set_account_closed(uuid, boolean) IS
  'Closes an account or opens it again: a manager a teacher''s or a student''s of their organization, an admin a manager''s. '
  'A closed account cannot sign in and is taken out of every classroom; nothing it did is deleted.';
