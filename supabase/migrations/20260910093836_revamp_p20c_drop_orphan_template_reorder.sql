-- ============================================================
-- Clavis revamp — P20c: drop the orphaned template reorder RPC
--
-- P20b dropped `assessment_template_questions`, but a plpgsql body is not a
-- dependency, so `reorder_template_questions` survived the table it acts on.
-- `reorder_paper_items` replaces it.
-- ============================================================

DROP FUNCTION public.reorder_template_questions(uuid, uuid[]);
