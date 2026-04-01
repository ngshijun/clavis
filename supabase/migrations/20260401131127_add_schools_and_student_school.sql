-- 1. Create schools table
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- 3. Allow all authenticated users to read schools
CREATE POLICY "Authenticated users can read schools"
  ON public.schools
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. Add school_id to student_profiles
ALTER TABLE public.student_profiles
  ADD COLUMN school_id UUID REFERENCES public.schools(id);

-- 5. Update create_user_profile RPC to accept school_id
CREATE OR REPLACE FUNCTION public.create_user_profile(
  p_user_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_user_type TEXT,
  p_date_of_birth DATE DEFAULT NULL,
  p_school_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate user type
  IF p_user_type NOT IN ('student', 'parent') THEN
    RAISE EXCEPTION 'Invalid user type: %. Must be student or parent', p_user_type;
  END IF;

  -- Step 1: Create main profile
  INSERT INTO profiles (id, email, name, user_type, date_of_birth)
  VALUES (p_user_id, p_email, p_name, p_user_type::user_type, p_date_of_birth);

  -- Step 2: Create type-specific profile
  IF p_user_type = 'student' THEN
    INSERT INTO student_profiles (id, school_id)
    VALUES (p_user_id, p_school_id);
  ELSE
    INSERT INTO parent_profiles (id)
    VALUES (p_user_id);
  END IF;
END;
$$;

-- 6. Insert sentinel row for "My school is not listed"
INSERT INTO public.schools (id, name)
VALUES ('00000000-0000-0000-0000-000000000000', 'My school is not listed')
ON CONFLICT (name) DO NOTHING;

-- 7. Grant permissions
GRANT SELECT ON public.schools TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.create_user_profile(UUID, TEXT, TEXT, TEXT, DATE, UUID) TO anon, authenticated, service_role;
