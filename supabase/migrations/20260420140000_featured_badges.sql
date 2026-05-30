-- ============================================================================
-- Featured Badges — student showcase (up to 3 badges on profile)
--
-- Students can pin up to 3 of their unlocked badges to their profile. The list
-- is shown on their own profile, in StudentProfileDialog (leaderboard + friend
-- view), and in ChildProfileDialog (parent view). Order is preserved.
--
-- Writes go through set_featured_badges RPC; direct UPDATE on the column is
-- withheld from authenticated role so students can't set garbage.
-- Auto-populate trigger fills slots with the first 3 unlocked badges so new
-- students see a non-empty profile without having to configure anything.
-- ============================================================================

-- 1. Column -----------------------------------------------------------------
alter table public.student_profiles
  add column featured_badges uuid[] not null default '{}';

alter table public.student_profiles
  add constraint student_profiles_featured_badges_max_three
    check (coalesce(array_length(featured_badges, 1), 0) <= 3);

-- 2. Auto-populate trigger on new badge unlock -----------------------------
-- Adds the badge to featured_badges if the student has fewer than 3 pinned
-- AND this badge is not already pinned.

create or replace function public.auto_populate_featured_badges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.student_profiles
    set featured_badges = featured_badges || NEW.badge_id
    where id = NEW.student_id
      and coalesce(array_length(featured_badges, 1), 0) < 3
      and not (NEW.badge_id = any(featured_badges));
  return NEW;
end $$;

drop trigger if exists trg_auto_populate_featured_badges on public.student_badges;
create trigger trg_auto_populate_featured_badges
  after insert on public.student_badges
  for each row
  execute function public.auto_populate_featured_badges();

-- 3. RPC: set_featured_badges -----------------------------------------------
-- Validates ownership + length, dedupes, and updates the column. Returns the
-- normalized array so the client can mirror authoritative state.

create or replace function public.set_featured_badges(p_badges uuid[])
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  v_student_id uuid := auth.uid();
  v_deduped uuid[];
  v_unowned uuid;
begin
  if v_student_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Dedupe while preserving order (ARRAY_AGG with DISTINCT reorders, so use
  -- a running CTE instead).
  select coalesce(array_agg(b order by ord), '{}'::uuid[])
  into v_deduped
  from (
    select distinct on (b) b, min(ord) as ord
    from unnest(p_badges) with ordinality as u(b, ord)
    group by b
  ) d;

  if coalesce(array_length(v_deduped, 1), 0) > 3 then
    raise exception 'Cannot feature more than 3 badges';
  end if;

  -- Validate the student owns every badge.
  select b into v_unowned
  from unnest(v_deduped) as b
  where not exists (
    select 1 from public.student_badges
    where student_id = v_student_id and badge_id = b
  )
  limit 1;

  if v_unowned is not null then
    raise exception 'Badge % is not unlocked', v_unowned;
  end if;

  update public.student_profiles
    set featured_badges = v_deduped
    where id = v_student_id;

  return v_deduped;
end $$;

grant execute on function public.set_featured_badges(uuid[]) to authenticated;

-- Withhold direct UPDATE on the new column; students must use the RPC.
-- (student_profiles' column-level grants are locked down in
--  20260405071125_lock_down_column_level_grants.sql. The new column inherits
--  "no grant" by default on that table since we already revoked UPDATE broadly
--  there; nothing to revoke here.)

-- 4. Extend get_student_profile_for_dialog ---------------------------------
-- Adds a `featured_badges` array in the JSONB response so the dialog can
-- render them without a second round-trip.

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
  v_today date;
  v_monday date;
begin
  select sp.coins, sp.selected_pet_id, sp.featured_badges, pr.created_at
  into v_coins, v_selected_pet_id, v_featured_ids, v_member_since
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

  -- Best subjects: top 3 by average score
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

  -- Weekly activity
  v_today := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_monday := v_today - (extract(isodow from v_today)::integer - 1);

  select coalesce(jsonb_agg(ds.date), '[]'::jsonb)
  into v_weekly_dates
  from public.daily_statuses ds
  where ds.student_id = p_student_id
    and ds.has_practiced = true
    and ds.date >= v_monday
    and ds.date <= v_today;

  -- Featured badges: hydrate id → {id, slug, tier, icon_path, coin_reward} in
  -- the same order the student saved. Uses unnest WITH ORDINALITY to preserve
  -- order across the join.
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

  return jsonb_build_object(
    'coins', coalesce(v_coins, 0),
    'member_since', v_member_since,
    'pet', v_pet,
    'best_subjects', v_best_subjects,
    'weekly_activity_dates', v_weekly_dates,
    'featured_badges', v_featured
  );
end $$;

-- 5. One-time backfill for existing students --------------------------------
-- For every student whose featured_badges is empty, pick up to 3 of their
-- unlocked badges (earliest unlocks first) and pin them.

with candidates as (
  select sb.student_id, sb.badge_id,
         row_number() over (partition by sb.student_id order by sb.unlocked_at) as rn
  from public.student_badges sb
)
update public.student_profiles sp
  set featured_badges = sub.ids
  from (
    select student_id, array_agg(badge_id order by rn) as ids
    from candidates
    where rn <= 3
    group by student_id
  ) sub
  where sp.id = sub.student_id
    and coalesce(array_length(sp.featured_badges, 1), 0) = 0;
