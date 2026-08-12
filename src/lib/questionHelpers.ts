import type { Database } from '@/types/database.types'
import type { SubTopicHierarchy } from '@/types/supabase-helpers'
import type {
  QuestionOption,
  PracticeAnswer,
  SessionQuestion,
  PracticeSessionFull,
} from '@/types/session'

type QuestionRow = Database['public']['Tables']['questions']['Row']
type AnswerRow = Database['public']['Tables']['practice_answers']['Row']

/** Compute a score as a rounded percentage (0-100). Returns 0 when total is 0. */
export function computeScorePercent(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0
}

/** Extract options from question row columns into a typed array */
export function extractOptionsFromQuestion(q: QuestionRow): QuestionOption[] {
  const options: QuestionOption[] = []
  if (q.option_1_text !== null || q.option_1_image_path !== null) {
    options.push({
      id: 'a',
      text: q.option_1_text,
      imagePath: q.option_1_image_path,
      isCorrect: q.option_1_is_correct ?? false,
    })
  }
  if (q.option_2_text !== null || q.option_2_image_path !== null) {
    options.push({
      id: 'b',
      text: q.option_2_text,
      imagePath: q.option_2_image_path,
      isCorrect: q.option_2_is_correct ?? false,
    })
  }
  if (q.option_3_text !== null || q.option_3_image_path !== null) {
    options.push({
      id: 'c',
      text: q.option_3_text,
      imagePath: q.option_3_image_path,
      isCorrect: q.option_3_is_correct ?? false,
    })
  }
  if (q.option_4_text !== null || q.option_4_image_path !== null) {
    options.push({
      id: 'd',
      text: q.option_4_text,
      imagePath: q.option_4_image_path,
      isCorrect: q.option_4_is_correct ?? false,
    })
  }
  return options
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

/**
 * Derive an answer's correctness from the bank question row (staff surfaces
 * only — staff can read the answer key). Mirrors grade_practice_answer:
 * MCQ/MRQ selected-set equality with the correct-option set, short answer
 * trimmed-lowercase equality. Unknown question (deleted) counts as incorrect.
 */
export function deriveAnswerCorrectness(
  answer: PracticeAnswerRow,
  question: QuestionRow | undefined,
): boolean {
  if (!question) return false

  if (question.type === 'short_answer') {
    if (!answer.text_answer || !question.answer) return false
    return answer.text_answer.trim().toLowerCase() === question.answer.trim().toLowerCase()
  }

  const correct = new Set<number>()
  if (question.option_1_is_correct) correct.add(1)
  if (question.option_2_is_correct) correct.add(2)
  if (question.option_3_is_correct) correct.add(3)
  if (question.option_4_is_correct) correct.add(4)

  const selected = new Set(answer.selected_options ?? [])
  return selected.size === correct.size && [...selected].every((n) => correct.has(n))
}

/** Build SessionQuestion[] from answer rows and a questions map, with placeholders for deleted questions */
export function buildQuestionsFromAnswers(
  answersData: { question_id: string | null }[],
  questionsMap: Map<string, QuestionRow>,
): SessionQuestion[] {
  return answersData.map((answer, index) => {
    if (answer.question_id && questionsMap.has(answer.question_id)) {
      const q = questionsMap.get(answer.question_id)!
      return {
        id: q.id,
        type: q.type as 'mcq' | 'mrq' | 'short_answer',
        question: q.question,
        answer: q.answer,
        imagePath: q.image_path,
        options: q.type === 'mcq' || q.type === 'mrq' ? extractOptionsFromQuestion(q) : undefined,
      }
    }
    // Deleted question placeholder
    return {
      id: answer.question_id ?? `deleted-${index}`,
      type: 'mcq' as const,
      question: '[Question has been deleted]',
      answer: null,
      imagePath: null,
      isDeleted: true,
    }
  })
}

/** Assemble a PracticeSessionFull from its component parts */
export function assembleSessionFull(
  sessionData: {
    id: string
    created_at: string | null
    completed_at: string | null
    total_questions: number | null
    ai_summary: string | null
  },
  subTopic: SubTopicHierarchy | null | undefined,
  questions: SessionQuestion[],
  answers: PracticeAnswer[],
  correctAnswers: number,
  durationSeconds: number,
): PracticeSessionFull {
  const totalQuestions = sessionData.total_questions ?? answers.length
  return {
    id: sessionData.id,
    gradeLevelId: subTopic?.topics?.subjects?.grade_levels?.id ?? '',
    gradeLevelName: subTopic?.topics?.subjects?.grade_levels?.name ?? 'Unknown',
    subjectId: subTopic?.topics?.subjects?.id ?? '',
    subjectName: subTopic?.topics?.subjects?.name ?? 'Unknown',
    topicId: subTopic?.topics?.id ?? '',
    topicName: subTopic?.topics?.name ?? 'Unknown',
    subTopicId: subTopic?.id ?? '',
    subTopicName: subTopic?.name ?? 'Unknown',
    score: computeScorePercent(correctAnswers, totalQuestions),
    totalQuestions,
    correctAnswers,
    durationSeconds,
    createdAt: sessionData.created_at ?? '',
    startedAt: sessionData.created_at ?? '',
    completedAt: sessionData.completed_at!,
    status: 'completed',
    questions,
    answers,
    aiSummary: sessionData.ai_summary ?? null,
  }
}
