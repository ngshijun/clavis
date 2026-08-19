-- ============================================================
-- Clavis — P12c: grant INSERT on assessments.classroom_id
--
-- P9b replaced the table-level INSERT/UPDATE grants on `assessments` with
-- explicit COLUMN LISTS, so that the two answer-release columns stay
-- unwritable. Column grants do not extend to columns added later: P12b's new
-- `classroom_id` landed outside the list, and because a non-template now
-- REQUIRES it, teachers could not create an assessment at all —
-- "permission denied for table assessments" on every insert.
--
-- This is invisible to `supabase gen types` (grants are not part of the
-- schema it emits), so type-check, lint, build and tests were all green over
-- a database where authoring was broken. It was caught by a live insert.
--
-- Kept as its own migration rather than folded into P12b: P12b is already
-- applied, and `db push` skips applied versions — editing it would leave
-- staging broken while the file claimed otherwise.
--
-- INSERT only, deliberately. The owning classroom is fixed at creation:
-- moving an assessment between classrooms would drag its attempts and marks
-- into a classroom whose students never sat it. Re-targeting means cloning.
-- ============================================================

GRANT INSERT (classroom_id) ON TABLE public.assessments TO authenticated;

COMMENT ON COLUMN public.assessments.classroom_id IS
  'The classroom this assessment belongs to (decision 81). NULL for templates, required otherwise. Writable only on INSERT — an assessment cannot change classroom, since its attempts belong to the original one.';
