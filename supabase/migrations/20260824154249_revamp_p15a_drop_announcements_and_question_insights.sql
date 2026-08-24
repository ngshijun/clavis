-- ============================================================
-- Clavis 2.0 revamp — P15a: drop announcements, question
-- feedback and question statistics.
--
-- All three features are removed from the product, so their
-- tables, enums, RPCs and the statistics materialized view go
-- with them rather than lingering as unreachable surface.
--
-- get_bank_question(uuid) is dropped alongside: the feedback
-- page's per-question preview was its only caller, and a
-- SECURITY DEFINER function that returns answer keys should not
-- outlive the screen that needed it.
--
-- DESTRUCTIVE: drops tables with data on staging (and on prod
-- when the PR merges). Called out in the PR body.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Question statistics
--
-- get_question_statistics() reads the materialized view and
-- refresh_question_statistics() rebuilds it; both die with it.
-- idx_question_statistics_id is owned by the view and drops
-- along with it.
-- ------------------------------------------------------------
DROP FUNCTION public.get_question_statistics();
DROP FUNCTION public.refresh_question_statistics();
DROP MATERIALIZED VIEW public.question_statistics;

-- ------------------------------------------------------------
-- 2. Question feedback
--
-- Policies drop with the table; feedback_category has no other
-- referent once the `category` column is gone.
-- ------------------------------------------------------------
DROP TABLE public.question_feedback;
DROP TYPE public.feedback_category;

-- ------------------------------------------------------------
-- 3. Announcements
--
-- announcement_reads FKs announcements, so it goes first.
-- ------------------------------------------------------------
DROP FUNCTION public.get_unread_announcement_count();
DROP TABLE public.announcement_reads;
DROP TABLE public.announcements;
DROP TYPE public.announcement_audience;

-- ------------------------------------------------------------
-- 4. announcement-images storage policies
--
-- The bucket itself is deleted by hand from the dashboard once
-- its objects are cleared (same as the badges / pet-images
-- buckets in P1a) — storage.buckets has no delete path from a
-- migration while objects remain.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Announcement images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload announcement images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update announcement images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete announcement images" ON storage.objects;

-- ------------------------------------------------------------
-- 5. Dead admin read path
-- ------------------------------------------------------------
DROP FUNCTION public.get_bank_question(uuid);

COMMENT ON TABLE public.questions IS
  'Global question bank. `authenticated` may SELECT content columns only; answer, option_N_is_correct and option_N_tip are column-revoked. Students read session content through get_practice_session_questions(); admins read keys through get_bank_questions().';
