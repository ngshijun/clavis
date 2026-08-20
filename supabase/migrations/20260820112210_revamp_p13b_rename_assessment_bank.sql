-- ============================================================
-- Clavis revamp — P13b: name the admin bank for what it is
--
-- P13a created `bank_questions`, which collides with the meaning "bank"
-- already carries everywhere else in this codebase: `get_bank_questions()`
-- and `get_bank_question()` (P11a) return PRACTICE questions, and the
-- builder's BankQuestionPickerDialog picks from that practice bank.
--
-- Leaving both would mean `bank_questions` (assessment items) sitting beside
-- `get_bank_questions()` (practice items) in the same schema. Renamed to
-- `assessment_bank_questions`, which reads correctly next to the existing
-- `assessment_questions` and `questions`.
--
-- Empty-table rename: P13a shipped in the same batch and nothing references
-- these objects yet, so there is no data or dependency to carry.
-- ============================================================

ALTER TABLE public.bank_questions RENAME TO assessment_bank_questions;
ALTER TABLE public.bank_question_tags RENAME TO assessment_bank_question_tags;

ALTER TABLE public.assessment_bank_question_tags
  RENAME COLUMN bank_question_id TO assessment_bank_question_id;

-- Indexes, trigger and constraint names follow the table.
ALTER INDEX public.idx_bank_questions_grade_subject
  RENAME TO idx_assessment_bank_questions_grade_subject;
ALTER INDEX public.idx_bank_questions_difficulty
  RENAME TO idx_assessment_bank_questions_difficulty;
ALTER INDEX public.idx_bank_question_tags_tag
  RENAME TO idx_assessment_bank_question_tags_tag;

ALTER TRIGGER update_bank_questions_updated_at
  ON public.assessment_bank_questions
  RENAME TO update_assessment_bank_questions_updated_at;
ALTER TRIGGER enforce_bank_question_curriculum
  ON public.assessment_bank_questions
  RENAME TO enforce_assessment_bank_question_curriculum;

ALTER FUNCTION public.enforce_bank_question_curriculum()
  RENAME TO enforce_assessment_bank_question_curriculum;

ALTER POLICY "Admins manage bank questions"
  ON public.assessment_bank_questions
  RENAME TO "Admins manage assessment bank questions";
ALTER POLICY "Admins manage bank question tags"
  ON public.assessment_bank_question_tags
  RENAME TO "Admins manage assessment bank question tags";

COMMENT ON TABLE public.assessment_bank_questions IS
  'Admin-authored assessment question bank (decision 81). Distinct from the practice `questions` bank reached by get_bank_questions(): filed by grade+subject, no option tips, all nine ad-hoc types. Picked into a template BY COPY of payload+points.';

COMMENT ON TABLE public.assessment_bank_question_tags IS
  'Learning-point tags on an assessment bank question (many-to-many), sharing the same admin-managed `tags` vocabulary as question_tags.';

COMMENT ON FUNCTION public.enforce_assessment_bank_question_curriculum() IS
  'Rejects an assessment bank question whose subject is not a child of its grade level. Role independent: a BEFORE trigger also covers the admin FOR ALL and service_role paths.';
