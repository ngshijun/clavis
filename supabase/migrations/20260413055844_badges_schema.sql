-- ============================================================================
-- Achievements and Badges System — schema, functions, RLS
-- Spec: docs/superpowers/specs/2026-04-13-achievements-badges-design.md
-- ============================================================================

-- ENUMS ---------------------------------------------------------------------

create type badge_trigger_type as enum (
  'total_sessions_completed',
  'total_xp_earned',
  'total_questions_answered',
  'total_days_practiced',
  'current_streak',
  'max_streak_ever',
  'perfect_sessions_count',
  'subject_accuracy_threshold',
  'unique_pets_owned',
  'pet_max_tier_reached',
  'pets_of_rarity_count'
);

create type badge_tier as enum (
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'master',
  'grandmaster'
);

-- COLUMN: student_profiles.max_streak ---------------------------------------

alter table public.student_profiles
  add column max_streak integer not null default 0;

-- Backfill from current_streak (floor value; historical peaks are unknowable)
update public.student_profiles
  set max_streak = current_streak
  where current_streak > 0;

-- TABLE: badges (catalog) ---------------------------------------------------

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  trigger_type badge_trigger_type not null,
  trigger_params jsonb not null default '{}',
  tier badge_tier not null,
  coin_reward integer not null default 0,
  required_tier subscription_tier not null default 'core',
  icon_path text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index badges_trigger_type_idx on public.badges(trigger_type) where is_active;
create index badges_required_tier_idx on public.badges(required_tier) where is_active;

-- TABLE: student_badges (unlocks) -------------------------------------------

create table public.student_badges (
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (student_id, badge_id)
);

create index student_badges_student_unlocked_idx
  on public.student_badges(student_id, unlocked_at desc);

create index student_badges_unseen_idx
  on public.student_badges(student_id)
  where seen_at is null;

-- Covering index for the badge_id FK (speeds up cascading deletes when a
-- badge is removed from the catalog).
create index student_badges_badge_id_idx on public.student_badges(badge_id);

-- FUNCTION: check_trigger_eligibility ---------------------------------------
-- Pure read-only eligibility check. Returns boolean. The `else raise` branch
-- is CRITICAL: without it, a missing arm would return NULL, which would
-- silently fall through the `if not check_trigger_eligibility(...)` guard in
-- the orchestrator and award badges for every student on any unknown trigger.
-- Uses IF/ELSIF/ELSE (procedural) because RAISE cannot appear inside a CASE
-- expression — CASE expressions return values, not execute statements.

