import type { Database } from '@/types/database.types'
import type { PracticeAnswer } from '@/types/session'

type AnswerRow = Database['public']['Tables']['practice_answers']['Row']

/** Compute a score as a rounded percentage (0-100). Returns 0 when total is 0. */
export function computeScorePercent(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0
}

/**
 * The practice_answers columns SELECTable by `authenticated` — `is_correct` is
 * column-revoked (P5a, decision 41), so a `select('*')` errors with 42501.
 * Every client read of practice_answers must name exactly these columns.
 */
export const PRACTICE_ANSWER_COLUMNS =
  'id, session_id, question_id, selected_options, text_answer, time_spent_seconds, answered_at'

/** An answer row as returned by a PRACTICE_ANSWER_COLUMNS select (no is_correct). */
export type PracticeAnswerRow = Pick<
  AnswerRow,
  'question_id' | 'selected_options' | 'text_answer' | 'time_spent_seconds' | 'answered_at'
>

/**
 * Map a raw DB answer row to a typed PracticeAnswer. Correctness is no longer
 * readable from the row; the caller supplies it (staff views derive it from
 * the bank question, students get it only from get_session_result).
 */
export function mapAnswerRow(a: PracticeAnswerRow, isCorrect: boolean): PracticeAnswer {
  return {
    questionId: a.question_id,
    selectedOptions: a.selected_options,
    textAnswer: a.text_answer,
    isCorrect,
    answeredAt: a.answered_at ?? new Date().toISOString(),
    timeSpentSeconds: a.time_spent_seconds,
  }
}
