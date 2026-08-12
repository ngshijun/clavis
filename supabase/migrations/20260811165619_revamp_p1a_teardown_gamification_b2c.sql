-- ============================================================
-- Clavis 2.0 revamp — P1a part 1/3: teardown of gamification & B2C
--
-- Drops pets/gacha/evolution, badges/achievements, coins/XP/food
-- economy, spin wheel/mood (daily_statuses), friends/closeness,
-- leaderboards, streaks, parent linking, per-child subscriptions and
-- Stripe webhook bookkeeping.
--
-- payment_history is KEPT as a detached financial archive: its FKs to
-- profiles are dropped (so deleting parent auth.users in part 2/3 does
-- not cascade-delete payment records) and its `tier` column is
-- converted to text so the subscription_tier enum can be dropped.
--
-- DESTRUCTIVE: drops tables with data on staging (and on prod when the
-- PR merges). Called out in the PR body per plan.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Unschedule cron jobs owned by dropped features
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'decay-closeness-xp') THEN
    PERFORM cron.unschedule('decay-closeness-xp');
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 1. Drop leaderboard views (depend on student_profiles.xp and
--    _weekly_leaderboard_data)
-- ------------------------------------------------------------
DROP VIEW public.leaderboard;
DROP VIEW public.weekly_leaderboard;
DROP FUNCTION public._weekly_leaderboard_data();

-- ------------------------------------------------------------
-- 2. Drop policies on KEPT tables that reference tables/columns
--    dropped below (parent_student_links). They are recreated
--    org-scoped in part 3/3.
-- ------------------------------------------------------------
DROP POLICY "Read student profiles: self, linked parent, admin" ON public.student_profiles;
DROP POLICY "Users can view relevant practice sessions" ON public.practice_sessions;
DROP POLICY "Users can view relevant practice answers" ON public.practice_answers;
DROP POLICY "Users can view relevant session questions" ON public.session_questions;
DROP POLICY "Allow payment history read access" ON public.payment_history;

-- ------------------------------------------------------------
-- 3. Drop gamification / social / parent-link / subscription RPCs
-- ------------------------------------------------------------
-- Pets & economy
DROP FUNCTION public.gacha_pull();
DROP FUNCTION public.gacha_multi_pull();
DROP FUNCTION public.initial_pet_draw();
DROP FUNCTION public.feed_pet_for_evolution(uuid, uuid, integer);
DROP FUNCTION public.evolve_pet(uuid, uuid);
DROP FUNCTION public.combine_pets(uuid, uuid[]);
DROP FUNCTION public.exchange_coins_for_food(integer);
DROP FUNCTION public.record_spin_reward(uuid, uuid, integer);

-- Badges
DROP FUNCTION public.check_and_award_badges(uuid);
DROP FUNCTION public.check_trigger_eligibility(uuid, public.badge_trigger_type, jsonb);
DROP FUNCTION public.get_student_badge_progress(uuid);
DROP FUNCTION public.backfill_badge_for_all_eligible(uuid);
DROP FUNCTION public.set_featured_badges(uuid[]);
DROP FUNCTION public.get_child_badge_summary(uuid);
DROP FUNCTION public.get_student_profile_for_dialog(uuid);

-- Friends & closeness
DROP FUNCTION public.send_friend_request(uuid);
DROP FUNCTION public.respond_friend_request(uuid, boolean);
DROP FUNCTION public.send_daily_coins(uuid);
DROP FUNCTION public.remove_friend(uuid);
DROP FUNCTION public.decay_closeness_xp();
DROP FUNCTION public.get_friends();
DROP FUNCTION public.get_friend_requests();
DROP FUNCTION public.search_student_by_friend_code(text);
DROP FUNCTION public.search_students_by_name(text);

-- Leaderboard rewards
DROP FUNCTION public.distribute_weekly_leaderboard_rewards();

-- Streaks & daily statuses (trigger functions and their triggers go
-- with the daily_statuses table; the profile trigger is dropped here)
DROP TRIGGER mark_practiced_on_session_complete ON public.practice_sessions;
DROP FUNCTION public.auto_mark_practiced_on_complete();
DROP FUNCTION public.trigger_update_student_streak() CASCADE; -- drops daily_statuses triggers
DROP FUNCTION public.update_student_streak(uuid);
DROP FUNCTION public.calculate_display_streak(uuid);

