-- ============================================================================
-- Badge Catalog v2 — social & lifecycle triggers
--
-- Uses 4 new trigger types (parent_linked, subscription_tier_reached,
-- total_friends, friend_closeness_level_reached) that were added to
-- badge_trigger_type in the prior migration (20260420115500). The split is
-- required because Postgres refuses to USE a new enum value in the same
-- transaction it was added — see that migration for context.
--
-- This migration extends pet_max_tier_reached to honor a {threshold} param,
-- introduces 16 new badges, reshapes the existing `evolved` badge
-- (Gold → Bronze, threshold=1), and wires badge checks into the parent-link,
-- subscription-sync, friend-accept, and daily-coin-gift flows. All badge
-- checks are wrapped in exception blocks so failures never block the
-- primary operation.
-- ============================================================================

-- 1. Replace check_trigger_eligibility --------------------------------------
-- New arms for the 4 new triggers; pet_max_tier_reached now honors {threshold}.

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
declare
  v_cur_tier subscription_tier;
  v_req_tier subscription_tier;
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
    return (select count(*) from public.owned_pets
            where student_id = p_student_id and tier = 3)
           >= coalesce((p_params->>'threshold')::int, 1);

  elsif p_trigger_type = 'pets_of_rarity_count' then
    return (select count(*) from public.owned_pets op
            join public.pets p on p.id = op.pet_id
            where op.student_id = p_student_id
              and p.rarity = (p_params->>'rarity')::pet_rarity)
           >= (p_params->>'threshold')::int;

  elsif p_trigger_type = 'parent_linked' then
    return exists (select 1 from public.parent_student_links
                   where student_id = p_student_id);

  elsif p_trigger_type = 'subscription_tier_reached' then
    select subscription_tier into v_cur_tier
    from public.student_profiles where id = p_student_id;
    v_req_tier := (p_params->>'min_tier')::subscription_tier;
    return v_cur_tier >= v_req_tier;

  elsif p_trigger_type = 'total_friends' then
    return (select count(*) from public.friendships
            where status = 'accepted'
              and (requester_id = p_student_id or recipient_id = p_student_id))
           >= (p_params->>'threshold')::int;

  elsif p_trigger_type = 'friend_closeness_level_reached' then
    return (select count(*) from public.friendships
            where status = 'accepted'
              and closeness_level >= (p_params->>'min_level')::int
              and (requester_id = p_student_id or recipient_id = p_student_id))
           >= (p_params->>'threshold')::int;

  else
    raise exception 'check_trigger_eligibility: unknown trigger type %', p_trigger_type
      using errcode = 'data_exception';
  end if;
end;
$$;

-- 2. Replace get_student_badge_progress -------------------------------------

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
  v_req_tier public.subscription_tier;
  v_tier_rank int;
  v_cur_rank int;
begin
  select subscription_tier into student_tier
  from public.student_profiles where id = p_student_id;

  if student_tier is null then
    return;
  end if;

  for b in
    select * from public.badges where is_active
  loop
    if exists (
      select 1 from public.student_badges sb
      where sb.student_id = p_student_id and sb.badge_id = b.id
    ) then
      continue;
    end if;

    if student_tier < b.required_tier then
      continue;
    end if;

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
        cur := (select count(*) from public.owned_pets
                where student_id = p_student_id and tier = 3);
        tgt := coalesce((b.trigger_params->>'threshold')::numeric, 1);

      when 'pets_of_rarity_count' then
        cur := (select count(*) from public.owned_pets op
                join public.pets p on p.id = op.pet_id
                where op.student_id = p_student_id
                  and p.rarity = (b.trigger_params->>'rarity')::pet_rarity);
        tgt := (b.trigger_params->>'threshold')::numeric;

      when 'parent_linked' then
        cur := case when exists (
          select 1 from public.parent_student_links where student_id = p_student_id
        ) then 1 else 0 end;
        tgt := 1;

      when 'subscription_tier_reached' then
        v_req_tier := (b.trigger_params->>'min_tier')::public.subscription_tier;
        v_tier_rank := case v_req_tier
          when 'core' then 0 when 'plus' then 1 when 'pro' then 2 when 'max' then 3 end;
        v_cur_rank := case student_tier
          when 'core' then 0 when 'plus' then 1 when 'pro' then 2 when 'max' then 3 end;
        cur := v_cur_rank;
        tgt := v_tier_rank;

      when 'total_friends' then
        cur := (select count(*) from public.friendships
                where status = 'accepted'
                  and (requester_id = p_student_id or recipient_id = p_student_id));
        tgt := (b.trigger_params->>'threshold')::numeric;

      when 'friend_closeness_level_reached' then
        cur := (select count(*) from public.friendships
                where status = 'accepted'
                  and closeness_level >= (b.trigger_params->>'min_level')::int
                  and (requester_id = p_student_id or recipient_id = p_student_id));
        tgt := (b.trigger_params->>'threshold')::numeric;

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

-- 3. Event wiring -----------------------------------------------------------

