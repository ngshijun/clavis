import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useCurriculumStore } from './curriculum'
import { handleError } from '@/lib/errors'
import { computeScorePercent } from '@/lib/questionHelpers'

/** Identity of the student, and proof they belong to the classroom in the URL. */
export interface ClassroomStudent {
  id: string
  name: string
  username: string | null
}

/** One completed practice session, shaped for `createPracticeHistoryColumns`. */
export interface StudentPracticeRow {
  id: string
  completedAt: string | null
  gradeLevelName: string
  subjectName: string
  topicName: string
  subTopicName: string
  score: number | null
  totalQuestions: number
  correctAnswers: number
  durationSeconds: number | null
}

export interface StudentAttemptRow {
  id: string
  assessmentId: string
  title: string
  startedAt: string
  completedAt: string | null
  correctCount: number
  totalQuestions: number
  scorePercent: number
  /** > 0 means the score is a floor — long answers still await marking (P9b). */
  pendingManualCount: number
}

/**
 * One student's record INSIDE one classroom, for staff inspecting that class
 * (decision 87).
 *
 * Both halves are bounded by the CLASSROOM, not merely by the student:
 * practice by the classroom's grade and subject — the same pair the student's
 * own statistics page bounds itself by (decision 79) — and attempts by the
 * assessments that belong to the classroom (decision 81). A student enrolled
 * in two classes must not have one class's work surface under the other.
 *
 * Authorization is the DB's: RLS already lets same-org staff read practice
 * sessions and attempts. The membership row read here answers a UI question —
 * "is this student actually in this class?" — and is not the boundary.
 *
 * A store rather than page state because the breadcrumb names the student, and
 * the trail is built outside the page. Cleared on every load and on sign-out,
 * so one student's record never outlives the screen that asked for it.
 */
export const useClassroomStudentStore = defineStore('classroom-student', () => {
  const curriculumStore = useCurriculumStore()

  const student = ref<ClassroomStudent | null>(null)
  const practiceSessions = ref<StudentPracticeRow[]>([])
  const attempts = ref<StudentAttemptRow[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  /** False until the first load settles, so the page can tell "absent" from "pending". */
  const isReady = ref(false)

  async function fetchMembership(classroomId: string, studentId: string) {
    const { data, error: fetchError } = await supabase
      .from('classroom_students')
      .select(
        'student_id, student_profiles!inner (username, profiles!student_profiles_id_fkey (name))',
      )
      .eq('classroom_id', classroomId)
      .eq('student_id', studentId)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!data) return null

    return {
      id: data.student_id,
      name: data.student_profiles.profiles?.name ?? '',
      username: data.student_profiles.username,
    }
  }

  /**
   * Grade AND subject, which is the same pair the student's own statistics
   * page bounds itself by. Subject alone would merge two classrooms that share
   * one — "Maths G4" and "Maths G5" — into both of their views.
   */
  async function fetchPractice(studentId: string, gradeLevelId: string, subjectId: string) {
    const { data, error: fetchError } = await supabase
      .from('practice_sessions')
      .select('id, sub_topic_id, total_questions, correct_count, total_time_seconds, completed_at')
      .eq('student_id', studentId)
      .eq('grade_level_id', gradeLevelId)
      .eq('subject_id', subjectId)
      .order('completed_at', { ascending: false })

    if (fetchError) throw fetchError

    return (data ?? []).map((row): StudentPracticeRow => {
      const hierarchy = curriculumStore.getSubTopicWithHierarchy(row.sub_topic_id)
      const correctAnswers = row.correct_count ?? 0
      return {
        id: row.id,
        completedAt: row.completed_at,
        gradeLevelName: hierarchy?.gradeLevel.name ?? '',
        subjectName: hierarchy?.subject.name ?? '',
        topicName: hierarchy?.topic.name ?? '',
        subTopicName: hierarchy?.subTopic.name ?? '',
        score: computeScorePercent(correctAnswers, row.total_questions),
        totalQuestions: row.total_questions,
        correctAnswers,
        durationSeconds: row.total_time_seconds,
      }
    })
  }

  async function fetchAttempts(studentId: string, classroomId: string) {
    // `!inner` so filtering on the embedded assessment DROPS non-matching rows
    // rather than returning them with a null embed.
    const { data, error: fetchError } = await supabase
      .from('assessment_attempts')
      .select(
        `
        id,
        assessment_id,
        started_at,
        completed_at,
        correct_count,
        total_questions,
        score_percent,
        pending_manual_count,
        assessments!inner (title, classroom_id)
      `,
      )
      .eq('student_id', studentId)
      .eq('assessments.classroom_id', classroomId)
      .order('started_at', { ascending: false })

    if (fetchError) throw fetchError

    return (data ?? []).map((row): StudentAttemptRow => {
      return {
        id: row.id,
        assessmentId: row.assessment_id,
        title: row.assessments.title,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        correctCount: row.correct_count,
        totalQuestions: row.total_questions,
        scorePercent: row.score_percent,
        pendingManualCount: row.pending_manual_count,
      }
    })
  }

  async function load(input: {
    classroomId: string
    studentId: string
    gradeLevelId: string
    subjectId: string
  }): Promise<{ error: string | null }> {
    isLoading.value = true
    error.value = null
    student.value = null
    practiceSessions.value = []
    attempts.value = []

    try {
      // Practice rows are named from the curriculum tree, so it has to be in
      // hand before they are mapped.
      if (curriculumStore.gradeLevels.length === 0) {
        await curriculumStore.fetchCurriculum()
      }

      const member = await fetchMembership(input.classroomId, input.studentId)
      if (!member) return { error: null }

      const [practice, attemptRows] = await Promise.all([
        fetchPractice(input.studentId, input.gradeLevelId, input.subjectId),
        fetchAttempts(input.studentId, input.classroomId),
      ])

      student.value = member
      practiceSessions.value = practice
      attempts.value = attemptRows

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchSessionHistory')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
      isReady.value = true
    }
  }

  function $reset() {
    student.value = null
    practiceSessions.value = []
    attempts.value = []
    isLoading.value = false
    error.value = null
    isReady.value = false
  }

  return { student, practiceSessions, attempts, isLoading, isReady, error, load, $reset }
})