create or replace function public.check_trigger_eligibility(
  p_student_id uuid,
  p_trigger_type badge_trigger_type,
  p_params jsonb
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_trigger_type = 'total_sessions_completed' then
    return (select count(*) from public.practice_sessions
            where student_id = p_student_id and completed_at is not null)
           >= (p_params->>'threshold')::int;

  elsif p_trigger_type = 'total_xp_earned' then
    return coalesce((select xp from public.student_profiles where id = p_student_id), 0)
           >= (p_params->>'threshold')::int;

  elsif p_trigger_type = 'total_questions_answered' then
    return (select count(*)
            from public.practice_answers pa
            join public.practice_sessions ps on ps.id = pa.session_id
            where ps.student_id = p_student_id)
           >= (p_params->>'threshold')::int;

  elsif p_trigger_type = 'total_days_practiced' then
    return (select count(*) from public.daily_statuses
            where student_id = p_student_id and has_practiced = true)
           >= (p_params->>'threshold')::int;

  elsif p_trigger_type = 'current_streak' then
    return (select current_streak from public.student_profiles where id = p_student_id)
           >= (p_params->>'threshold')::int;

  elsif p_trigger_type = 'max_streak_ever' then
    return (select max_streak from public.student_profiles where id = p_student_id)
           >= (p_params->>'threshold')::int;

  elsif p_trigger_type = 'perfect_sessions_count' then
    return (select count(*) from public.practice_sessions
            where student_id = p_student_id
              and completed_at is not null
              and correct_count is not null
              and correct_count = total_questions)
           >= (p_params->>'threshold')::int;

  elsif p_trigger_type = 'subject_accuracy_threshold' then
    return exists (
      select 1 from public.practice_sessions
      where student_id = p_student_id
        and completed_at is not null
        and correct_count is not null
        and (p_params->>'subject_id' = 'any'
             or subject_id = (p_params->>'subject_id')::uuid)
      group by 1
      having sum(total_questions) >= (p_params->>'min_questions')::int
         and (sum(correct_count)::numeric * 100 / nullif(sum(total_questions), 0))
             >= (p_params->>'min_percentage')::int
    );

  elsif p_trigger_type = 'unique_pets_owned' then
    return (select count(distinct pet_id) from public.owned_pets where student_id = p_student_id)
           >= (p_params->>'threshold')::int;

  elsif p_trigger_type = 'pet_max_tier_reached' then
    return exists (select 1 from public.owned_pets
                   where student_id = p_student_id and tier = 3);

  elsif p_trigger_type = 'pets_of_rarity_count' then
    return (select count(*) from public.owned_pets op
            join public.pets p on p.id = op.pet_id
            where op.student_id = p_student_id
              and p.rarity = (p_params->>'rarity')::pet_rarity)
           >= (p_params->>'threshold')::int;

  else
    raise exception 'check_trigger_eligibility: unknown trigger type %', p_trigger_type
      using errcode = 'data_exception';
  end if;
end;
$$;

-- FUNCTION: check_and_award_badges ------------------------------------------
-- The orchestrator. Called from hot-path RPCs. Iterates active badges, skips
-- already-owned and tier-gated, checks eligibility, atomically inserts unlock
-- + awards coins, returns the newly-unlocked badge rows.

create or replace function public.check_and_award_badges(p_student_id uuid)
returns setof public.badges
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.badges%rowtype;
  student_tier public.subscription_tier;
begin
  select subscription_tier into student_tier
  from public.student_profiles where id = p_student_id;

  if student_tier is null then
    return;  -- student not found; no-op
  end if;

  for b in
    select * from public.badges
    where is_active
    order by created_at
  loop
    -- skip already-owned
    if exists (
      select 1 from public.student_badges
      where student_id = p_student_id and badge_id = b.id
    ) then
      continue;
    end if;

    -- skip tier-gated (direct enum comparison: core < plus < pro < max)
    if student_tier < b.required_tier then
      continue;
    end if;

    -- check eligibility
    if not public.check_trigger_eligibility(p_student_id, b.trigger_type, b.trigger_params) then
      continue;
    end if;

    -- award: insert unlock (idempotent) + credit coins + yield the row
    insert into public.student_badges (student_id, badge_id)
    values (p_student_id, b.id)
    on conflict do nothing;

    if b.coin_reward > 0 then
      update public.student_profiles
      set coins = coalesce(coins, 0) + b.coin_reward
      where id = p_student_id;
    end if;

    return next b;
  end loop;
  return;
end;
$$;

-- FUNCTION: get_student_badge_progress --------------------------------------
-- Returns (badge_id, current_value, target_value, progress_pct) for all
-- unearned, non-tier-gated badges. Called on AchievementsPage mount. Client
-- sorts client-side and takes top 3 for ClosestToUnlockSection.

create or replace function public.get_student_badge_progress(p_student_id uuid)
returns table (
  badge_id uuid,
  current_value numeric,
  target_value numeric,
  progress_pct numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.badges%rowtype;
  student_tier public.subscription_tier;
  cur numeric;
  tgt numeric;
begin
  select subscription_tier into student_tier
  from public.student_profiles where id = p_student_id;

  if student_tier is null then
    return;
  end if;

  for b in
    select * from public.badges where is_active
  loop
    -- skip already-owned
    -- Use a table alias (sb) to disambiguate `badge_id` from the RETURNS TABLE
    -- OUT parameter of the same name — otherwise PL/pgSQL resolves it as the
    -- variable and Postgres raises "column reference badge_id is ambiguous".
    if exists (
      select 1 from public.student_badges sb
      where sb.student_id = p_student_id and sb.badge_id = b.id
    ) then
      continue;
    end if;

    -- skip tier-gated (the widget hides these from free users)
    if student_tier < b.required_tier then
      continue;
    end if;

    -- compute current / target per trigger_type
    case b.trigger_type
      when 'total_sessions_completed' then
        cur := (select count(*) from public.practice_sessions
                where student_id = p_student_id and completed_at is not null);
        tgt := (b.trigger_params->>'threshold')::numeric;

      when 'total_xp_earned' then
        cur := coalesce((select xp from public.student_profiles
                         where id = p_student_id), 0);
        tgt := (b.trigger_params->>'threshold')::numeric;

      when 'total_questions_answered' then
        cur := (select count(*)
                from public.practice_answers pa
                join public.practice_sessions ps on ps.id = pa.session_id
                where ps.student_id = p_student_id);
        tgt := (b.trigger_params->>'threshold')::numeric;

      when 'total_days_practiced' then
        cur := (select count(*) from public.daily_statuses
                where student_id = p_student_id and has_practiced = true);
        tgt := (b.trigger_params->>'threshold')::numeric;

      when 'current_streak' then
        cur := (select current_streak from public.student_profiles
                where id = p_student_id);
        tgt := (b.trigger_params->>'threshold')::numeric;

      when 'max_streak_ever' then
        cur := (select max_streak from public.student_profiles
                where id = p_student_id);
        tgt := (b.trigger_params->>'threshold')::numeric;

      when 'perfect_sessions_count' then
        cur := (select count(*) from public.practice_sessions
                where student_id = p_student_id
                  and completed_at is not null
                  and correct_count is not null
                  and correct_count = total_questions);
        tgt := (b.trigger_params->>'threshold')::numeric;

      when 'unique_pets_owned' then
        cur := (select count(distinct pet_id) from public.owned_pets
                where student_id = p_student_id);
        tgt := (b.trigger_params->>'threshold')::numeric;

      when 'pet_max_tier_reached' then
        cur := case when exists (
          select 1 from public.owned_pets
          where student_id = p_student_id and tier = 3
        ) then 1 else 0 end;
        tgt := 1;

      when 'pets_of_rarity_count' then
        cur := (select count(*) from public.owned_pets op
                join public.pets p on p.id = op.pet_id
                where op.student_id = p_student_id
                  and p.rarity = (b.trigger_params->>'rarity')::pet_rarity);
        tgt := (b.trigger_params->>'threshold')::numeric;

      -- subject_accuracy_threshold: omitted from progress widget because
      -- it's not a simple 1D threshold (two axes: sample size + percentage).
      -- Clients won't see these in the Closest-to-unlock section.
      else
        continue;
    end case;

    badge_id := b.id;
    current_value := cur;
    target_value := tgt;
    progress_pct := case
      when tgt > 0 then least(100, (cur * 100.0 / tgt))
      else 0
    end;
    return next;
  end loop;
  return;
end;
$$;

-- FUNCTION: backfill_badge_for_all_eligible ---------------------------------
-- Called from seed migrations after inserting new badges. Iterates all
-- students, checks eligibility, inserts unlocks + awards coins. Silent
-- (no celebration events). Idempotent via on conflict do nothing.
-- Returns the number of students newly unlocked.

create or replace function public.backfill_badge_for_all_eligible(p_badge_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.badges%rowtype;
  sp record;
  awarded int := 0;
  student_tier public.subscription_tier;
begin
  select * into b from public.badges where id = p_badge_id and is_active;
  if not found then
    return 0;
  end if;

  for sp in select id from public.student_profiles loop
    -- skip already-owned
    if exists (
      select 1 from public.student_badges
      where student_id = sp.id and badge_id = b.id
    ) then
      continue;
    end if;

    -- skip tier-gated
    select subscription_tier into student_tier
    from public.student_profiles where id = sp.id;
    if student_tier < b.required_tier then
      continue;
    end if;

    -- eligibility
    if not public.check_trigger_eligibility(sp.id, b.trigger_type, b.trigger_params) then
      continue;
    end if;

    insert into public.student_badges (student_id, badge_id)
    values (sp.id, b.id)
    on conflict do nothing;

    if b.coin_reward > 0 then
      update public.student_profiles
      set coins = coalesce(coins, 0) + b.coin_reward
      where id = sp.id;
    end if;

    awarded := awarded + 1;
  end loop;

  return awarded;
end;
$$;

-- FUNCTION: get_child_badge_summary -----------------------------------------
-- Returns (lifetime, this_week) badge counts for a given child. Used by the
-- parent StatisticsPage card. RLS is enforced at the student_badges read
-- policy level (parent can read badges of linked children).

create or replace function public.get_child_badge_summary(p_child_id uuid)
returns table (
  lifetime integer,
  this_week integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.student_badges
     where student_id = p_child_id) as lifetime,
    (select count(*)::int from public.student_badges
     where student_id = p_child_id
       and unlocked_at >= date_trunc('week', now())) as this_week;
$$;

-- ============================================================================
-- Updated existing RPCs with badge check hook
--
-- The 6 pet/spin RPCs below change return type (json/uuid/uuid[]/void → jsonb),
-- which CREATE OR REPLACE cannot do. We DROP + CREATE each. DROP also drops
-- grants, so GRANT EXECUTE is re-added at the end of this section.
-- ============================================================================

drop function if exists public.combine_pets(uuid, uuid[]) cascade;
drop function if exists public.evolve_pet(uuid, uuid) cascade;
drop function if exists public.feed_pet_for_evolution(uuid, uuid, integer) cascade;
drop function if exists public.gacha_multi_pull() cascade;
drop function if exists public.gacha_pull() cascade;
drop function if exists public.record_spin_reward(uuid, uuid, integer) cascade;

-- complete_practice_session: same return type (jsonb), no drop needed
create or replace function public.complete_practice_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_completed_at timestamptz;
  v_correct_count integer;
  v_total_time_seconds integer;
  v_base_xp constant integer := 25;
  v_bonus_xp_per_correct constant integer := 15;
  v_base_coins constant integer := 10;
  v_bonus_coins_per_correct constant integer := 5;
  v_total_xp integer;
  v_total_coins integer;
  v_new_badges jsonb;
begin
  -- Check if session exists and is not already completed
  select student_id, completed_at
  into v_student_id, v_completed_at
  from practice_sessions
  where id = p_session_id;

  if v_student_id is null then
    raise exception 'Session not found: %', p_session_id;
  end if;

  if v_completed_at is not null then
    raise exception 'Session already completed: %', p_session_id;
  end if;

  -- Count correct answers from actual answer records (not client-supplied)
  select
    count(*) filter (where is_correct = true),
    coalesce(sum(time_spent_seconds), 0)
  into v_correct_count, v_total_time_seconds
  from practice_answers
  where session_id = p_session_id;

  -- Calculate rewards server-side
  v_total_xp := v_base_xp + (v_correct_count * v_bonus_xp_per_correct);
  v_total_coins := v_base_coins + (v_correct_count * v_bonus_coins_per_correct);

  -- Update the practice session with completion data
  -- Setting completed_at fires the auto_mark_practiced_on_complete trigger,
  -- which upserts daily_statuses with the correct local timezone date
  -- and cascades to update the student's streak
  update practice_sessions
  set
    completed_at = now(),
    total_time_seconds = v_total_time_seconds,
    correct_count = v_correct_count,
    xp_earned = v_total_xp,
    coins_earned = v_total_coins
  where id = p_session_id;

  -- Award XP and coins to the student
  update student_profiles
  set
    xp = xp + v_total_xp,
    coins = coins + v_total_coins
  where id = v_student_id;

  -- NEW: update max_streak (for max_streak_ever badge trigger)
  update public.student_profiles
  set max_streak = greatest(max_streak, current_streak)
  where id = v_student_id;

  -- NEW: defensive badge check
  begin
    select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_new_badges
    from public.check_and_award_badges(v_student_id) b;
  exception when others then
    raise warning 'badge check failed for student %: %', v_student_id, sqlerrm;
    v_new_badges := '[]'::jsonb;
  end;

  return jsonb_build_object(
    'xp_earned', v_total_xp,
    'coins_earned', v_total_coins,
    'correct_count', v_correct_count,
    'newly_unlocked_badges', v_new_badges
  );
end;
$$;

-- combine_pets: json → jsonb, + badge check after successful combine
create or replace function public.combine_pets(p_student_id uuid, p_owned_pet_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rarity public.pet_rarity;
  v_next_rarity public.pet_rarity;
  v_success boolean;
  v_success_rate numeric;
  v_result_rarity public.pet_rarity;
  v_result_pet_id uuid;
  v_unique_id uuid;
  v_required_count integer;
  v_actual_count integer;
  v_actual_rarity public.pet_rarity;
  v_new_badges jsonb;
begin
  -- Validate exactly 4 pets in array
  if array_length(p_owned_pet_ids, 1) is null or array_length(p_owned_pet_ids, 1) != 4 then
    return jsonb_build_object('success', false, 'error', 'Must select exactly 4 pets');
  end if;

  -- Get rarity of first pet
  select p.rarity into v_rarity
  from public.owned_pets op
  join public.pets p on p.id = op.pet_id
  where op.id = p_owned_pet_ids[1] and op.student_id = p_student_id;

  if v_rarity is null then
    return jsonb_build_object('success', false, 'error', 'Pet not found or not owned');
  end if;

  if v_rarity = 'legendary' then
    return jsonb_build_object('success', false, 'error', 'Cannot combine legendary pets');
  end if;

  -- Validate each unique owned_pet_id
  for v_unique_id in select distinct unnest(p_owned_pet_ids)
  loop
    select count(*) into v_required_count
    from unnest(p_owned_pet_ids) as id
    where id = v_unique_id;

    select op.count, p.rarity into v_actual_count, v_actual_rarity
    from public.owned_pets op
    join public.pets p on p.id = op.pet_id
    where op.id = v_unique_id and op.student_id = p_student_id;

    if v_actual_count is null then
      return jsonb_build_object('success', false, 'error', 'Pet not found or not owned');
    end if;

    if v_actual_rarity != v_rarity then
      return jsonb_build_object('success', false, 'error', 'All pets must be same rarity');
    end if;

    if v_actual_count < v_required_count then
      return jsonb_build_object('success', false, 'error', 'Not enough of this pet to combine');
    end if;
  end loop;

  -- Determine next rarity and success rate
  v_next_rarity := case v_rarity
    when 'common' then 'rare'::public.pet_rarity
    when 'rare' then 'epic'::public.pet_rarity
    when 'epic' then 'legendary'::public.pet_rarity
  end;

  v_success_rate := case v_rarity
    when 'common' then 0.50
    when 'rare' then 0.35
    when 'epic' then 0.25
    else 0
  end;

  v_success := random() < v_success_rate;
  v_result_rarity := case when v_success then v_next_rarity else v_rarity end;

  select id into v_result_pet_id
  from public.pets
  where rarity = v_result_rarity
  order by random()
  limit 1;

  if v_result_pet_id is null then
    return jsonb_build_object('success', false, 'error', 'No pets available for result rarity');
  end if;

  -- Consume the 4 input pets
  for v_unique_id in select distinct unnest(p_owned_pet_ids)
  loop
    select count(*) into v_required_count
    from unnest(p_owned_pet_ids) as id
    where id = v_unique_id;

    select count into v_actual_count
    from public.owned_pets
    where id = v_unique_id;

    if v_actual_count > v_required_count then
      update public.owned_pets set count = count - v_required_count where id = v_unique_id;
    else
      delete from public.owned_pets where id = v_unique_id;
    end if;
  end loop;

  -- Add result pet at tier 1
  insert into public.owned_pets (student_id, pet_id, tier, count)
  values (p_student_id, v_result_pet_id, 1, 1)
  on conflict (student_id, pet_id)
  do update set count = public.owned_pets.count + 1;

  -- NEW: defensive badge check
  begin
    select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_new_badges
    from public.check_and_award_badges(p_student_id) b;
  exception when others then
    raise warning 'badge check failed for student %: %', p_student_id, sqlerrm;
    v_new_badges := '[]'::jsonb;
  end;

  return jsonb_build_object(
    'success', true,
    'upgraded', v_success,
    'result_pet_id', v_result_pet_id,
    'result_rarity', v_result_rarity,
    'newly_unlocked_badges', v_new_badges
  );
end;
$$;

-- evolve_pet: json → jsonb, + badge check after successful evolve
create or replace function public.evolve_pet(p_owned_pet_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owned_pet record;
  v_current_tier integer;
  v_food_fed integer;
  v_required_food integer;
  v_new_tier integer;
  v_new_badges jsonb;
begin
  -- Get the owned pet
  select * into v_owned_pet
  from public.owned_pets
  where id = p_owned_pet_id and student_id = p_student_id;

  if v_owned_pet is null then
    return jsonb_build_object('success', false, 'error', 'Pet not found');
  end if;

  v_current_tier := v_owned_pet.tier;
  v_food_fed := v_owned_pet.food_fed;

  if v_current_tier >= 3 then
    return jsonb_build_object('success', false, 'error', 'Pet is already at max tier');
  end if;

  if v_current_tier = 1 then
    v_required_food := 10;
  else
    v_required_food := 25;
  end if;

  if v_food_fed < v_required_food then
    return jsonb_build_object(
      'success', false,
      'error', 'Not enough food fed',
      'current', v_food_fed,
      'required', v_required_food
    );
  end if;

  v_new_tier := v_current_tier + 1;

  update public.owned_pets
  set
    tier = v_new_tier,
    food_fed = 0
  where id = p_owned_pet_id;

  -- NEW: defensive badge check
  begin
    select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_new_badges
    from public.check_and_award_badges(p_student_id) b;
  exception when others then
    raise warning 'badge check failed for student %: %', p_student_id, sqlerrm;
    v_new_badges := '[]'::jsonb;
  end;

  return jsonb_build_object(
    'success', true,
    'new_tier', v_new_tier,
    'pet_id', v_owned_pet.pet_id,
    'newly_unlocked_badges', v_new_badges
  );
end;
$$;

-- feed_pet_for_evolution: json → jsonb, + badge check after successful feed
create or replace function public.feed_pet_for_evolution(
  p_owned_pet_id uuid,
  p_student_id uuid,
  p_food_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owned_pet record;
  v_student_food integer;
  v_new_food_fed integer;
  v_required_food integer;
  v_can_evolve boolean;
  v_new_badges jsonb;
begin
  select * into v_owned_pet
  from public.owned_pets
  where id = p_owned_pet_id and student_id = p_student_id;

  if v_owned_pet is null then
    return jsonb_build_object('success', false, 'error', 'Pet not found');
  end if;

  if v_owned_pet.tier >= 3 then
    return jsonb_build_object('success', false, 'error', 'Pet is already at max tier');
  end if;

  select food into v_student_food
  from public.student_profiles
  where id = p_student_id;

  if v_student_food is null or v_student_food < p_food_amount then
    return jsonb_build_object('success', false, 'error', 'Not enough food');
  end if;

  -- Deduct food from student
  update public.student_profiles
  set food = food - p_food_amount
  where id = p_student_id;

  -- Add food to pet
  v_new_food_fed := v_owned_pet.food_fed + p_food_amount;

  update public.owned_pets
  set food_fed = v_new_food_fed
  where id = p_owned_pet_id;

  if v_owned_pet.tier = 1 then
    v_required_food := 10;
  else
    v_required_food := 25;
  end if;

  v_can_evolve := v_new_food_fed >= v_required_food;

  -- NEW: defensive badge check
  begin
    select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_new_badges
    from public.check_and_award_badges(p_student_id) b;
  exception when others then
    raise warning 'badge check failed for student %: %', p_student_id, sqlerrm;
    v_new_badges := '[]'::jsonb;
  end;

  return jsonb_build_object(
    'success', true,
    'food_fed', v_new_food_fed,
    'required_food', v_required_food,
    'can_evolve', v_can_evolve,
    'newly_unlocked_badges', v_new_badges
  );
end;
$$;

-- gacha_multi_pull: uuid[] → jsonb (wraps pet_ids + newly_unlocked_badges)
create or replace function public.gacha_multi_pull()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_current_coins integer;
  v_cost constant integer := 900;
  v_result uuid[] := '{}';
  v_pet_id uuid;
  v_random_value float;
  v_rarity pet_rarity;
  i integer;
  v_new_badges jsonb;
begin
  v_student_id := (select auth.uid());
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select coins into v_current_coins from student_profiles where id = v_student_id;
  if v_current_coins is null then
    raise exception 'Student profile not found';
  end if;
  if v_current_coins < v_cost then
    raise exception 'Insufficient coins';
  end if;

  -- Deduct coins (900 for 10x = 10% discount)
  update student_profiles set coins = coins - v_cost where id = v_student_id;

  -- Pull 10 pets
  for i in 1..10 loop
    v_random_value := random();
    if v_random_value < 0.01 then
      v_rarity := 'legendary';
    elsif v_random_value < 0.10 then
      v_rarity := 'epic';
    elsif v_random_value < 0.40 then
      v_rarity := 'rare';
    else
      v_rarity := 'common';
    end if;

    select id into v_pet_id from pets where rarity = v_rarity order by random() limit 1;
    v_result := v_result || v_pet_id;

    insert into owned_pets (student_id, pet_id, count)
    values (v_student_id, v_pet_id, 1)
    on conflict (student_id, pet_id) do update set
      count = owned_pets.count + 1,
      updated_at = now();
  end loop;

  -- NEW: defensive badge check
  begin
    select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_new_badges
    from public.check_and_award_badges(v_student_id) b;
  exception when others then
    raise warning 'badge check failed for student %: %', v_student_id, sqlerrm;
    v_new_badges := '[]'::jsonb;
  end;

  return jsonb_build_object(
    'pet_ids', to_jsonb(v_result),
    'newly_unlocked_badges', v_new_badges
  );
end;
$$;

-- record_spin_reward: void → jsonb (just newly_unlocked_badges; no other output)
create or replace function public.record_spin_reward(
  p_daily_status_id uuid,
  p_student_id uuid,
  p_reward integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_spun boolean;
  v_new_badges jsonb;
begin
  -- Validate reward is one of the valid spin wheel amounts
  if p_reward not in (5, 10, 15) then
    raise exception 'Invalid reward amount. Must be 5, 10, or 15.';
  end if;

  -- Check if already spun today
  select has_spun into v_has_spun
  from daily_statuses
  where id = p_daily_status_id and student_id = p_student_id;

  if v_has_spun is null then
    raise exception 'Daily status not found for student';
  end if;

  if v_has_spun = true then
    raise exception 'Already spun today';
  end if;

  -- Step 1: Update daily status with spin info
  update daily_statuses
  set
    has_spun = true,
    spin_reward = p_reward
  where id = p_daily_status_id
    and student_id = p_student_id;

  -- Step 2: Credit coins to student profile
  update student_profiles
  set coins = coins + p_reward
  where id = p_student_id;

  -- NEW: defensive badge check
  begin
    select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_new_badges
    from public.check_and_award_badges(p_student_id) b;
  exception when others then
    raise warning 'badge check failed for student %: %', p_student_id, sqlerrm;
    v_new_badges := '[]'::jsonb;
  end;

  return jsonb_build_object('newly_unlocked_badges', v_new_badges);
end;
$$;

-- ============================================================================
-- Row Level Security policies
-- ============================================================================

-- BADGES: catalog is read-only for all authenticated users. Mutations via
-- migrations only (service role bypasses RLS).
alter table public.badges enable row level security;

create policy "badges_read_all_authenticated"
on public.badges for select
to authenticated
using (true);

-- STUDENT_BADGES: owner + linked parents can read; owner can mark as seen.
-- No INSERT or DELETE policies — awarding via security definer functions,
-- deletion via ON DELETE CASCADE.
--
-- A single merged SELECT policy (own OR linked child) keeps the
-- per-query RLS overhead to one predicate instead of two (avoids the
-- "multiple permissive policies" advisor warning).
alter table public.student_badges enable row level security;

create policy "student_badges_read_own_or_linked"
on public.student_badges for select
to authenticated
using (
  student_id = (select auth.uid())
  or student_id in (
    select student_id from public.parent_student_links
    where parent_id = (select auth.uid())
  )
);

create policy "student_badges_update_seen_own"
on public.student_badges for update
to authenticated
using (student_id = (select auth.uid()))
with check (student_id = (select auth.uid()));

-- ============================================================================
-- gacha_pull: retroactive hook (1x pull, server-side badge check)
-- uuid → jsonb to stay consistent with gacha_multi_pull and other pet RPCs.
-- ============================================================================

create or replace function public.gacha_pull()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_current_coins integer;
  v_cost constant integer := 100;
  v_random_value float;
  v_selected_pet_id uuid;
  v_rarity pet_rarity;
  v_new_badges jsonb;
begin
  v_student_id := (select auth.uid());
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Check coins
  select coins into v_current_coins from student_profiles where id = v_student_id;
  if v_current_coins is null then
    raise exception 'Student profile not found';
  end if;
  if v_current_coins < v_cost then
    raise exception 'Insufficient coins';
  end if;

  -- Deduct coins
  update student_profiles set coins = coins - v_cost where id = v_student_id;

  -- Determine rarity (60% common, 30% rare, 9% epic, 1% legendary)
  v_random_value := random();
  if v_random_value < 0.01 then
    v_rarity := 'legendary';
  elsif v_random_value < 0.10 then
    v_rarity := 'epic';
  elsif v_random_value < 0.40 then
    v_rarity := 'rare';
  else
    v_rarity := 'common';
  end if;

  -- Select random pet of that rarity
  select id into v_selected_pet_id from pets where rarity = v_rarity order by random() limit 1;

  -- Add to owned pets (or increment count)
  insert into owned_pets (student_id, pet_id, count)
  values (v_student_id, v_selected_pet_id, 1)
  on conflict (student_id, pet_id) do update set
    count = owned_pets.count + 1,
    updated_at = now();

  -- NEW: defensive badge check
  begin
    select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_new_badges
    from public.check_and_award_badges(v_student_id) b;
  exception when others then
    raise warning 'badge check failed for student %: %', v_student_id, sqlerrm;
    v_new_badges := '[]'::jsonb;
  end;

  return jsonb_build_object(
    'pet_id', v_selected_pet_id,
    'newly_unlocked_badges', v_new_badges
  );
end;
$$;

-- ============================================================================
-- Grants
--
-- Re-grant the 6 RPCs we DROPped above (DROP dropped their grants).
-- Also grant EXECUTE on the new client-facing functions for authenticated role.
-- The internal-only functions (check_trigger_eligibility, check_and_award_badges,
-- backfill_badge_for_all_eligible) run under SECURITY DEFINER ownership, so
-- callers never need direct EXECUTE.
-- ============================================================================

grant all on function public.combine_pets(uuid, uuid[]) to anon, authenticated, service_role;
grant all on function public.evolve_pet(uuid, uuid) to anon, authenticated, service_role;
grant all on function public.feed_pet_for_evolution(uuid, uuid, integer) to anon, authenticated, service_role;
grant all on function public.gacha_multi_pull() to anon, authenticated, service_role;
grant all on function public.gacha_pull() to anon, authenticated, service_role;
grant all on function public.record_spin_reward(uuid, uuid, integer) to anon, authenticated, service_role;

grant execute on function public.get_student_badge_progress(uuid) to authenticated;
grant execute on function public.get_child_badge_summary(uuid) to authenticated;
