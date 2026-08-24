import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'
import router from '@/router'

export interface ScopedClassroom {
  id: string
  name: string
  gradeLevelId: string
  gradeLevelName: string
  subjectId: string
  subjectName: string
}

/**
 * The classroom currently in scope, and the list it is chosen from.
 *
 * The active classroom is DERIVED FROM THE URL (decision 83) — it is a path
 * segment, `/{role}/classrooms/:classroomId/…`, not a persisted selection.
 * There is no setter here on purpose: switching classroom means navigating,
 * so the address bar can never disagree with what is on screen, links are
 * shareable, and Back undoes a switch.
 *
 * Reading `router.currentRoute` rather than `useRoute()` is what lets this be
 * consumed from other STORES (practice-history filters by the scoped subject),
 * not just from components.
 *
 * The candidate list needs no role branching — the `classrooms` SELECT policy
 * already returns exactly the right set per role. Note it is a deliberately
 * light projection: a student's `classroom_students(count)` is RLS-filtered
 * down to themselves, so any count read here would be a lie.
 */
export const useClassroomScopeStore = defineStore('classroom-scope', () => {
  const classrooms = ref<ScopedClassroom[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  /** False until the first fetch settles, so pages can tell "empty" from "not yet loaded". */
  const isReady = ref(false)

  /** The `:classroomId` segment of the current route, or null outside one. */
  const activeId = computed(() => {
    const param = router.currentRoute.value.params.classroomId
    return typeof param === 'string' && param.length > 0 ? param : null
  })

  const active = computed<ScopedClassroom | null>(
    () => classrooms.value.find((item) => item.id === activeId.value) ?? null,
  )

  /**
   * True once we know the user genuinely belongs to no classroom. Pages render
   * their "no classroom" empty state on this rather than on `!active`, which
   * is also true while the first fetch is still in flight.
   */
  const hasNoClassrooms = computed(() => isReady.value && classrooms.value.length === 0)

  /** The route names a classroom this user cannot reach. */
  const isUnknown = computed(
    () => activeId.value !== null && isReady.value && active.value === null,
  )

  const gradeLevelId = computed(() => active.value?.gradeLevelId ?? null)
  const subjectId = computed(() => active.value?.subjectId ?? null)

  async function fetchClassrooms(): Promise<{ error: string | null }> {
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
   * Named `$reset` so the pinia reset plugin picks it up on sign-out. A setup
   * store's default `$reset` throws, so a plain `reset()` was registered by
   * the plugin and then failed every time.
   */
  function $reset() {
    classrooms.value = []
    isLoading.value = false
    error.value = null
    isReady.value = false
  }

  return {
    classrooms,
    isLoading,
    error,
    isReady,
    activeId,
    active,
    hasNoClassrooms,
    isUnknown,
    gradeLevelId,
    subjectId,
    fetchClassrooms,
    $reset,
  }
})
