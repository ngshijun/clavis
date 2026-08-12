import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'

export interface AdminStudent {
  id: string
  name: string
  email: string
  dateOfBirth: string | null
  joinedAt: string | null
  gradeLevelName: string | null
}

export const useAdminStudentsStore = defineStore('adminStudents', () => {
  const authStore = useAuthStore()

  // Students list state
  const students = ref<AdminStudent[]>([])
  const isLoadingStudents = ref(false)
  const studentsError = ref<string | null>(null)

  // Students table filter state
  const studentsFilters = ref({
    search: '',
  })

  // Students table pagination state
  const studentsPagination = ref({
    pageIndex: 0,
    pageSize: 10,
  })

  /**
   * Fetch all students with joined data
   */
  async function fetchAllStudents(): Promise<{ error: string | null }> {
    if (!authStore.user || !authStore.isAdmin) {
      return { error: errorMessages().notAuthenticatedAsAdmin }
    }

    isLoadingStudents.value = true
    studentsError.value = null

    try {
      const BATCH_SIZE = 1000

      const selectQuery = `
          id,
          email,
          name,
          date_of_birth,
          created_at,
          student_profiles!student_profiles_id_fkey (
            grade_levels (
              name
            )
          )
        `

      const { data: firstBatch, error: firstError } = await supabase
        .from('profiles')
        .select(selectQuery)
        .eq('user_type', 'student')
        .order('name')
        .range(0, BATCH_SIZE - 1)

      if (firstError) throw firstError
      const allRows = [...(firstBatch ?? [])]

      let hasMore = (firstBatch?.length ?? 0) === BATCH_SIZE
      let from = BATCH_SIZE
      while (hasMore) {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select(selectQuery)
          .eq('user_type', 'student')
          .order('name')
          .range(from, from + BATCH_SIZE - 1)

        if (fetchError) throw fetchError
        allRows.push(...(data ?? []))
        hasMore = (data?.length ?? 0) === BATCH_SIZE
        from += BATCH_SIZE
      }

      // Transform the data
      students.value = allRows.map((student) => {
        const studentProfile = student.student_profiles as {
          grade_levels: { name: string } | null
        } | null

        return {
          id: student.id,
          name: student.name ?? 'Unknown',
          email: student.email ?? '',
          dateOfBirth: student.date_of_birth,
          joinedAt: student.created_at,
          gradeLevelName: studentProfile?.grade_levels?.name ?? null,
        }
      })

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchStudents')
      studentsError.value = message
      return { error: message }
    } finally {
      isLoadingStudents.value = false
    }
  }

  /**
   * Get a student by ID from the loaded students
   */
  function getStudentById(studentId: string): AdminStudent | undefined {
    return students.value.find((s) => s.id === studentId)
  }

  // Filtered students computed (applies search filter)
  const filteredStudents = computed(() => {
    const searchQuery = studentsFilters.value.search.toLowerCase().trim()
    if (!searchQuery) return students.value

    return students.value.filter(
      (student) =>
        student.name.toLowerCase().includes(searchQuery) ||
        student.email.toLowerCase().includes(searchQuery),
    )
  })

  // Students filter setters
  function setStudentsSearch(value: string) {
    studentsFilters.value.search = value
    // Reset pagination when search changes
    studentsPagination.value.pageIndex = 0
  }

  // Students pagination setters
  function setStudentsPageIndex(value: number) {
    studentsPagination.value.pageIndex = value
  }

  function setStudentsPageSize(value: number) {
    studentsPagination.value.pageSize = value
    studentsPagination.value.pageIndex = 0
  }

  // Reset store state
  function $reset() {
    students.value = []
    isLoadingStudents.value = false
    studentsError.value = null
    studentsFilters.value = { search: '' }
    studentsPagination.value = { pageIndex: 0, pageSize: 10 }
  }

  return {
    // State
    students,
    isLoadingStudents,
    studentsError,

    // Computed
    filteredStudents,

    // Students filters
    studentsFilters,
    setStudentsSearch,

    // Students pagination
    studentsPagination,
    setStudentsPageIndex,
    setStudentsPageSize,

    // Actions
    fetchAllStudents,
    getStudentById,
    $reset,
  }
})
