-- ============================================================
-- Sub-topic progress: count DISTINCT *answered* questions (HIGH / correctness)
--
-- fetchSubTopicProgress (src/stores/practice.ts) previously derived per-sub-topic
-- progress from student_question_progress. Those rows are inserted at SESSION
-- CREATION (when questions are assigned to a session), NOT when a question is
-- actually answered, so a sub-topic showed progress -- often "completed" -- before
-- the student answered anything. The old PostgREST aggregate also counted ROWS, so
-- re-practicing across cycles could push the count above the sub-topic's question
-- count.
--
-- This RPC counts DISTINCT question_id from practice_answers (one row per
-- actually-answered question) joined to its session's sub-topic
-- (practice_sessions.topic_id -> sub_topics.id), grouped per sub-topic. The result
-- caps at the number of distinct questions in the sub-topic, so the client's
-- `answered >= questionCount` completion check becomes correct.
--
-- SECURITY DEFINER + auth.uid() filter: the function takes no arguments and only
-- ever aggregates the CALLER's own answers, so it cannot leak another student's
-- data. Running as owner does the grouped COUNT(DISTINCT) in one indexed pass
-- (idx_practice_sessions_student -> idx_practice_answers_session) without the
-- per-row RLS EXISTS overhead, and sidesteps PostgREST's inability to express a
-- grouped DISTINCT count (the JS-aggregate alternative hits the 1000-row cap).
--
-- NOTE: the cycle-based question SELECTION in startSession still reads
-- student_question_progress; only the progress DISPLAY is changed here.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_subtopic_answered_counts()
RETURNS TABLE(topic_id uuid, answered_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ps.topic_id, count(DISTINCT pa.question_id) AS answered_count
  FROM public.practice_answers pa
  JOIN public.practice_sessions ps ON ps.id = pa.session_id
  WHERE ps.student_id = (SELECT auth.uid())
    AND pa.question_id IS NOT NULL
  GROUP BY ps.topic_id;
$$;

ALTER FUNCTION public.get_subtopic_answered_counts() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_subtopic_answered_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_subtopic_answered_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_subtopic_answered_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subtopic_answered_counts() TO service_role;
