-- ============================================================================
-- Extend get_student_profile_for_dialog with extra stats
--
-- Adds three fields used by the profile dialogs (Student/Friend/Child):
--   - badges_earned:  count of student_badges rows
--   - total_badges:   count of active badges (so client can render "X / Y")
--   - pets_collected: count of distinct owned_pets.pet_id
--   - last_active:    student_profiles.updated_at (same source as friend /
--                     child-link stores use for "active ... ago" display)
-- ============================================================================

create or replace function public.get_student_profile_for_dialog(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_coins integer;
  v_member_since timestamptz;
  v_selected_pet_id uuid;
  v_pet jsonb := null;
  v_best_subjects jsonb;
  v_weekly_dates jsonb;
  v_featured jsonb;
  v_featured_ids uuid[];
  v_badges_earned integer;
  v_total_badges integer;
  v_pets_collected integer;
  v_total_pets integer;
  v_last_active timestamptz;
  v_today date;
  v_monday date;
begin
  select sp.coins, sp.selected_pet_id, sp.featured_badges, sp.updated_at, pr.created_at
  into v_coins, v_selected_pet_id, v_featured_ids, v_last_active, v_member_since
  from public.student_profiles sp
  join public.profiles pr on pr.id = sp.id
  where sp.id = p_student_id;

  if v_selected_pet_id is not null then
    select jsonb_build_object(
      'name', p.name,
      'rarity', p.rarity,
      'image_path', p.image_path,
      'tier2_image_path', p.tier2_image_path,
      'tier3_image_path', p.tier3_image_path,
      'tier', coalesce(op.tier, 1)
    )
    into v_pet
    from public.pets p
    left join public.owned_pets op on op.pet_id = p.id and op.student_id = p_student_id
    where p.id = v_selected_pet_id;
  end if;

  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into v_best_subjects
  from (
    select jsonb_build_object(
      'grade_level_name', gl.name,
      'subject_name', s.name,
      'average_score', round(avg(
        case when ps.total_questions > 0
          then (ps.correct_count::numeric / ps.total_questions * 100)
          else 0 end
      ))::integer
    ) as row_data
    from public.practice_sessions ps
    join public.grade_levels gl on gl.id = ps.grade_level_id
    join public.subjects s on s.id = ps.subject_id
    where ps.student_id = p_student_id
      and ps.completed_at is not null
      and ps.total_questions > 0
    group by gl.name, s.name
    order by round(avg(
      case when ps.total_questions > 0
        then (ps.correct_count::numeric / ps.total_questions * 100)
        else 0 end
    ))::integer desc
    limit 3
  ) sub;

  v_today := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_monday := v_today - (extract(isodow from v_today)::integer - 1);

  select coalesce(jsonb_agg(ds.date), '[]'::jsonb)
  into v_weekly_dates
  from public.daily_statuses ds
  where ds.student_id = p_student_id
    and ds.has_practiced = true
    and ds.date >= v_monday
    and ds.date <= v_today;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', b.id,
      'slug', b.slug,
      'tier', b.tier,
      'icon_path', b.icon_path,
      'coin_reward', b.coin_reward,
      'trigger_type', b.trigger_type
    ) order by u.ord
  ), '[]'::jsonb)
  into v_featured
  from unnest(v_featured_ids) with ordinality as u(bid, ord)
  join public.badges b on b.id = u.bid;

  -- Extra stats ------------------------------------------------------------
  select count(*)::int into v_badges_earned
  from public.student_badges where student_id = p_student_id;

  select count(*)::int into v_total_badges
  from public.badges where is_active;

  select count(distinct pet_id)::int into v_pets_collected
  from public.owned_pets where student_id = p_student_id;

  select count(*)::int into v_total_pets from public.pets;

  return jsonb_build_object(
    'coins', coalesce(v_coins, 0),
    'member_since', v_member_since,
    'pet', v_pet,
    'best_subjects', v_best_subjects,
    'weekly_activity_dates', v_weekly_dates,
    'featured_badges', v_featured,
    'badges_earned', coalesce(v_badges_earned, 0),
    'total_badges', coalesce(v_total_badges, 0),
    'pets_collected', coalesce(v_pets_collected, 0),
    'total_pets', coalesce(v_total_pets, 0),
    'last_active', v_last_active
  );
end $$;
