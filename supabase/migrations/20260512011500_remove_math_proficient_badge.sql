-- ============================================================================
-- Remove the math_proficient badge
--
-- The slug ("math") never matched its behavior (subject_id="any" — fires on
-- 70% accuracy in *any* subject), so it was a misleading achievement. Dropped
-- entirely. CASCADE on student_badges.badge_id cleans up any awarded rows.
--
-- The subject_accuracy_threshold trigger type and its function arm stay in
-- place (harmless, no rows reference it now) in case a per-subject badge
-- family is added later.
-- ============================================================================

delete from public.badges where slug = 'math_proficient';
