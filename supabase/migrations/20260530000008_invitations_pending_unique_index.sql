-- ============================================================
-- Partial unique index on pending parent_student_invitations
--
-- Prevents duplicate pending invitations between the same parent and
-- student. Scoped to status='pending' so resolved invitations
-- (accepted / rejected / cancelled) do not block creating a fresh one
-- later. NULL parent_id/student_id rows (one-sided pending invites) are
-- treated as distinct by Postgres, so only fully-matching pending pairs
-- collide — exactly the duplicate we want to forbid.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_student_invitations_pending
  ON public.parent_student_invitations (parent_id, student_id)
  WHERE status = 'pending';
