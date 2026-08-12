/**
 * Shared session-fetching logic for the statistics stores.
 *
 * Fetches practice sessions with their curriculum hierarchy, resolved through
 * `practice_sessions.sub_topic_id`.
 */

import { supabase } from '@/lib/supabaseClient'
import type { Database } from '@/types/database.types'
import type { SubTopicHierarchy } from '@/types/supabase-helpers'
import type { PracticeSessionSummary, PracticeSessionFull } from '@/types/session'
import {
  computeScorePercent,
  buildQuestionsFromAnswers,
  mapAnswerRow,
  deriveAnswerCorrectness,
  assembleSessionFull,
  PRACTICE_ANSWER_COLUMNS,
} from '@/lib/questionHelpers'

/**
 * Fetch practice sessions with scores for a student.
 *
 * Callers are responsible for auth guards before calling.
 */
export async function fetchSessionSummaries(studentId: string): Promise<PracticeSessionSummary[]> {
  // Fetch all practice sessions with curriculum hierarchy
  const { data: sessionsData, error: fetchError } = await supabase
    .from('practice_sessions')
    .select(
      `
      id,
      student_id,
      sub_topic_id,
      total_questions,
      correct_count,
      total_time_seconds,
      created_at,
      completed_at,
      sub_topics (
        id,
        name,
        topics (
          id,
          name,
          subjects (
            id,
            name,
            grade_levels (
              id,
              name
            )
          )
        )
      )
    `,
    )
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (fetchError) throw fetchError

  // Build session summaries directly from session-level aggregates
  // (correct_count and total_time_seconds are set on completion)
  return (sessionsData ?? []).map((session) => {
    const isCompleted = !!session.completed_at
    const totalQuestions = session.total_questions ?? 0
    const correctAnswers = session.correct_count ?? 0
    const subTopic = session.sub_topics as unknown as SubTopicHierarchy

    return {
      id: session.id,
      gradeLevelName: subTopic?.topics?.subjects?.grade_levels?.name ?? 'Unknown',
      subjectName: subTopic?.topics?.subjects?.name ?? 'Unknown',
      topicName: subTopic?.topics?.name ?? 'Unknown',
      subTopicName: subTopic?.name ?? 'Unknown',
      score: isCompleted ? computeScorePercent(correctAnswers, totalQuestions) : null,
      totalQuestions,
      correctAnswers,
      durationSeconds: isCompleted ? (session.total_time_seconds ?? 0) : null,
      createdAt: session.created_at ?? new Date().toISOString(),
      completedAt: session.completed_at,
      status: (isCompleted ? 'completed' : 'in_progress') as 'completed' | 'in_progress',
    }
  })
}

type QuestionRow = Database['public']['Tables']['questions']['Row']

/**
 * Fetch full session details (session + answers + questions) and assemble
 * into a PracticeSessionFull.
 *
 * Shared by admin-student-stats (admin view) and the student session pages.
 *
 * Callers are responsible for auth guards before calling.
 * Returns null if session is not found.
 */
export async function fetchFullSessionDetails(
  studentId: string,
  sessionId: string,
): Promise<PracticeSessionFull | null> {
  // Fetch session and answers in parallel
  const [sessionResult, answersResult] = await Promise.all([
    supabase
      .from('practice_sessions')
      .select(
        `
        id,
        student_id,
        sub_topic_id,
        total_questions,
        created_at,
        completed_at,
        ai_summary,
        sub_topics (
          id,
          name,
          topics (
            id,
            name,
            subjects (
              id,
              name,
              grade_levels (
                id,
                name
              )
            )
          )
        )
      `,
      )
      .eq('id', sessionId)
      .eq('student_id', studentId)
      .single(),
    supabase
      .from('practice_answers')
      .select(PRACTICE_ANSWER_COLUMNS)
      .eq('session_id', sessionId)
      .order('answered_at', { ascending: true }),
  ])

  if (sessionResult.error) throw sessionResult.error
  if (!sessionResult.data) return null
  if (answersResult.error) throw answersResult.error

  const sessionData = sessionResult.data
  const answersData = answersResult.data

  // Fetch questions by IDs from answers
  const questionIds = (answersData ?? []).map((a) => a.question_id).filter(Boolean) as string[]

  let questionsData: QuestionRow[] = []
  if (questionIds.length > 0) {
    const { data } = await supabase.from('questions').select('*').in('id', questionIds)
    questionsData = data ?? []
  }

  // Build questions map
  const questionsMap = new Map<string, QuestionRow>()
  for (const q of questionsData) {
    questionsMap.set(q.id, q)
  }

  // Build questions and answers from DB rows. is_correct is column-revoked
  // (P5a), so correctness is derived here from the bank rows — this is a
  // staff-only surface where the answer key is readable by design.
  const questions = buildQuestionsFromAnswers(answersData ?? [], questionsMap)
  const answers = (answersData ?? []).map((row) =>
    mapAnswerRow(
      row,
      deriveAnswerCorrectness(row, row.question_id ? questionsMap.get(row.question_id) : undefined),
    ),
  )
  const subTopic = sessionData.sub_topics as unknown as SubTopicHierarchy

  const correctAnswers = answers.filter((a) => a.isCorrect).length
  const durationSeconds = answers.reduce((sum, a) => sum + (a.timeSpentSeconds ?? 0), 0)

  return assembleSessionFull(
    sessionData,
    subTopic,
    questions,
    answers,
    correctAnswers,
    durationSeconds,
  )
}
