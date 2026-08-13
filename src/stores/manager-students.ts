import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'

export interface ManagedStudent {
  id: string
  name: string
  username: string | null
  gradeLevelName: string | null
  joinedAt: string | null
}

/**
 * The student accounts of the signed-in manager's organization (decision 46:
 * the manager provisions students). RLS already scopes the read to the org.
 */
export const useManagerStudentsStore = defineStore('managerStudents', () => {
  const authStore = useAuthStore()

  const students = ref<ManagedStudent[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const filters = ref({ search: '' })
  const pagination = ref({ pageIndex: 0, pageSize: 10 })

  const filteredStudents = computed(() => {
    const query = filters.value.search.toLowerCase().trim()
    if (!query) return students.value

    return students.value.filter(
      (student) =>
        student.name.toLowerCase().includes(query) ||
        (student.username?.toLowerCase().includes(query) ?? false),
    )
  })

  async function fetchStudents(): Promise<{ error: string | null }> {
    if (!authStore.isManager || !authStore.organizationId) {
      return { error: errorMessages().notAuthenticated }
    }

    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase.from('student_profiles').select(
        `
          id,
          username,
          grade_levels (name),
          profiles!student_profiles_id_fkey (name, created_at)
        `,
      )

      if (fetchError) throw fetchError

      students.value = (data ?? [])
        .map((student) => {
          const profile = student.profiles as { name: string; created_at: string | null } | null
          return {
            id: student.id,
            name: profile?.name ?? '',
            username: student.username,
            gradeLevelName: (student.grade_levels as { name: string } | null)?.name ?? null,
            joinedAt: profile?.created_at ?? null,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchStudents')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  function setSearch(value: string) {
    filters.value.search = value
    pagination.value.pageIndex = 0
  }

  function setPageIndex(value: number) {
    pagination.value.pageIndex = value
  }

  function setPageSize(value: number) {
    pagination.value.pageSize = value
    pagination.value.pageIndex = 0
  }

  function $reset() {
    students.value = []
    isLoading.value = false
    error.value = null
    filters.value = { search: '' }
    pagination.value = { pageIndex: 0, pageSize: 10 }
  }

  return {
    students,
    isLoading,
    error,
    filteredStudents,
    filters,
    setSearch,
    pagination,
    setPageIndex,
    setPageSize,
    fetchStudents,
    $reset,
  }
})