-- 3a. parent_linked — fires for student after link is created.
create or replace function public.accept_parent_student_invitation(
  p_invitation_id uuid, p_accepting_user_id uuid, p_is_parent boolean
) returns table(link_id uuid, parent_id uuid, student_id uuid, linked_at timestamptz,
  parent_name text, parent_email text, student_name text, student_email text,
  student_avatar_path text, student_grade_level_name text)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_invitation record;
  v_link_id uuid;
  v_linked_at timestamptz;
  v_parent_id uuid;
  v_student_id uuid;
begin
  select * into v_invitation from parent_student_invitations where id = p_invitation_id;
  if v_invitation is null then raise exception 'Invitation not found: %', p_invitation_id; end if;
  if v_invitation.status != 'pending' then
    raise exception 'Invitation is not pending: %', v_invitation.status;
  end if;

  if p_is_parent then
    v_parent_id := p_accepting_user_id;
    v_student_id := v_invitation.student_id;
    if v_student_id is null then raise exception 'Student ID not found in invitation'; end if;
  else
    v_parent_id := v_invitation.parent_id;
    v_student_id := p_accepting_user_id;
    if v_parent_id is null then raise exception 'Parent ID not found in invitation'; end if;
  end if;

  if exists (select 1 from parent_student_links where parent_student_links.student_id = v_student_id) then
    raise exception 'Student already has a linked parent';
  end if;

  update parent_student_invitations
    set status = 'accepted', responded_at = now(),
        parent_id = v_parent_id, student_id = v_student_id
    where id = p_invitation_id;

  insert into parent_student_links (parent_id, student_id)
    values (v_parent_id, v_student_id)
    returning id, parent_student_links.linked_at into v_link_id, v_linked_at;

  begin
    perform public.check_and_award_badges(v_student_id);
  exception when others then
    raise warning 'badge check failed for student %: %', v_student_id, sqlerrm;
  end;

  return query
  select v_link_id, v_parent_id, v_student_id, v_linked_at,
         p.name, p.email, sp_profile.name, sp_profile.email,
         sp_profile.avatar_path, gl.name
  from profiles p
  cross join profiles sp_profile
  left join student_profiles sp on sp.id = v_student_id
  left join grade_levels gl on gl.id = sp.grade_level_id
  where p.id = v_parent_id and sp_profile.id = v_student_id;
end;
$$;

-- 3b. subscription_tier_reached — fires on tier sync.
create or replace function public.sync_subscription_tier_to_profile()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_student_id uuid;
  v_new_tier subscription_tier;
begin
  if tg_op = 'DELETE' then
    v_student_id := old.student_id;
  else
    v_student_id := new.student_id;
  end if;

  select cs.tier into v_new_tier
  from child_subscriptions cs
  where cs.student_id = v_student_id and cs.is_active = true
  order by cs.updated_at desc
  limit 1;

  if v_new_tier is null then v_new_tier := 'core'; end if;

  update student_profiles
    set subscription_tier = v_new_tier
    where id = v_student_id;

  begin
    perform public.check_and_award_badges(v_student_id);
  exception when others then
    raise warning 'badge check failed for student %: %', v_student_id, sqlerrm;
  end;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- 3c. total_friends — fires on friend accept for both parties.
