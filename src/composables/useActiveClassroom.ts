import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useClassroomsStore } from '@/stores/classrooms'
import { useAuthStore } from '@/stores/auth'

/**
 * The classroom a teacher is currently working inside, read from the ROUTE
 * (decision 83) rather than from persisted global state.
 *
 * Google Classroom's model: you pick a class, and everything you then see
 * belongs to it. Putting the id in the path — `/teacher/classrooms/:id/…` —
 * is what makes a teacher's link shareable, the back button meaningful, and
 * "which class am I marking?" answerable from the address bar. With two
 * classrooms of the same grade AND subject (Group A / Group B), an invisible
 * selection was a genuine hazard.
 *
 * Authorization is NOT enforced here. A tampered id is rejected by the DB —
 * `classrooms` RLS only returns classrooms the teacher teaches, and
 * `get_student_rollups` raises for any other (the P6a verifier fixup). This
 * resolves against the teacher's own list purely so the UI can say "no such
 * classroom" instead of rendering an empty dashboard.
 */
export function useActiveClassroom() {
  const route = useRoute()
  const classroomsStore = useClassroomsStore()
  const authStore = useAuthStore()

  const classroomId = computed(() => {
    const param = route.params.classroomId
    return typeof param === 'string' && param.length > 0 ? param : null
  })

  const classroom = computed(() =>
    classroomId.value === null
      ? null
      : (classroomsStore.classrooms.find((item) => item.id === classroomId.value) ?? null),
  )

  /**
   * The route names a classroom this teacher cannot reach. Only meaningful
   * once the list has loaded — before that, `classroom` is null simply
   * because nothing has arrived yet.
   */
  const isUnknown = computed(
    () => classroomId.value !== null && classroomsStore.hasLoaded && classroom.value === null,
  )

  /**
   * Where this role's assessment surfaces live. A teacher's are nested under
   * the active classroom (decision 83); an admin's and a manager's are not.
   */
  const basePath = computed(() =>
    authStore.isTeacher && classroomId.value !== null
      ? `/teacher/classrooms/${classroomId.value}`
      : `/${authStore.userType}`,
  )

  return { classroomId, classroom, isUnknown, basePath }
}
