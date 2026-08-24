-- ============================================================
-- Clavis 2.0 revamp — P15b: drop the AI session summary and
-- the guided product tour.
--
-- Both features are removed from the product; their only DB
-- footprint is one column each.
--
-- The `generate-session-summary` Edge Function is deleted in
-- the same PR and must be un-deployed by hand — functions are
-- not managed by migrations.
--
-- DESTRUCTIVE: drops columns with data on staging (and on prod
-- when the PR merges). Called out in the PR body.
-- ============================================================

-- ------------------------------------------------------------
-- 1. AI session summary
-- ------------------------------------------------------------
ALTER TABLE public.practice_sessions DROP COLUMN ai_summary;

-- ------------------------------------------------------------
-- 2. Guided tour
--
-- The column-level UPDATE grant naming has_completed_tour
-- (added in 20260405071125) drops with the column.
-- ------------------------------------------------------------
ALTER TABLE public.profiles DROP COLUMN has_completed_tour;
