-- ============================================================
-- Clavis revamp — P39a: a learning point is added from the builder.
--
-- The builder offers a question the learning points of its stage's topic
-- (R3.4). An admin writing a question may now name one the topic does not
-- offer yet, and file the question under it at once.
--
--   D1  Named in the builder, a learning point is the stage's topic's. A
--       new name makes a new learning point of that topic; a name another
--       topic's learning point has already is that learning point, which
--       the topic now offers as well. A name is one learning point's
--       whatever its capitals (P36a), so the same word never makes two.
--   D2  It is offered at once, before the question is saved: the topic's
--       learning points are the vocabulary, and the question's filing is
--       its draft's, saved with Save as before.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A learning point, offered by a stage's topic (D1, D2)
--
-- p_stage_id  the stage whose topic offers it
-- p_name      its name, stored trimmed and in small letters
--
-- Returns the learning point's id, new or not.
-- ------------------------------------------------------------

CREATE FUNCTION public.offer_learning_point(p_stage_id uuid, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := lower(btrim(p_name));
  v_topic_id uuid;
  v_id uuid;
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'Only platform admins can add a learning point';
  END IF;

  SELECT s.topic_id INTO v_topic_id FROM public.stages s WHERE s.id = p_stage_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found: %', p_stage_id;
  END IF;

  INSERT INTO public.tags (name) VALUES (v_name) ON CONFLICT (name) DO NOTHING;
  SELECT t.id INTO v_id FROM public.tags t WHERE t.name = v_name;

  INSERT INTO public.tag_topics (tag_id, topic_id)
  VALUES (v_id, v_topic_id)
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.offer_learning_point(uuid, text) IS
  'Makes the stage''s topic offer the learning point of that name, making the learning point if no topic has it yet, and returns its id. Admins only.';

REVOKE ALL ON FUNCTION public.offer_learning_point(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.offer_learning_point(uuid, text) TO authenticated, service_role;
