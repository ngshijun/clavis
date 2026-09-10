-- ============================================================
-- Clavis revamp — P20d: a paper reaches the classrooms it is actually for
--
-- A paper stores no grade+subject — the items decide it (P20b) — so a teacher
-- standing in a Year 5 Maths classroom saw every paper their center ever made,
-- Year 4 Bahasa Melayu included, and every platform paper matching ANY of
-- their classrooms rather than the one they are in.
--
-- The fix is scope, not ownership. A paper stays center-wide on purpose: two
-- classrooms of the same grade and subject are sections of one course (Year 1
-- Maths Group A and Group B), and a paper owned by a classroom would have to
-- be duplicated for the other group, again for next term's intake, and could
-- not be shared between two teachers of the same subject. The classroom
-- already lives where it belongs — on the assessment that DELIVERS the paper.
--
--   * get_paper_pairings() gives the caller the grade+subject each readable
--     paper covers, derived from its items, so a list can be narrowed to the
--     classroom in view.
--   * deliver_paper refuses a classroom the paper does not cover, so the
--     narrowing is a rule and not just a filter. A paper with no items yet
--     covers nothing and contradicts nothing, so it is still deliverable —
--     publish_assessment is what refuses to publish an empty one.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_paper_pairings()
RETURNS TABLE (paper_id uuid, grade_level_id uuid, subject_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT pi.paper_id, s.grade_level_id, s.id
  FROM paper_items pi
  JOIN assessment_bank_questions bq ON bq.id = pi.item_id
  JOIN sub_topics st ON st.id = bq.sub_topic_id
  JOIN topics tp ON tp.id = st.topic_id
  JOIN subjects s ON s.id = tp.subject_id
  WHERE app.paper_readable(pi.paper_id);
$$;

ALTER FUNCTION public.get_paper_pairings() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_paper_pairings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paper_pairings() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_paper_pairings() IS
  'Every grade+subject each readable paper covers, derived from its items. A paper with no items returns no row.';

CREATE OR REPLACE FUNCTION public.deliver_paper(
  p_paper_id     uuid,
  p_classroom_id uuid,
  p_title        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller   uuid := (SELECT auth.uid());
  v_org_id   uuid;
  v_source   papers%ROWTYPE;
  v_grade_id uuid;
  v_subject  uuid;
  v_new_id   uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT app.is_teacher() THEN
    RAISE EXCEPTION 'Only teachers can deliver papers';
  END IF;

  IF NOT app.is_classroom_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'You do not teach this classroom';
  END IF;

  v_org_id := app.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no organization';
  END IF;

  IF NOT app.paper_readable(p_paper_id) THEN
    RAISE EXCEPTION 'Paper not found: %', p_paper_id;
  END IF;

  SELECT * INTO v_source FROM papers WHERE id = p_paper_id;

  -- The paper must cover what this classroom teaches. An empty paper covers
  -- nothing yet, so it has nothing to contradict.
  IF EXISTS (SELECT 1 FROM paper_items WHERE paper_id = p_paper_id) THEN
    SELECT c.grade_level_id, c.subject_id INTO v_grade_id, v_subject
    FROM classrooms c WHERE c.id = p_classroom_id;

    IF NOT EXISTS (
      SELECT 1
      FROM get_paper_pairings() gp
      WHERE gp.paper_id = p_paper_id
        AND gp.grade_level_id = v_grade_id
        AND gp.subject_id = v_subject
    ) THEN
      RAISE EXCEPTION 'This paper is not for this classroom grade and subject';
    END IF;
  END IF;

  INSERT INTO assessments (
    organization_id, classroom_id, paper_id, created_by, title, description,
    status, time_limit_seconds, shuffle_questions
  )
  VALUES (
    v_org_id, p_classroom_id, p_paper_id, v_caller,
    btrim(COALESCE(NULLIF(btrim(COALESCE(p_title, '')), ''), v_source.title)),
    v_source.description, 'draft', v_source.time_limit_seconds, v_source.shuffle_questions
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.deliver_paper(uuid, uuid, text) IS
  'Creates a DRAFT assessment in the caller''s classroom delivering the given paper, inheriting its title and delivery settings. Refuses a classroom whose grade and subject the paper does not cover. Returns the new assessment id.';
