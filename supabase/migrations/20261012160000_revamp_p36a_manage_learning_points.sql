-- ============================================================
-- Clavis revamp — P36a: an admin manages the learning points.
--
-- The tables have been there since P7a and P19a: `tags` is the list of
-- learning points, `tag_topics` says which topics offer each, and
-- `question_tags` files a question under them. Until now they were
-- filled by the seed alone. An admin page now creates, edits and
-- deletes a learning point.
--
--   D1  A learning point is saved whole: its name and the topics that
--       offer it, in one transaction, so there is never a learning
--       point with a name and no topic because half of a save failed.
--   D2  A learning point is of at least one topic. One with none is
--       offered to no question (R3.4), so the page does not make one.
--   D3  A question is filed only under what its topic offers. When a
--       learning point is taken away from a topic, it is taken off the
--       questions of that topic's stages in the same transaction.
--
-- Deleting one needs no function: it is one row of `tags`, the rows
-- that point at it go with it, and row level security lets only an
-- admin delete it.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A learning point, saved whole (D1, D2, D3)
--
-- p_id         the learning point to change; null to make a new one
-- p_name       its name, stored trimmed and in small letters
-- p_topic_ids  the topics that offer it, all of them
--
-- A name another learning point has is refused by the table's own
-- unique constraint (23505), which the page tells the person.
-- ------------------------------------------------------------

CREATE FUNCTION public.save_learning_point(p_id uuid, p_name text, p_topic_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id   uuid := p_id;
  v_name text := lower(btrim(p_name));
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can change a learning point';
  END IF;

  IF COALESCE(cardinality(p_topic_ids), 0) = 0 THEN
    RAISE EXCEPTION 'A learning point is of at least one topic';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.tags (name) VALUES (v_name) RETURNING id INTO v_id;
  ELSE
    UPDATE public.tags SET name = v_name WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Learning point not found: %', v_id;
    END IF;

    -- Off the questions of the topics it leaves, then off those topics.
    DELETE FROM public.question_tags AS filed
    USING public.questions AS question, public.stages AS stage
    WHERE filed.tag_id = v_id
      AND question.id = filed.question_id
      AND stage.id = question.stage_id
      AND stage.topic_id <> ALL (p_topic_ids);

    DELETE FROM public.tag_topics
    WHERE tag_id = v_id
      AND topic_id <> ALL (p_topic_ids);
  END IF;

  INSERT INTO public.tag_topics (tag_id, topic_id)
  SELECT DISTINCT v_id, topic_id
  FROM unnest(p_topic_ids) AS topic_id
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.save_learning_point(uuid, text, uuid[]) IS
  'Makes a learning point, or changes the one given: its name and the topics that offer it, in one transaction. Admins only. A topic it is taken away from loses it on the questions of its stages as well.';

REVOKE ALL ON FUNCTION public.save_learning_point(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_learning_point(uuid, text, uuid[]) TO authenticated, service_role;
