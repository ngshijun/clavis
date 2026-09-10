-- ============================================================
-- Clavis revamp — P18c: a generation spec line must carry every key
--
-- `v_line->'key'` is SQL NULL when the key is absent, so `jsonb_typeof(...)
-- <> 'array'` came out NULL rather than TRUE and the guard's OR-chain
-- evaluated to NULL — an IF that does not fire. A line missing
-- `sub_topic_ids` therefore passed validation and drew nothing, reported as
-- a shortfall instead of a rejected spec.
--
-- COALESCE each lookup to the jsonb null literal, which types as 'null' and
-- fails every one of the checks, so a missing key is rejected exactly like a
-- wrongly-typed one. Behaviour for well-formed specs is unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION app.validate_generation_spec(p_spec jsonb, p_subject_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_line    jsonb;
  v_uuid    jsonb;
  v_mix     jsonb;
  v_level   text;
  v_share   numeric;
  v_total   numeric;
  v_count   numeric;
  v_sub_ids uuid[];
BEGIN
  IF jsonb_typeof(p_spec) <> 'array' OR jsonb_array_length(p_spec) = 0 THEN
    RAISE EXCEPTION 'Generation spec must be a non-empty list';
  END IF;
  IF jsonb_array_length(p_spec) > 20 THEN
    RAISE EXCEPTION 'Generation spec has too many lines';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_spec) LOOP
    -- A missing key reads as the jsonb null literal, so it fails these the
    -- same way a wrongly-typed one does.
    IF jsonb_typeof(v_line) <> 'object'
       OR jsonb_typeof(COALESCE(v_line->'sub_topic_ids', 'null'::jsonb)) <> 'array'
       OR jsonb_array_length(v_line->'sub_topic_ids') = 0
       OR jsonb_array_length(v_line->'sub_topic_ids') > 20
       OR jsonb_typeof(COALESCE(v_line->'tag_ids', 'null'::jsonb)) <> 'array'
       OR jsonb_typeof(COALESCE(v_line->'count', 'null'::jsonb)) <> 'number'
       OR jsonb_typeof(COALESCE(v_line->'difficulty_mix', 'null'::jsonb)) <> 'object'
    THEN
      RAISE EXCEPTION 'Generation spec line is invalid';
    END IF;

    v_count := (v_line->>'count')::numeric;
    IF v_count <> floor(v_count) OR v_count < 1 OR v_count > 50 THEN
      RAISE EXCEPTION 'Generation spec line is invalid';
    END IF;

    FOR v_uuid IN
      SELECT value FROM jsonb_array_elements(v_line->'sub_topic_ids')
      UNION ALL
      SELECT value FROM jsonb_array_elements(v_line->'tag_ids')
    LOOP
      IF jsonb_typeof(v_uuid) <> 'string'
         OR (v_uuid #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION 'Generation spec line is invalid';
      END IF;
    END LOOP;

    -- The mix carries exactly the three levels, as integer percentages
    -- summing to 100.
    v_mix := v_line->'difficulty_mix';
    IF (SELECT count(*) FROM jsonb_object_keys(v_mix)) <> 3 THEN
      RAISE EXCEPTION 'Generation spec line is invalid';
    END IF;

    v_total := 0;
    FOREACH v_level IN ARRAY ARRAY['low', 'medium', 'high'] LOOP
      IF jsonb_typeof(COALESCE(v_mix->v_level, 'null'::jsonb)) <> 'number' THEN
        RAISE EXCEPTION 'Generation spec line is invalid';
      END IF;
      v_share := (v_mix->>v_level)::numeric;
      IF v_share <> floor(v_share) OR v_share < 0 OR v_share > 100 THEN
        RAISE EXCEPTION 'Generation spec line is invalid';
      END IF;
      v_total := v_total + v_share;
    END LOOP;

    IF v_total <> 100 THEN
      RAISE EXCEPTION 'Difficulty percentages must add up to 100';
    END IF;

    SELECT array_agg((value #>> '{}')::uuid) INTO v_sub_ids
    FROM jsonb_array_elements(v_line->'sub_topic_ids');

    IF EXISTS (
      SELECT 1
      FROM unnest(v_sub_ids) AS requested(id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.sub_topics st
        JOIN public.topics tp ON tp.id = st.topic_id
        WHERE st.id = requested.id
          AND tp.subject_id = p_subject_id
      )
    ) THEN
      RAISE EXCEPTION 'Sub-topic does not belong to this subject';
    END IF;
  END LOOP;
END;
$$;
