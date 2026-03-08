/**
 * Shared types for practice session data used across
 * admin-student-stats, child-statistics, and related components.
 */

export interface QuestionOption {
  id: string // 'a', 'b', 'c', 'd'
  text: string | null
  imagePath: string | null
  isCorrect: boolean
}

export interface PracticeAnswer {
  questionId: string | null
  selectedOptions: number[] | null
  textAnswer: string | null
  isCorrect: boolean
  answeredAt: string
  timeSpentSeconds: number | null
}

export interface SessionQuestion {
  id: string
  type: 'mcq' | 'mrq' | 'short_answer'
  question: string
  explanation: string | null
  answer: string | null
  imagePath: string | null
  options?: QuestionOption[]
  isDeleted?: boolean
}

export interface PracticeSessionSummary {
  id: string
  gradeLevelName: string
  subjectName: string
  topicName: string
  subTopicName: string
  score: number | null
  totalQuestions: number
  correctAnswers: number
  durationSeconds: number | null
  createdAt: string
  completedAt: string | null
  status: 'completed' | 'in_progress'
}

export interface PracticeSessionFull extends Omit<
  PracticeSessionSummary,
  'score' | 'durationSeconds' | 'completedAt'
> {
  subjectId: string
  subTopicId: string
  topicId: string
  gradeLevelId: string
  questions: SessionQuestion[]
  answers: PracticeAnswer[]
  startedAt: string
  aiSummary: string | null
  score: number
  durationSeconds: number
  completedAt: string
}