-- Parent linking
DROP FUNCTION public.accept_parent_student_invitation(uuid, uuid, boolean);

-- Self-signup provisioning (replaced by the create-user edge function in P1c)
DROP FUNCTION public.create_user_profile(uuid, text, text, text, date, uuid);

-- Subscriptions / Stripe
DROP FUNCTION public.get_tier_from_stripe_price(text);
DROP TRIGGER trg_guard_subscription_tier ON public.student_profiles;
DROP FUNCTION public.guard_subscription_tier();
DROP FUNCTION public.sync_subscription_tier_to_profile() CASCADE; -- drops child_subscriptions trigger
DROP FUNCTION public.prevent_unlink_with_active_subscription() CASCADE; -- drops parent_student_links trigger

-- ------------------------------------------------------------
-- 4. Detach payment_history (kept as a financial archive)
-- ------------------------------------------------------------
ALTER TABLE public.payment_history
  DROP CONSTRAINT payment_history_parent_id_fkey,
  DROP CONSTRAINT payment_history_student_id_fkey;
-- Convert tier to plain text so the subscription_tier enum can be dropped.
ALTER TABLE public.payment_history
  ALTER COLUMN tier TYPE text USING (tier::text);
-- Admin-only read access (recreated with the org helpers in part 3/3).

-- ------------------------------------------------------------
-- 5. Drop tables (dependents first)
-- ------------------------------------------------------------
DROP TABLE public.daily_coin_gifts;
DROP TABLE public.friendships;
DROP TABLE public.student_badges; -- drops trg_auto_populate_featured_badges
DROP FUNCTION public.auto_populate_featured_badges();
DROP TABLE public.badges;
DROP TABLE public.owned_pets;
DROP TABLE public.weekly_leaderboard_rewards;
DROP TABLE public.daily_statuses;
DROP TABLE public.parent_student_invitations;
DROP TABLE public.parent_student_links;
DROP TABLE public.child_subscriptions;
DROP TABLE public.subscription_plans;
DROP TABLE public.processed_webhook_events;
DROP TABLE public.parent_profiles;

-- ------------------------------------------------------------
-- 6. Strip gamification columns from student_profiles
--    (selected_pet_id must go before pets; friend_code default
--    depends on generate_friend_code)
-- ------------------------------------------------------------
ALTER TABLE public.student_profiles
  DROP COLUMN coins,
  DROP COLUMN food,
  DROP COLUMN xp,
  DROP COLUMN selected_pet_id,
  DROP COLUMN featured_badges,
  DROP COLUMN current_streak,
  DROP COLUMN max_streak,
  DROP COLUMN friend_code,
  DROP COLUMN subscription_tier;
DROP FUNCTION public.generate_friend_code();

DROP TABLE public.pets;

-- practice_sessions reward columns are gamification artifacts; the
-- rewritten complete_practice_session no longer writes them.
ALTER TABLE public.practice_sessions
  DROP COLUMN xp_earned,
  DROP COLUMN coins_earned;

-- ------------------------------------------------------------
-- 7. Drop now-unused enum types
-- ------------------------------------------------------------
DROP TYPE public.pet_rarity;
DROP TYPE public.mood_type;
DROP TYPE public.invitation_direction;
DROP TYPE public.invitation_status;
DROP TYPE public.badge_trigger_type;
DROP TYPE public.badge_tier;
DROP TYPE public.subscription_tier;

-- ------------------------------------------------------------
-- 8. Badges storage policies. The bucket itself cannot be dropped
--    from SQL (Supabase blocks direct DML on storage tables:
--    "Use the Storage API instead"), so the badges bucket is
--    emptied/deleted via the Storage API per environment:
--      supabase storage rm -r --experimental ss:///badges
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Public can read badge icons" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload badge icons" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update badge icons" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete badge icons" ON storage.objects;

-- ------------------------------------------------------------
-- 9. Data hygiene: the friend-system launch announcement
--    advertises a deleted feature
-- ------------------------------------------------------------
DELETE FROM public.announcements WHERE title = 'New: Friend System!';
