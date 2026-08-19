import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { handleError } from '@/lib/errors'

export interface ScopedClassroom {
  id: string
  name: string
  gradeLevelId: string
  gradeLevelName: string
  subjectId: string
  subjectName: string
}

/** localStorage key — per user, so switching accounts on one device is clean. */
function storageKey(userId: string): string {
  return `clavis.classroom-scope.${userId}`
}

/**
 * The one classroom every non-admin surface is scoped to (decision 79).
 *
 * Students, teachers and managers all work inside exactly ONE classroom at a
 * time, chosen from the selector in the sidebar. There is deliberately no
 * "all classrooms" option: a classroom pins BOTH a grade level and a subject,
 * so the selection is what makes "which subject am I practising / teaching /
 * looking at" answerable on every page without a second filter.
 *
 * The candidate list needs no role branching — the `classrooms` SELECT policy
 * already returns exactly the right set per role (manager: own org; teacher:
 * classrooms they teach; student: classrooms they are enrolled in). Admins are
 * global and never scoped; they get no selector.
 */
export const useClassroomScopeStore = defineStore('classroom-scope', () => {
  const authStore = useAuthStore()

  const classrooms = ref<ScopedClassroom[]>([])
  const selectedId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  /** False until the first fetch settles, so pages can tell "empty" from "not yet loaded". */
  const isReady = ref(false)

  const selected = computed<ScopedClassroom | null>(
    () => classrooms.value.find((c) => c.id === selectedId.value) ?? null,
  )

  /** Scoping is meaningless for admins — they see the platform, not a classroom. */
  const appliesToCurrentUser = computed(
    () => authStore.isStudent || authStore.isTeacher || authStore.isManager,
  )

  /**
   * True once we know the user genuinely belongs to no classroom. Pages render
   * their "no classroom" empty state on this rather than on `!selected`, which
   * is also true while the first fetch is still in flight.
   */
  const hasNoClassrooms = computed(() => isReady.value && classrooms.value.length === 0)

  const gradeLevelId = computed(() => selected.value?.gradeLevelId ?? null)
  const subjectId = computed(() => selected.value?.subjectId ?? null)

  function select(classroomId: string) {
    if (!classrooms.value.some((c) => c.id === classroomId)) return
    selectedId.value = classroomId
    const userId = authStore.user?.id
    if (userId) localStorage.setItem(storageKey(userId), classroomId)
  }

  async function fetchClassrooms(): Promise<{ error: string | null }> {
    if (!appliesToCurrentUser.value) {
      isReady.value = true
      return { error: null }
    }

    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('classrooms')
        .select('id, name, grade_level_id, subject_id, grade_levels (name), subjects (name)')
        .order('name')

      if (fetchError) throw fetchError

      classrooms.value = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        gradeLevelId: row.grade_level_id,
        gradeLevelName: (row.grade_levels as { name: string } | null)?.name ?? '',
        subjectId: row.subject_id,
        subjectName: (row.subjects as { name: string } | null)?.name ?? '',
      }))

      restoreSelection()
      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchClassrooms')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
      isReady.value = true
    }
  }

  /**
   * Re-point the selection at a classroom that still exists. A remembered id
   * can go stale — the manager may have removed the user from that classroom,
   * or deleted it — in which case we silently fall back to the first one
   * rather than leaving every page scoped to nothing.
   */
  function restoreSelection() {
    const userId = authStore.user?.id
    const remembered = userId ? localStorage.getItem(storageKey(userId)) : null

    if (remembered && classrooms.value.some((c) => c.id === remembered)) {
      selectedId.value = remembered
      return
    }

    const first = classrooms.value[0] ?? null
    selectedId.value = first?.id ?? null
    if (userId && first) localStorage.setItem(storageKey(userId), first.id)
  }

  /** Drop everything on sign-out so the next account starts clean. */
  function reset() {
    classrooms.value = []
    selectedId.value = null
    error.value = null
    isReady.value = false
  }

  return {
    classrooms,
    selectedId,
    selected,
    isLoading,
    isReady,
    error,
    appliesToCurrentUser,
    hasNoClassrooms,
    gradeLevelId,
    subjectId,
    select,
    fetchClassrooms,
    reset,
  }
})
