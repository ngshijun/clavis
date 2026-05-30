-- ============================================================
-- Fix accept_parent_student_invitation single-parent race
--
-- The function previously checked "student already has a linked parent"
-- with SELECT EXISTS, then INSERTed into parent_student_links. Two
-- concurrent acceptances for the same student could both pass the EXISTS
-- check before either inserted; the loser then failed with a raw
-- unique_violation (parent_student_links_student_id_unique) instead of
-- the intended friendly message.
--
-- Fix: drop the pre-check and rely on the unique constraint as the source
-- of truth — catch unique_violation and RAISE the friendly message.
-- Function body is otherwise unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_parent_student_invitation(p_invitation_id uuid, p_accepting_user_id uuid, p_is_parent boolean)
RETURNS TABLE(link_id uuid, parent_id uuid, student_id uuid, linked_at timestamp with time zone, parent_name text, parent_email text, student_name text, student_email text, student_avatar_path text, student_grade_level_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invitation RECORD;
  v_link_id UUID;
  v_linked_at TIMESTAMPTZ;
  v_parent_id UUID;
  v_student_id UUID;
BEGIN
  -- Get and validate the invitation
  SELECT * INTO v_invitation
  FROM parent_student_invitations
  WHERE id = p_invitation_id;

  IF v_invitation IS NULL THEN
    RAISE EXCEPTION 'Invitation not found: %', p_invitation_id;
  END IF;

  IF v_invitation.status != 'pending' THEN
    RAISE EXCEPTION 'Invitation is not pending: %', v_invitation.status;
  END IF;

  -- Determine parent_id and student_id based on who is accepting
  IF p_is_parent THEN
    v_parent_id := p_accepting_user_id;
    v_student_id := v_invitation.student_id;

    IF v_student_id IS NULL THEN
      RAISE EXCEPTION 'Student ID not found in invitation';
    END IF;
  ELSE
    v_parent_id := v_invitation.parent_id;
    v_student_id := p_accepting_user_id;

    IF v_parent_id IS NULL THEN
      RAISE EXCEPTION 'Parent ID not found in invitation';
    END IF;
  END IF;

  -- Step 1: Update the invitation status
  UPDATE parent_student_invitations
  SET
    status = 'accepted',
    responded_at = NOW(),
    parent_id = v_parent_id,
    student_id = v_student_id
  WHERE id = p_invitation_id;

  -- Step 2: Create the parent-student link.
  -- The unique constraint parent_student_links_student_id_unique is the
  -- source of truth for "one parent per student". Catch the violation and
  -- raise the friendly message instead of pre-checking with EXISTS (which
  -- races under concurrent acceptances).
  BEGIN
    INSERT INTO parent_student_links (parent_id, student_id)
    VALUES (v_parent_id, v_student_id)
    RETURNING id, parent_student_links.linked_at INTO v_link_id, v_linked_at;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Student already has a linked parent';
  END;

  -- Step 3: Return the link data with profile information
  RETURN QUERY
  SELECT
    v_link_id,
    v_parent_id,
    v_student_id,
    v_linked_at,
    p.name,
    p.email,
    sp_profile.name,
    sp_profile.email,
    sp_profile.avatar_path,
    gl.name
  FROM profiles p
  CROSS JOIN profiles sp_profile
  LEFT JOIN student_profiles sp ON sp.id = v_student_id
  LEFT JOIN grade_levels gl ON gl.id = sp.grade_level_id
  WHERE p.id = v_parent_id
    AND sp_profile.id = v_student_id;
END;
$$;

ALTER FUNCTION public.accept_parent_student_invitation(uuid, uuid, boolean) OWNER TO postgres;
