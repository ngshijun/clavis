import type { PracticeAnswer } from '@/types/session'
import type { Database } from '@/types/database.types'
import { supabase } from '@/lib/supabaseClient'

export type { PracticeAnswer } from '@/types/session'
export type { DateRangeFilter } from '@/lib/sessionFilters'

type QuestionType = Database['public']['Enums']['question_type']

/** One selectable option of a practice question — content only, no key. */
export interface PracticeQuestionOption {
  id: 'a' | 'b' | 'c' | 'd'
  text: string | null
  imagePath: string | null
}

/**
 * A practice question as the student may see it (decision 76): the bank's
 * `answer`, `option_N_is_correct` and `option_N_tip` columns are revoked from
 * `authenticated`, so this shape — served by `get_practice_questions` while an
 * attempt is in progress and by `get_practice_session_questions` once it is
 * stored — carries no correctness whatsoever. Correctness and wrong-option
 * tips reach the student only after submission, via `get_session_result`.
 */
export interface PracticeQuestion {
  id: string
  type: QuestionType
  question: string
  imagePath: string | null
  subTopicId: string
  gradeLevelId: string | null
  subjectId: string | null
  options: PracticeQuestionOption[]
}

const OPTION_IDS = ['a', 'b', 'c', 'd'] as const

/** Raw entry of the sanitized practice-question jsonb array (P11A §2). */
interface RawSessionQuestion {
  question_id: string
  question_order: number
  type: QuestionType
  question: string
  image_path: string | null
  sub_topic_id: string
  subject_id: string | null
  grade_level_id: string | null
  options: { number: number; text: string | null; image_path: string | null }[]
}

/** Both RPCs return the same item shape, so one mapper serves both. */
function parsePracticeQuestions(data: unknown): PracticeQuestion[] {
  if (!Array.isArray(data)) return []

  return (data as unknown as RawSessionQuestion[]).map((entry) => ({
    id: entry.question_id,
    type: entry.type,
    question: entry.question,
    imagePath: entry.image_path ?? null,
    subTopicId: entry.sub_topic_id,
    gradeLevelId: entry.grade_level_id ?? null,
    subjectId: entry.subject_id ?? null,
    options: (entry.options ?? [])
      .map((option) => ({
        id: OPTION_IDS[option.number - 1],
        text: option.text ?? null,
        imagePath: option.image_path ?? null,
      }))
      .filter((option): option is PracticeQuestionOption => option.id !== undefined),
  }))
}

/**
 * Question content for an attempt that has no session row yet (decision 85).
 * The array order given here IS the order the student sees and the order
 * frozen at submit — the RPC preserves it.
 */
export async function fetchPracticeQuestions(
  questionIds: string[],
): Promise<{ questions: PracticeQuestion[]; error: unknown }> {
  const { data, error } = await supabase.rpc('get_practice_questions', {
    p_question_ids: questionIds,
  })

  if (error) return { questions: [], error }
  return { questions: parsePracticeQuestions(data), error: null }
}

/**
 * Fetch the frozen question list of a STORED practice session (owner-only).
 * The RPC returns the entries in stored `question_order`, so the ARRAY
 * POSITION is the running order — the stored value itself is not a reliable
 * index (seeded rows are 1-based while the submit RPC writes 0-based).
 */
export async function fetchPracticeSessionQuestions(
  sessionId: string,
): Promise<{ questions: PracticeQuestion[]; error: unknown }> {
  const { data, error } = await supabase.rpc('get_practice_session_questions', {
    p_session_id: sessionId,
  })

  if (error) return { questions: [], error }
  return { questions: parsePracticeQuestions(data), error: null }
}

export interface PracticeSession {
  id: string
  studentId: string
  gradeLevelId: string | null
  gradeLevelName: string
  subjectId: string | null
  subjectName: string
  subTopicId: string
  topicName: string
  subTopicName: string
  totalQuestions: number
  correctAnswers: number
  answerCount: number // Actual number of answered questions
  durationSeconds: number
  createdAt: string | null
  completedAt: string | null
  // Loaded separately (content only — see PracticeQuestion)
  questions: PracticeQuestion[]
  answers: PracticeAnswer[]
}

/**
 * Fisher-Yates shuffle - O(n) time, uniform distribution
 * Preferred over sort(() => Math.random() - 0.5) which is O(n log n) and biased
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

/**
 * Convert option ID ('a', 'b', 'c', 'd') to number (1, 2, 3, 4) for database storage
 */
export function optionIdToNumber(optionId: string): number {
  const mapping: Record<string, number> = { a: 1, b: 2, c: 3, d: 4 }
  return mapping[optionId] ?? 1
}

/**
 * Convert option number (1, 2, 3, 4) to ID ('a', 'b', 'c', 'd') for UI display
 */
export function optionNumberToId(optionNumber: number): string {
  const mapping: Record<number, string> = { 1: 'a', 2: 'b', 3: 'c', 4: 'd' }
  return mapping[optionNumber] ?? 'a'
}

/**
 * Convert array of option numbers to array of IDs for UI display
 */
export function optionNumbersToIds(optionNumbers: number[] | null): string[] {
  if (!optionNumbers) return []
  return optionNumbers.map((num) => optionNumberToId(num))
}
