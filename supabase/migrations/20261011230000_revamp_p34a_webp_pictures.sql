-- ============================================================
-- Clavis revamp — P34a: every picture is stored as a WebP.
--
-- The page makes a WebP of whatever picture a person picks before it
-- uploads it, and the server refuses a file that is anything else. A
-- WebP is a fraction of the size of the PNG or the photograph it was
-- made from, so a page that shows it loads sooner and the buckets hold
-- less.
--
--   D1  The buckets take nothing but a WebP either, so the rule holds
--       for an upload that does not come through the app.
--   D2  A picture stored before this stays as it is.
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/webp']
WHERE id IN ('question-images', 'curriculum-images', 'classroom-images');
