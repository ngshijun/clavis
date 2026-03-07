-- Grant UPDATE on preferred_language to authenticated role
-- (New columns don't inherit table-level UPDATE grants)
GRANT UPDATE (preferred_language) ON student_profiles TO authenticated;
