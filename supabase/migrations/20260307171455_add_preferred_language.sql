-- Add preferred language to student profiles for AI summary generation
-- Supports 'en' (English) and 'zh' (Chinese Simplified)
ALTER TABLE student_profiles
  ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'en'
  CONSTRAINT preferred_language_check CHECK (preferred_language IN ('en', 'zh'));
