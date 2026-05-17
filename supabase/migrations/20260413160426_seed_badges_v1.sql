-- ============================================================================
-- v1 Badge Catalog Seed
-- Spec: docs/superpowers/specs/2026-04-13-achievements-badges-design.md
-- Distribution: 5 Bronze / 6 Silver / 7 Gold / 5 Platinum / 6 Diamond / 5 Master / 5 Grandmaster (39 total)
-- All badges are core (no tier-gating). Grandmaster thresholds target ~1 year on Pro subscription.
-- display_order values are scoped per (final) tier and match the curated
-- presentation sequence; gaps here correspond to badges that v2 adds later.
-- ============================================================================

insert into public.badges (slug, trigger_type, trigger_params, tier, coin_reward, icon_path, required_tier, display_order)
values
  -- Bronze (5)
  ('first_steps',       'total_sessions_completed', '{"threshold":1}',    'bronze', 15, 'first_steps.webp',       'core', 2),
  ('first_week',        'total_days_practiced',     '{"threshold":7}',    'bronze', 15, 'first_week.webp',        'core', 6),
  ('spark',             'max_streak_ever',          '{"threshold":3}',    'bronze', 15, 'spark.webp',             'core', 5),
  ('perfectionist',     'perfect_sessions_count',   '{"threshold":5}',    'bronze', 15, 'perfectionist.webp',     'core', 4),
  ('xp_novice',         'total_xp_earned',          '{"threshold":1000}', 'bronze', 15, 'xp_novice.webp',         'core', 3),

  -- Silver (6)
  ('getting_started',   'total_sessions_completed', '{"threshold":10}',   'silver', 35, 'getting_started.webp',   'core', 2),
  ('first_month',       'total_days_practiced',     '{"threshold":30}',   'silver', 35, 'first_month.webp',       'core', 6),
  ('hot_streak',        'max_streak_ever',          '{"threshold":7}',    'silver', 35, 'hot_streak.webp',        'core', 5),
  ('xp_adept',          'total_xp_earned',          '{"threshold":5000}', 'silver', 35, 'xp_adept.webp',          'core', 3),
  ('flawless',          'perfect_sessions_count',   '{"threshold":25}',   'silver', 35, 'flawless.webp',          'core', 4),
  ('pet_collector',     'unique_pets_owned',        '{"threshold":5}',    'silver', 35, 'pet_collector.webp',     'core', 7),

  -- Gold (7)
  ('dedicated_learner', 'total_sessions_completed', '{"threshold":50}',   'gold',   80, 'dedicated_learner.webp', 'core', 2),
  ('unstoppable',       'max_streak_ever',          '{"threshold":30}',   'gold',   80, 'unstoppable.webp',       'core', 6),
  ('pet_enthusiast',    'unique_pets_owned',        '{"threshold":15}',   'gold',   80, 'pet_enthusiast.webp',    'core', 8),
  -- evolved is reshaped to Bronze in v2 (migration 20260420120000); the display_order
  -- value matches its final Bronze position so the move is a tier swap only.
  ('evolved',           'pet_max_tier_reached',     '{}',                 'gold',   80, 'evolved.webp',           'core', 9),
  ('xp_expert',         'total_xp_earned',          '{"threshold":20000}','gold',   80, 'xp_expert.webp',         'core', 3),
  ('steady_hand',       'total_days_practiced',     '{"threshold":60}',   'gold',   80, 'steady_hand.webp',       'core', 5),
  ('meticulous',        'perfect_sessions_count',   '{"threshold":75}',   'gold',   80, 'meticulous.webp',        'core', 4),

  -- Platinum (5)
  ('serious_student',   'total_sessions_completed', '{"threshold":250}',  'platinum', 175, 'serious_student.webp',   'core', 2),
  ('centurion',         'total_days_practiced',     '{"threshold":100}',  'platinum', 175, 'centurion.webp',         'core', 5),
  ('xp_titan',          'total_xp_earned',          '{"threshold":75000}','platinum', 175, 'xp_titan.webp',          'core', 3),
  ('immaculate',        'perfect_sessions_count',   '{"threshold":200}',  'platinum', 175, 'immaculate.webp',        'core', 4),
  ('iron_streak',       'max_streak_ever',          '{"threshold":60}',   'platinum', 175, 'iron_streak.webp',       'core', 6),

  -- Diamond (6)
  ('devoted_scholar',   'total_sessions_completed', '{"threshold":1000}', 'diamond', 400, 'devoted_scholar.webp',   'core', 2),
  ('legendary_streak',  'max_streak_ever',          '{"threshold":100}',  'diamond', 400, 'legendary_streak.webp',  'core', 6),
  ('legendary_tamer',   'pets_of_rarity_count',     '{"rarity":"legendary","threshold":1}', 'diamond', 400, 'legendary_tamer.webp', 'core', 1),
  ('xp_sage',           'total_xp_earned',          '{"threshold":200000}', 'diamond', 400, 'xp_sage.webp',         'core', 3),
  ('seasoned',          'total_days_practiced',     '{"threshold":180}',  'diamond', 400, 'seasoned.webp',          'core', 5),
  ('pristine',          'perfect_sessions_count',   '{"threshold":500}',  'diamond', 400, 'pristine.webp',          'core', 4),

  -- Master (5)
  ('xp_legend',         'total_xp_earned',          '{"threshold":500000}','master', 1200, 'xp_legend.webp',         'core', 3),
  ('summit_streak',     'max_streak_ever',          '{"threshold":200}',  'master', 1200, 'summit_streak.webp',     'core', 5),
  ('lifelong_learner',  'total_sessions_completed', '{"threshold":3000}', 'master', 1200, 'lifelong_learner.webp',   'core', 2),
  ('stalwart',          'total_days_practiced',     '{"threshold":270}',  'master', 1200, 'stalwart.webp',           'core', 1),
  ('sublime',           'perfect_sessions_count',   '{"threshold":1500}', 'master', 1200, 'sublime.webp',            'core', 4),

  -- Grandmaster (5) — free-earnable apex (~1 year on Pro)
  ('eternal_scholar',      'total_sessions_completed','{"threshold":7500}',    'grandmaster', 5000, 'eternal_scholar.webp',      'core', 2),
  ('grand_perfectionist',  'perfect_sessions_count', '{"threshold":3000}',     'grandmaster', 5000, 'grand_perfectionist.webp',  'core', 4),
  ('xp_immortal',          'total_xp_earned',        '{"threshold":1000000}',  'grandmaster', 5000, 'xp_immortal.webp',          'core', 3),
  ('yearling',             'total_days_practiced',   '{"threshold":365}',      'grandmaster', 5000, 'yearling.webp',             'core', 1),
  ('eternal_flame',        'max_streak_ever',        '{"threshold":365}',      'grandmaster', 5000, 'eternal_flame.webp',        'core', 5)
;

-- Retroactive backfill: for every badge we just inserted, grant to all
-- already-eligible students and award coins. Silent (no celebration dialogs).
do $$
declare
  b_id uuid;
begin
  for b_id in
    select id from public.badges
    where slug in (
      'first_steps','first_week','spark','perfectionist','xp_novice',
      'getting_started','first_month','hot_streak','xp_adept','flawless','pet_collector',
      'dedicated_learner','unstoppable','pet_enthusiast','evolved','xp_expert','steady_hand','meticulous',
      'serious_student','centurion','xp_titan','immaculate','iron_streak',
      'devoted_scholar','legendary_streak','legendary_tamer','xp_sage','seasoned','pristine',
      'xp_legend','summit_streak','lifelong_learner','stalwart','sublime',
      'eternal_scholar','grand_perfectionist','xp_immortal','yearling','eternal_flame'
    )
  loop
    perform public.backfill_badge_for_all_eligible(b_id);
  end loop;
end $$;
