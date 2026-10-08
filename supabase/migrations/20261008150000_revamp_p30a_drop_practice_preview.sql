-- ============================================================
-- Clavis revamp — P30a: the builder's "Preview as pupil" is removed.
--
-- The page that played a stage for the admin writing it is gone: the
-- builder shows each question as a pupil gets it beside its form, and that
-- is what is kept. Its two functions (P23c) were that page's alone.
--
-- app.serve_stage and app.mark_stage_answers, which they stood on, stay:
-- a pupil's practice in a classroom is dealt and marked by them.
-- ============================================================

DROP FUNCTION public.preview_stage(uuid);
DROP FUNCTION public.mark_stage_preview(uuid, jsonb);
