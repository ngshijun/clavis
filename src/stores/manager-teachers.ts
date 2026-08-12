import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'

export interface ManagedTeacher {
  id: string
  name: string
  email: string
  joinedAt: string | null
}

/**
 * The teachers of the signed-in manager's organization.
 * RLS already scopes staff reads to the caller's org; the explicit
 * `organization_id` filter keeps the query honest about its intent.
 */
export const useManagerTeachersStore = defineStore('managerTeachers', () => {
  const authStore = useAuthStore()

  const teachers = ref<ManagedTeacher[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const filters = ref({ search: '' })
  const pagination = ref({ pageIndex: 0, pageSize: 10 })

  const filteredTeachers = computed(() => {
    const query = filters.value.search.toLowerCase().trim()
    if (!query) return teachers.value

    return teachers.value.filter(
      (teacher) =>
        teacher.name.toLowerCase().includes(query) || teacher.email.toLowerCase().includes(query),
    )
  })

  async function fetchTeachers(): Promise<{ error: string | null }> {
    const organizationId = authStore.organizationId
    if (!authStore.isManager || !organizationId) {
      return { error: errorMessages().notAuthenticated }
    }

    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, name, email, created_at')
        .eq('user_type', 'teacher')
        .eq('organization_id', organizationId)
        .order('name')

      if (fetchError) throw fetchError

      teachers.value = (data ?? []).map((teacher) => ({
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        joinedAt: teacher.created_at,
      }))

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchTeachers')
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
    teachers.value = []
    isLoading.value = false
    error.value = null
    filters.value = { search: '' }
    pagination.value = { pageIndex: 0, pageSize: 10 }
  }

  return {
    teachers,
    isLoading,
    error,
    filteredTeachers,
    filters,
    setSearch,
    pagination,
    setPageIndex,
    setPageSize,
    fetchTeachers,
    $reset,
  }
})
