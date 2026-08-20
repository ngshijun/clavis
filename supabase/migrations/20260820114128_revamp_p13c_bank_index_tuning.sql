-- ============================================================
-- Clavis revamp — P13c: index tuning on the assessment bank
--
-- Satisfies the two Supabase advisor rules P13a would trip:
--
--   unindexed_foreign_keys — `subject_id` is only the SECOND column of
--     (grade_level_id, subject_id) so it does not cover its own FK, and
--     `created_by` had no index at all. Both constraints are ON DELETE
--     RESTRICT, so every delete of a subject or a profile scans this table
--     without them.
--
--   Dropped in the same pass: the standalone `difficulty` index. Three
--     distinct values over a growing table is below any useful selectivity,
--     the planner will never choose it, and the page always filters
--     difficulty alongside grade+subject (which the composite already
--     serves) — so it was pure write overhead.
-- ============================================================

DROP INDEX IF EXISTS public.idx_assessment_bank_questions_difficulty;

CREATE INDEX idx_assessment_bank_questions_subject
  ON public.assessment_bank_questions USING btree (subject_id);

CREATE INDEX idx_assessment_bank_questions_created_by
  ON public.assessment_bank_questions USING btree (created_by);