create or replace function public.respond_friend_request(p_friendship_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_id uuid := auth.uid();
  v_friendship record;
  v_friend_count int;
begin
  select * into v_friendship from friendships where id = p_friendship_id;
  if v_friendship is null then raise exception 'Friend request not found'; end if;
  if v_friendship.recipient_id <> v_caller_id then
    raise exception 'Only the recipient can respond to this request';
  end if;
  if v_friendship.status <> 'pending' then
    raise exception 'This request is no longer pending';
  end if;

  if p_accept then
    select count(*) into v_friend_count
    from friendships
    where (requester_id = v_caller_id or recipient_id = v_caller_id)
      and status = 'accepted';
    if v_friend_count >= 30 then raise exception 'Friend limit reached (max 30)'; end if;

    update friendships
      set status = 'accepted', responded_at = now()
      where id = p_friendship_id;

    begin
      perform public.check_and_award_badges(v_friendship.requester_id);
      perform public.check_and_award_badges(v_friendship.recipient_id);
    exception when others then
      raise warning 'friend accept badge check failed: %', sqlerrm;
    end;
  else
    update friendships
      set status = 'declined', responded_at = now()
      where id = p_friendship_id;
  end if;
end;
$$;

-- 3d. friend_closeness_level_reached — fires on mutual coin gift.
-- Returns newly-unlocked badges for the caller so the client can celebrate.
create or replace function public.send_daily_coins(p_friendship_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller_id uuid := auth.uid();
  v_friendship record;
  v_receiver_id uuid;
  v_is_mutual boolean := false;
  v_new_xp int;
  v_new_level int;
  v_level_thresholds int[] := array[0, 5, 15, 35, 70, 120];
  v_new_badges jsonb := '[]'::jsonb;
begin
  select * into v_friendship from friendships where id = p_friendship_id;
  if v_friendship is null then raise exception 'Friendship not found'; end if;
  if v_friendship.status <> 'accepted' then
    raise exception 'Can only send coins to accepted friends';
  end if;

  if v_friendship.requester_id = v_caller_id then
    v_receiver_id := v_friendship.recipient_id;
  elsif v_friendship.recipient_id = v_caller_id then
    v_receiver_id := v_friendship.requester_id;
  else
    raise exception 'You are not part of this friendship';
  end if;

  insert into daily_coin_gifts (friendship_id, sender_id, receiver_id)
    values (p_friendship_id, v_caller_id, v_receiver_id);

  update student_profiles
    set coins = coalesce(coins, 0) + 5
    where id = v_receiver_id;

  select exists (
    select 1 from daily_coin_gifts
    where friendship_id = p_friendship_id
      and sender_id = v_receiver_id
      and sent_date = (now() at time zone 'Asia/Kuala_Lumpur')::date
  ) into v_is_mutual;

  if v_is_mutual then
    v_new_xp := v_friendship.closeness_xp + 1;
    v_new_level := 0;
    for i in reverse array_upper(v_level_thresholds, 1)..1 loop
      if v_new_xp >= v_level_thresholds[i] then
        v_new_level := i - 1;
        exit;
      end if;
    end loop;

    update friendships
      set closeness_xp = v_new_xp, closeness_level = v_new_level
      where id = p_friendship_id;

    begin
      select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_new_badges
      from public.check_and_award_badges(v_caller_id) b;
      perform public.check_and_award_badges(v_receiver_id);
    exception when others then
      raise warning 'closeness badge check failed: %', sqlerrm;
      v_new_badges := '[]'::jsonb;
    end;
  end if;

  return jsonb_build_object(
    'receiver_id', v_receiver_id,
    'is_mutual', v_is_mutual,
    'closeness_xp', case when v_is_mutual then v_new_xp else v_friendship.closeness_xp end,
    'closeness_level', case when v_is_mutual then v_new_level else v_friendship.closeness_level end,
    'newly_unlocked_badges', v_new_badges
  );
end;
$$;

-- 4. Catalog updates --------------------------------------------------------

-- Reshape existing 'evolved': Gold 80 → Bronze 15, {} → {threshold:1}.
update public.badges
  set tier = 'bronze', coin_reward = 15,
      trigger_params = jsonb_build_object('threshold', 1)
  where slug = 'evolved';

-- Insert 16 new badges.
insert into public.badges (slug, trigger_type, trigger_params, tier, coin_reward, icon_path, required_tier)
values
  ('pet_menagerie',      'unique_pets_owned',              '{"threshold":30}', 'platinum', 175, 'pet_menagerie.webp',      'core'),
  ('ascended',           'pet_max_tier_reached',           '{"threshold":3}',  'silver',    35, 'ascended.webp',           'core'),
  ('apex_keeper',        'pet_max_tier_reached',           '{"threshold":7}',  'gold',      80, 'apex_keeper.webp',        'core'),
  ('pantheon',           'pet_max_tier_reached',           '{"threshold":15}', 'platinum', 175, 'pantheon.webp',           'core'),
  ('family_bond',        'parent_linked',                  '{}',               'bronze',    15, 'family_bond.webp',        'core'),
  ('supporter',          'subscription_tier_reached',      '{"min_tier":"plus"}',  'gold',      80, 'supporter.webp',          'core'),
  ('patron',             'subscription_tier_reached',      '{"min_tier":"pro"}',   'platinum', 175, 'patron.webp',             'core'),
  ('first_friend',       'total_friends',                  '{"threshold":1}',  'bronze',    15, 'first_friend.webp',       'core'),
  ('social_circle',      'total_friends',                  '{"threshold":5}',  'silver',    35, 'social_circle.webp',      'core'),
  ('popular',            'total_friends',                  '{"threshold":15}', 'gold',      80, 'popular.webp',            'core'),
  ('networker',          'total_friends',                  '{"threshold":30}', 'platinum', 175, 'networker.webp',          'core'),
  ('new_bond',           'friend_closeness_level_reached', '{"min_level":1,"threshold":1}', 'bronze',    15, 'new_bond.webp',           'core'),
  ('close_friend',       'friend_closeness_level_reached', '{"min_level":3,"threshold":1}', 'silver',    35, 'close_friend.webp',       'core'),
  ('kindred_spirits',    'friend_closeness_level_reached', '{"min_level":5,"threshold":1}', 'gold',      80, 'kindred_spirits.webp',    'core'),
  ('bonded_trio',        'friend_closeness_level_reached', '{"min_level":5,"threshold":3}', 'platinum', 175, 'bonded_trio.webp',        'core'),
  ('soulmates',          'friend_closeness_level_reached', '{"min_level":5,"threshold":5}', 'diamond',  400, 'soulmates.webp',          'core');

-- 5. Retroactive backfill ---------------------------------------------------

do $$
declare b_id uuid;
begin
  for b_id in
    select id from public.badges
    where slug in (
      'pet_menagerie','ascended','apex_keeper','pantheon',
      'family_bond','supporter','patron',
      'first_friend','social_circle','popular','networker',
      'new_bond','close_friend','kindred_spirits','bonded_trio','soulmates'
    )
  loop
    perform public.backfill_badge_for_all_eligible(b_id);
  end loop;
end $$;
