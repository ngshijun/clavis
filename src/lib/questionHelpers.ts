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

/** Map a single raw DB answer row to typed PracticeAnswer */
export function mapAnswerRow(a: AnswerRow): PracticeAnswer {
  return {
    questionId: a.question_id,
    selectedOptions: a.selected_options,
    textAnswer: a.text_answer,
    isCorrect: a.is_correct ?? false,
    answeredAt: a.answered_at ?? new Date().toISOString(),
    timeSpentSeconds: a.time_spent_seconds,
  }
}

/** Map raw DB answer rows to typed PracticeAnswer[] */
export function mapAnswerRows(rows: AnswerRow[]): PracticeAnswer[] {
  return rows.map(mapAnswerRow)
}

/** Build SessionQuestion[] from answer rows and a questions map, with placeholders for deleted questions */
export function buildQuestionsFromAnswers(
  answersData: Database['public']['Tables']['practice_answers']['Row'][],
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
