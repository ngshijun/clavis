-- ============================================================
-- Add xp + current_streak to get_student_profile_for_dialog
--
-- Dialogs previously had to query student_profiles directly for xp and
-- current_streak. Under the restricted student_profiles SELECT policy
-- (20260530000002) that direct read is no longer permitted for arbitrary
-- students, so these two fields are added to the SECURITY DEFINER RPC's
-- JSON payload. The RPC runs as owner and bypasses RLS, so it remains the
-- safe, minimal-disclosure path for viewing another student's public
-- profile card.
--
-- Body is identical to the existing function except for selecting and
-- returning xp and current_streak.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_student_profile_for_dialog(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_coins INTEGER;
  v_xp INTEGER;
  v_current_streak INTEGER;
  v_member_since TIMESTAMPTZ;
  v_selected_pet_id UUID;
  v_pet JSONB := NULL;
  v_best_subjects JSONB;
  v_weekly_dates JSONB;
  v_today DATE;
  v_monday DATE;
BEGIN
  -- Get profile basics
  SELECT sp.coins, sp.xp, sp.current_streak, sp.selected_pet_id, pr.created_at
  INTO v_coins, v_xp, v_current_streak, v_selected_pet_id, v_member_since
  FROM public.student_profiles sp
  JOIN public.profiles pr ON pr.id = sp.id
  WHERE sp.id = p_student_id;

  -- Get pet data if selected
  IF v_selected_pet_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'name', p.name,
      'rarity', p.rarity,
      'image_path', p.image_path,
      'tier2_image_path', p.tier2_image_path,
      'tier3_image_path', p.tier3_image_path,
      'tier', COALESCE(op.tier, 1)
    )
    INTO v_pet
    FROM public.pets p
    LEFT JOIN public.owned_pets op ON op.pet_id = p.id AND op.student_id = p_student_id
    WHERE p.id = v_selected_pet_id;
  END IF;

  -- Best subjects: top 3 by average score
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_best_subjects
  FROM (
    SELECT jsonb_build_object(
      'grade_level_name', gl.name,
      'subject_name', s.name,
      'average_score', ROUND(AVG(
        CASE WHEN ps.total_questions > 0
          THEN (ps.correct_count::numeric / ps.total_questions * 100)
          ELSE 0
        END
      ))::integer
    ) AS row_data
    FROM public.practice_sessions ps
    JOIN public.grade_levels gl ON gl.id = ps.grade_level_id
    JOIN public.subjects s ON s.id = ps.subject_id
    WHERE ps.student_id = p_student_id
      AND ps.completed_at IS NOT NULL
      AND ps.total_questions > 0
    GROUP BY gl.name, s.name
    ORDER BY ROUND(AVG(
      CASE WHEN ps.total_questions > 0
        THEN (ps.correct_count::numeric / ps.total_questions * 100)
        ELSE 0
      END
    ))::integer DESC
    LIMIT 3
  ) sub;

  -- Weekly activity: dates this week with has_practiced = true from daily_statuses
  -- Uses daily_statuses (same source as streak calculation) for consistency
  v_today := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;
  v_monday := v_today - (EXTRACT(ISODOW FROM v_today)::integer - 1);

  SELECT COALESCE(jsonb_agg(ds.date), '[]'::jsonb)
  INTO v_weekly_dates
  FROM public.daily_statuses ds
  WHERE ds.student_id = p_student_id
    AND ds.has_practiced = true
    AND ds.date >= v_monday
    AND ds.date <= v_today;

  RETURN jsonb_build_object(
    'coins', COALESCE(v_coins, 0),
    'xp', COALESCE(v_xp, 0),
    'current_streak', COALESCE(v_current_streak, 0),
    'member_since', v_member_since,
    'pet', v_pet,
    'best_subjects', v_best_subjects,
    'weekly_activity_dates', v_weekly_dates
  );
END;
$$;

ALTER FUNCTION public.get_student_profile_for_dialog(uuid) OWNER TO postgres;
