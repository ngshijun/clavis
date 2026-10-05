-- ============================================================
-- Clavis revamp — P22a: the `curriculum-images` bucket
--
-- Subject and topic covers live in `curriculum-images`. Its storage policies
-- (public read, admin write) have been in the migrations since the first
-- schema dump, but the bucket itself was made by hand in the dashboard, so a
-- database built from the migrations alone had the policies and nowhere to
-- put an image. This creates the bucket where it is missing and gives it the
-- same limits as the other image buckets.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('curriculum-images', 'curriculum-images', true)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
WHERE id = 'curriculum-images';
