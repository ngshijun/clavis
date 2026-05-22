-- ============================================================================
-- Switch badge icon_path values from .png → .webp
--
-- Badge icons are now stored as WebP in the `badges` bucket (smaller files,
-- near-lossless quality). The seed catalogs have been updated to match;
-- this migration brings existing rows in line.
-- ============================================================================

update public.badges
  set icon_path = regexp_replace(icon_path, '\.png$', '.webp')
  where icon_path like '%.png';
