/**
 * Shared types for practice session data used across
 * practice-history and related components.
 */

export interface PracticeAnswer {
  questionId: string | null
  selectedOptions: number[] | null
  textAnswer: string | null
  /**
   * practice_answers.is_correct is column-revoked for students (P5a) — this is
   * only meaningful on staff surfaces, where it is derived from the bank
   * question. Mid-session it is always false and unread; students get
   * correctness from get_session_result after completion.
   */
  isCorrect: boolean
  answeredAt: string
  timeSpentSeconds: number | null
}
