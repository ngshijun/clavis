import { computed } from 'vue'
import { useClassroomsStore } from '@/stores/classrooms'
import { useClassroomScopeStore } from '@/stores/classroom-scope'
import { useAuthStore } from '@/stores/auth'

/**
 * The classroom the current user is working inside, read from the ROUTE
 * (decision 83) rather than from persisted global state.
 *
 * Google Classroom's model: you pick a class, and everything you then see
 * belongs to it. Putting the id in the path — `/{role}/classrooms/:id/…` —
 * is what makes a link shareable, the back button meaningful, and "which
 * class am I looking at?" answerable from the address bar. With two
 * classrooms of the same grade AND subject (Group A / Group B), an invisible
 * selection was a genuine hazard.
 *
 * `classroomId` comes from the scope store, which derives it from the router
 * — one mechanism, so a component and a store can never disagree about which
 * classroom is active.
 *
 * Authorization is NOT enforced here. A tampered id is rejected by the DB —
 * `classrooms` RLS only returns classrooms the user belongs to, and
 * `get_student_rollups` raises for any other (the P6a verifier fixup). This
 * resolves against the user's own list purely so the UI can say "no such
 * classroom" instead of rendering an empty page.
 */
export function useActiveClassroom() {
  const scope = useClassroomScopeStore()
  const classroomsStore = useClassroomsStore()
  const authStore = useAuthStore()

  const classroomId = computed(() => scope.activeId)

  /**
   * Teachers resolve against `classrooms` (already loaded for their picker,
   * and it carries the roster counts); everyone else against the scope list.
   */
  const classroom = computed(() => {
    if (classroomId.value === null) return null
    if (authStore.isTeacher) {
      return classroomsStore.classrooms.find((item) => item.id === classroomId.value) ?? null
    }
    return scope.active
  })

  const isUnknown = computed(() => {
    if (classroomId.value === null) return false
    return authStore.isTeacher
      ? classroomsStore.hasLoaded && classroom.value === null
      : scope.isUnknown
  })

  /** Where this role's classroom-scoped pages live. */
  const basePath = computed(() =>
    classroomId.value === null
      ? `/${authStore.userType}`
      : `/${authStore.userType}/classrooms/${classroomId.value}`,
  )

  return { classroomId, classroom, isUnknown, basePath }
}
