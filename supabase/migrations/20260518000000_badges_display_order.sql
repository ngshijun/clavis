-- ============================================================================
-- Badge display ordering — student-facing presentation sequence
--
-- Adds `display_order` column so the Achievements grid can present badges
-- in an intentional thematic sequence per tier instead of the catalog's
-- created_at order. Lower values appear first within a tier.
--
-- The seed migrations have been updated in lockstep so fresh DBs get the
-- right ordering at insert time; this migration backfills existing rows.
-- ============================================================================

alter table public.badges
  add column display_order integer not null default 0;

create index badges_tier_display_order_idx
  on public.badges(tier, display_order)
  where is_active;

update public.badges set display_order = case slug
  -- Bronze
  when 'family_bond' then 1
  when 'first_steps' then 2
  when 'xp_novice' then 3
  when 'perfectionist' then 4
  when 'spark' then 5
  when 'first_week' then 6
  when 'first_friend' then 7
  when 'new_bond' then 8
  when 'evolved' then 9
  -- Silver
  when 'social_circle' then 1
  when 'getting_started' then 2
  when 'xp_adept' then 3
  when 'flawless' then 4
  when 'hot_streak' then 5
  when 'first_month' then 6
  when 'pet_collector' then 7
  when 'ascended' then 8
  when 'close_friend' then 9
  -- Gold
  when 'supporter' then 1
  when 'dedicated_learner' then 2
  when 'xp_expert' then 3
  when 'meticulous' then 4
  when 'steady_hand' then 5
  when 'unstoppable' then 6
  when 'popular' then 7
  when 'pet_enthusiast' then 8
  when 'apex_keeper' then 9
  when 'kindred_spirits' then 10
  -- Platinum
  when 'patron' then 1
  when 'serious_student' then 2
  when 'xp_titan' then 3
  when 'immaculate' then 4
  when 'centurion' then 5
  when 'iron_streak' then 6
  when 'networker' then 7
  when 'pet_menagerie' then 8
  when 'pantheon' then 9
  when 'bonded_trio' then 10
  -- Diamond
  when 'legendary_tamer' then 1
  when 'devoted_scholar' then 2
  when 'xp_sage' then 3
  when 'pristine' then 4
  when 'seasoned' then 5
  when 'legendary_streak' then 6
  when 'soulmates' then 7
  -- Master
  when 'stalwart' then 1
  when 'lifelong_learner' then 2
  when 'xp_legend' then 3
  when 'sublime' then 4
  when 'summit_streak' then 5
  -- Grandmaster
  when 'yearling' then 1
  when 'eternal_scholar' then 2
  when 'xp_immortal' then 3
  when 'grand_perfectionist' then 4
  when 'eternal_flame' then 5
  else 0
end;
