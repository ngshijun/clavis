-- ============================================================
-- Clavis revamp — P27a: what nothing uses is removed.
--
-- Left over from the product Clavis was before it was sold to tuition
-- centers, and from screens that were never rebuilt. No page, function,
-- trigger or policy reads any of it.
--
--   D1  get_org_overview and get_platform_totals: the figures of an admin
--       dashboard that does not exist.
--   D2  payment_history: a parent's Stripe payments. Nobody pays by card.
--   D3  schools, with student_profiles.school_id: the school a student named
--       when signing up alone. An organization creates its students now.
--   D4  student_profiles.preferred_language (the language is kept in the
--       browser), profiles.date_of_birth and questions.image_hash.
--   D5  The buckets `badges` and `assessment-images`, when they are empty.
--       One that still holds files is left: empty it through the Storage
--       API, then delete it from the dashboard.
-- ============================================================

DROP FUNCTION public.get_org_overview();
DROP FUNCTION public.get_platform_totals();

DROP TABLE public.payment_history;

ALTER TABLE public.student_profiles
  DROP COLUMN school_id,
  DROP COLUMN preferred_language;

DROP TABLE public.schools;

ALTER TABLE public.profiles DROP COLUMN date_of_birth;

ALTER TABLE public.questions DROP COLUMN image_hash;

-- storage.buckets refuses a DELETE from SQL unless this is set: the guard is
-- there so that no bucket goes while it holds files, and none does here.
SELECT set_config('storage.allow_delete_query', 'true', false);

DELETE FROM storage.buckets b
WHERE b.id IN ('badges', 'assessment-images')
  AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = b.id);

SELECT set_config('storage.allow_delete_query', 'false', false);
