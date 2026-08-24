-- ============================================================
-- Clavis revamp — P14a: classroom cover images
--
-- Decision 85: a manager gives each classroom a background, so the class
-- cards a teacher or student picks from are told apart at a glance rather
-- than by reading two lines of near-identical text. This matters most for
-- the exact case that motivated route-scoping: "Year 1 Math (Group A)" and
-- "Year 1 Math (Group B)" differ by one character.
--
-- Column, not a join table: a classroom has at most one cover, and
-- `subjects.cover_image_path` already establishes the name and the shape.
-- `classrooms` carries TABLE-level grants (P6a), so the new column needs no
-- grant of its own — unlike assessments, whose column-list INSERT grant made
-- P12c necessary.
-- ============================================================

ALTER TABLE public.classrooms
  ADD COLUMN cover_image_path text;

COMMENT ON COLUMN public.classrooms.cover_image_path IS
  'Storage object path in the `classroom-images` bucket ({classroom_id}/{uuid}.webp). NULL = no cover; the UI falls back to a generated tint.';

-- ------------------------------------------------------------
-- Storage: a dedicated `classroom-images` bucket.
--
-- Not folded into `curriculum-images`: that bucket is admin-owned, global
-- curriculum artwork, while a classroom cover is org data written by a
-- manager. Sharing the bucket would mean one policy trying to express two
-- unrelated authorization models.
--
-- PUBLIC read, like every other image bucket in this project, so
-- src/lib/storage.ts's getPublicUrl helpers work unchanged and a student
-- renders the cover without a signed URL.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('classroom-images', 'classroom-images', true)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
WHERE id = 'classroom-images';

-- Object name -> classroom id -> may the caller write that classroom?
-- The CASE guard keeps a non-uuid folder from ever reaching the cast (a raise
-- inside an RLS policy would surface as an error instead of a denial).
CREATE OR REPLACE FUNCTION app.can_write_classroom_image(p_object_name text)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_object_name))[1]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN EXISTS (
        SELECT 1
        FROM public.classrooms c
        WHERE c.id = ((storage.foldername(p_object_name))[1])::uuid
          AND app.is_manager()
          AND c.organization_id = app.current_org_id()
      )
    ELSE false
  END;
$$;

ALTER FUNCTION app.can_write_classroom_image(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.can_write_classroom_image(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_write_classroom_image(text) FROM anon;
GRANT EXECUTE ON FUNCTION app.can_write_classroom_image(text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.can_write_classroom_image(text) TO service_role;

COMMENT ON FUNCTION app.can_write_classroom_image(text) IS
  'Storage RLS helper: may the caller write classroom-images/<classroom_id>/... ? Mirrors the classrooms write policy (manager of that classroom''s org). False for any object whose first folder segment is not a uuid.';

DROP POLICY IF EXISTS "Classroom images are publicly accessible" ON storage.objects;
CREATE POLICY "Classroom images are publicly accessible"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'classroom-images');

DROP POLICY IF EXISTS "Managers can upload classroom images" ON storage.objects;
CREATE POLICY "Managers can upload classroom images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'classroom-images'
    AND app.can_write_classroom_image(name)
  );

DROP POLICY IF EXISTS "Managers can update classroom images" ON storage.objects;
CREATE POLICY "Managers can update classroom images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'classroom-images'
    AND app.can_write_classroom_image(name)
  )
  WITH CHECK (
    bucket_id = 'classroom-images'
    AND app.can_write_classroom_image(name)
  );

DROP POLICY IF EXISTS "Managers can delete classroom images" ON storage.objects;
CREATE POLICY "Managers can delete classroom images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'classroom-images'
    AND app.can_write_classroom_image(name)
  );
