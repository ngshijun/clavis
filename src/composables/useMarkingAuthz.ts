import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useAssessmentsStore } from '@/stores/assessments'
import { useClassroomsStore } from '@/stores/classrooms'

/**
 * Client mirror of the P9b marking/release authorization
 * (`app.can_mark_assessment`, P9B-HANDOFF §3): admin and org managers always;
 * a teacher only when the assessment is assigned to a classroom they teach,
 * or directly to a student they share a classroom with. Used to decide
 * whether to SHOW the "Release answers" action and the marking inputs — the
 * RPCs re-enforce the same matrix server-side.
 */
export function useMarkingAuthz() {
  const authStore = useAuthStore()
  const assessmentsStore = useAssessmentsStore()
  const classroomsStore = useClassroomsStore()

  /**
   * Load what the teacher branch needs: the assessment's assignments plus the
   * caller's classrooms and shared-classroom students (both RLS-scoped to the
   * teacher). Admin/manager short-circuit — no extra reads.
   */
  async function loadMarkingAuthz(assessmentId: string): Promise<void> {
    if (!authStore.isTeacher) return
    await Promise.all([
      assessmentsStore.fetchAssignments(assessmentId),
      classroomsStore.fetchClassrooms(),
      classroomsStore.fetchTeacherStudents(),
    ])
  }

  const canMark = computed(() => {
    if (authStore.isAdmin || authStore.isManager) return true
    if (!authStore.isTeacher) return false

    const classroomIds = new Set(classroomsStore.classrooms.map((classroom) => classroom.id))
    const studentIds = new Set(classroomsStore.teacherStudents.map((student) => student.id))
    return assessmentsStore.currentAssignments.some(
      (assignment) =>
        (assignment.classroomId !== null && classroomIds.has(assignment.classroomId)) ||
        (assignment.studentId !== null && studentIds.has(assignment.studentId)),
    )
  })

  return { canMark, loadMarkingAuthz }
}
