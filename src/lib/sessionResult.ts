export interface SessionAnswer {
  questionId: string | null
  selectedOptions: number[] | null
  textAnswer: string | null
  isCorrect: boolean
  timeSpentSeconds: number | null
}

const OPTION_NUMBER_TO_ID: Record<number, string> = { 1: 'a', 2: 'b', 3: 'c', 4: 'd' }

export function getSelectedOptionIds(answer: SessionAnswer | undefined): string[] {
  if (!answer?.selectedOptions) return []
  return answer.selectedOptions.map((n) => OPTION_NUMBER_TO_ID[n] ?? 'a')
}

export function wasOptionSelected(answer: SessionAnswer | undefined, optionId: string): boolean {
  return getSelectedOptionIds(answer).includes(optionId)
}

export function isQuestionDeleted(question: unknown): boolean {
  return (question as { isDeleted?: boolean })?.isDeleted === true
}

export function isOptionFilled(opt: { text?: string | null; imagePath?: string | null }): boolean {
  return !!(opt.text && opt.text.trim()) || !!opt.imagePath
}

/** Aggregate result of a completed practice session. */
export interface SessionSummary {
  totalQuestions: number
  correctAnswers: number
  incorrectAnswers: number
  /** Score as a whole-number percentage (0–100). */
  score: number
  durationSeconds: number
}

/**
 * Minimal structural shape needed to summarise a session. Compatible with
 * `PracticeSession` (questions/answers loaded) and stored-field fallbacks.
 */
export interface SummarizableSession {
  questions?: { isCorrect?: boolean }[] | null
  answers?: { isCorrect: boolean }[] | null
  totalQuestions?: number | null
  correctAnswers?: number | null
  durationSeconds?: number | null
}

/**
 * Build a session summary using ONE consistent strategy: recompute from the
 * loaded `answers` array, and fall back to stored fields only when answers are
 * absent. Total questions prefers the loaded `questions` length, then the
 * stored `totalQuestions`, then the answer count.
 */
export function buildSessionSummary(session: SummarizableSession): SessionSummary {
  const answers = session.answers ?? null
  const totalQuestions = session.questions?.length || session.totalQuestions || answers?.length || 0

  const correctAnswers = answers
    ? answers.filter((a) => a.isCorrect).length
    : (session.correctAnswers ?? 0)

  const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0

  return {
    totalQuestions,
    correctAnswers,
    incorrectAnswers: totalQuestions - correctAnswers,
    score,
    durationSeconds: session.durationSeconds ?? 0,
  }
}
