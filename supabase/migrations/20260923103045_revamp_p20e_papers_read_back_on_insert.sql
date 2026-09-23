-- ============================================================
-- Clavis revamp — P20e: a new paper can be read back by whoever created it
--
-- Creating a blank paper (`insert ... select id`) failed for every teacher and
-- admin with "new row violates row-level security policy for table papers".
-- The INSERT policy passed; the RETURNING read-back did not. The SELECT policy
-- was `app.paper_readable(id)`, which looks the paper up again by id — and a
-- STABLE function runs on the statement's snapshot, where the row that
-- statement is inserting does not exist yet. So it returned false for every
-- new paper. (generate_paper is SECURITY DEFINER and never hit this.)
--
-- The owner branches are decided from the row's own columns, which RLS sees
-- on the new row directly. paper_readable stays for the platform branch — it
-- needs the paper's items, which a brand-new paper has none of anyway — and
-- for the RPCs that check readability by id.
-- ============================================================

DROP POLICY "Read papers: owner staff and matched centers" ON public.papers;

CREATE POLICY "Read papers: owner staff and matched centers"
  ON public.papers
  FOR SELECT
  TO authenticated
  USING (
    (SELECT app.is_admin())
    OR (organization_id = (SELECT app.current_org_id()) AND (SELECT app.is_org_staff()))
    OR app.paper_readable(id)
  );
