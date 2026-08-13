import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'
import type { Database } from '@/types/database.types'

type ClassroomRollupRow = Database['public']['Functions']['get_class_rollups']['Returns'][number]
type StudentRollupRow = Database['public']['Functions']['get_student_rollups']['Returns'][number]

export interface ClassroomRollup {
  classroomId: string
  classroomName: string
  gradeLevelName: string
  subjectName: string
  teacherCount: number
  studentCount: number
  avgMapMastery: number | null
  avgAssessmentScore: number | null
  assignedAttempts: number
  completedAttempts: number
}

export interface StudentRollup {
  studentId: string
  studentName: string
  username: string | null
  mapMastery: number | null
  subTopicsAttempted: number
  subTopicsCompleted: number
  lastPracticeAt: string | null
  assignedCount: number
  completedCount: number
  avgAssessmentScore: number | null
  atRisk: boolean
}

/** Parsed shape of the `get_assessment_completion` jsonb payload (P4A-HANDOFF §C). */
export interface AssessmentCompletion {
  assessmentId: string
  title: string
  status: 'draft' | 'published'
  assignedCount: number
  completedCount: number
  inProgressCount: number
  avgScore: number | null
  /** Score bands aligned to the star thresholds: 0-49, 50-59, 60-79, 80-100. */
  buckets: Record<string, number>
}

interface AssessmentCompletionJson {
  assessment_id: string
  title: string
  status: 'draft' | 'published'
  assigned_count: number
  completed_count: number
  in_progress_count: number
  avg_score: number | null
  buckets: Record<string, number>
}

function mapClassroomRollup(row: ClassroomRollupRow): ClassroomRollup {
  return {
    classroomId: row.classroom_id,
    classroomName: row.classroom_name,
    gradeLevelName: row.grade_level_name,
    subjectName: row.subject_name,
    teacherCount: row.teacher_count,
    studentCount: row.student_count,
    avgMapMastery: row.avg_map_mastery ?? null,
    avgAssessmentScore: row.avg_assessment_score ?? null,
    assignedAttempts: row.assigned_attempts,
    completedAttempts: row.completed_attempts,
  }
}

function mapStudentRollup(row: StudentRollupRow): StudentRollup {
  return {
    studentId: row.student_id,
    studentName: row.student_name,
    username: row.username ?? null,
    mapMastery: row.map_mastery ?? null,
    subTopicsAttempted: row.sub_topics_attempted,
    subTopicsCompleted: row.sub_topics_completed,
    lastPracticeAt: row.last_practice_at ?? null,
    assignedCount: row.assigned_count,
    completedCount: row.completed_count,
    avgAssessmentScore: row.avg_assessment_score ?? null,
    atRisk: row.at_risk,
  }
}

/**
 * Teacher/manager dashboard data. Everything is served by the SECURITY
 * DEFINER aggregation RPCs (P4a, reworked in P6a for classrooms) — the DB
 * scopes by role (teacher = classrooms they teach, manager = whole org), so
 * no arguments and no client-side aggregation are needed here.
 */
export const useStaffDashboardStore = defineStore('staffDashboard', () => {
  const classroomRollups = ref<ClassroomRollup[]>([])
  const studentRollups = ref<StudentRollup[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const atRiskCount = computed(() => studentRollups.value.filter((s) => s.atRisk).length)

  /** Average of per-student map mastery across students who have practiced; null when none. */
  const avgMapMastery = computed(() => {
    const scores = studentRollups.value
      .map((s) => s.mapMastery)
      .filter((score): score is number => score !== null)
    if (scores.length === 0) return null
    return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
  })

  /** Classroom grid + full student roster (scoped by role inside the RPCs). */
  async function fetchDashboard(): Promise<{ error: string | null }> {
    isLoading.value = true
    error.value = null

    try {
      const [classroomsResult, studentsResult] = await Promise.all([
        supabase.rpc('get_class_rollups'),
        supabase.rpc('get_student_rollups'),
      ])

      const firstError = classroomsResult.error ?? studentsResult.error
      if (firstError) throw firstError

      classroomRollups.value = (classroomsResult.data ?? []).map(mapClassroomRollup)
      studentRollups.value = (studentsResult.data ?? []).map(mapStudentRollup)

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchDashboardStats')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Roster of one classroom. Returned (not stored) — the dashboard's
   * classroom drill-down owns the lifetime of this data.
   */
  async function fetchClassroomStudents(
    classroomId: string,
  ): Promise<{ students: StudentRollup[]; error: string | null }> {
    try {
      const { data, error: fetchError } = await supabase.rpc('get_student_rollups', {
        p_classroom_id: classroomId,
      })

      if (fetchError) throw fetchError

      return { students: (data ?? []).map(mapStudentRollup), error: null }
    } catch (err) {
      return { students: [], error: handleError(err, 'failedFetchDashboardStats') }
    }
  }

  /**
   * Completion summary for one assessment (staff of the assessment's org).
   * Returned (not stored) — the results page owns the lifetime of this data.
   */
  async function fetchAssessmentCompletion(
    assessmentId: string,
  ): Promise<{ completion: AssessmentCompletion | null; error: string | null }> {
    try {
      const { data, error: fetchError } = await supabase.rpc('get_assessment_completion', {
        p_assessment_id: assessmentId,
      })

      if (fetchError) throw fetchError

      const raw = data as unknown as AssessmentCompletionJson
      return {
        completion: {
          assessmentId: raw.assessment_id,
          title: raw.title,
          status: raw.status,
          assignedCount: raw.assigned_count,
          completedCount: raw.completed_count,
          inProgressCount: raw.in_progress_count,
          avgScore: raw.avg_score ?? null,
          buckets: raw.buckets ?? {},
        },
        error: null,
      }
    } catch (err) {
      return { completion: null, error: handleError(err, 'failedFetchDashboardStats') }
    }
  }

  function $reset() {
    classroomRollups.value = []
    studentRollups.value = []
    isLoading.value = false
    error.value = null
  }

  return {
    classroomRollups,
    studentRollups,
    isLoading,
    error,
    atRiskCount,
    avgMapMastery,
    fetchDashboard,
    fetchClassroomStudents,
    fetchAssessmentCompletion,
    $reset,
  }
})
