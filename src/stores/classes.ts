import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'

export interface ClassListItem {
  id: string
  name: string
  organizationId: string
  teacherId: string
  teacherName: string
  studentCount: number
  createdAt: string
}

export interface ClassStudent {
  id: string
  name: string
  username: string | null
  gradeLevelName: string | null
}

/**
 * Staff view of classes. Teachers see and manage their own classes; managers
 * see every class in their organization (RLS already scopes reads — the
 * teacher_id filter below expresses intent, not security).
 *
 * Also holds the org-wide student roster used by the class-member picker and
 * the assignment dialog: ANY student in the organization can be added to a
 * class (decision 24 — `created_by` scoping applies to provisioning only).
 */
export const useClassesStore = defineStore('classes', () => {
  const authStore = useAuthStore()

  const classes = ref<ClassListItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const orgStudents = ref<ClassStudent[]>([])
  const isLoadingOrgStudents = ref(false)

  const filters = ref({ search: '' })
  const pagination = ref({ pageIndex: 0, pageSize: 10 })

  const filteredClasses = computed(() => {
    const query = filters.value.search.toLowerCase().trim()
    if (!query) return classes.value

    return classes.value.filter(
      (item) =>
        item.name.toLowerCase().includes(query) || item.teacherName.toLowerCase().includes(query),
    )
  })

  function requireStaffContext(): { userId: string; organizationId: string } | null {
    const userId = authStore.user?.id
    const organizationId = authStore.organizationId
    if (!userId || !organizationId || (!authStore.isTeacher && !authStore.isManager)) {
      return null
    }
    return { userId, organizationId }
  }

  async function fetchClasses(): Promise<{ error: string | null }> {
    const context = requireStaffContext()
    if (!context) return { error: errorMessages().notAuthenticated }

    isLoading.value = true
    error.value = null

    try {
      let query = supabase
        .from('classes')
        .select(
          `
          id,
          name,
          organization_id,
          teacher_id,
          created_at,
          profiles!classes_teacher_id_fkey (name),
          class_members (count)
        `,
        )
        .order('name')

      if (authStore.isTeacher) {
        query = query.eq('teacher_id', context.userId)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError

      classes.value = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        organizationId: row.organization_id,
        teacherId: row.teacher_id,
        teacherName: (row.profiles as { name: string } | null)?.name ?? '',
        studentCount: (row.class_members as { count: number }[])[0]?.count ?? 0,
        createdAt: row.created_at,
      }))

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchClasses')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Create a class. Teachers always own the classes they create; a manager
   * must pick the teacher the class belongs to.
   */
  async function createClass(name: string, teacherId?: string): Promise<{ error: string | null }> {
    const context = requireStaffContext()
    if (!context) return { error: errorMessages().notAuthenticated }

    try {
      const { error: insertError } = await supabase.from('classes').insert({
        name,
        organization_id: context.organizationId,
        teacher_id: authStore.isTeacher ? context.userId : (teacherId ?? context.userId),
      })

      if (insertError) throw insertError

      await fetchClasses()
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedCreateClass') }
    }
  }

  async function renameClass(id: string, name: string): Promise<{ error: string | null }> {
    try {
      const { error: updateError } = await supabase.from('classes').update({ name }).eq('id', id)

      if (updateError) throw updateError

      const item = classes.value.find((c) => c.id === id)
      if (item) item.name = name
      classes.value.sort((a, b) => a.name.localeCompare(b.name))

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateClass') }
    }
  }

  async function deleteClass(id: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase.from('classes').delete().eq('id', id)

      if (deleteError) throw deleteError

      classes.value = classes.value.filter((c) => c.id !== id)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedDeleteClass') }
    }
  }

  /**
   * Members of one class. Returned (not stored) — the members dialog owns the
   * lifetime of this data.
   */
  async function fetchClassMembers(
    classId: string,
  ): Promise<{ members: ClassStudent[]; error: string | null }> {
    try {
      const { data, error: fetchError } = await supabase
        .from('class_members')
        .select(
          `
          student_id,
          student_profiles (
            id,
            username,
            grade_levels (name),
            profiles!student_profiles_id_fkey (name)
          )
        `,
        )
        .eq('class_id', classId)

      if (fetchError) throw fetchError

      const members = (data ?? [])
        .map((row) => {
          const student = row.student_profiles as {
            id: string
            username: string | null
            grade_levels: { name: string } | null
            profiles: { name: string } | null
          } | null
          return {
            id: student?.id ?? row.student_id,
            name: student?.profiles?.name ?? '',
            username: student?.username ?? null,
            gradeLevelName: student?.grade_levels?.name ?? null,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      return { members, error: null }
    } catch (err) {
      return { members: [], error: handleError(err, 'failedFetchClassMembers') }
    }
  }

  async function addClassMembers(
    classId: string,
    studentIds: string[],
  ): Promise<{ error: string | null }> {
    if (studentIds.length === 0) return { error: null }

    try {
      const { error: insertError } = await supabase
        .from('class_members')
        .insert(studentIds.map((studentId) => ({ class_id: classId, student_id: studentId })))

      if (insertError) throw insertError

      const item = classes.value.find((c) => c.id === classId)
      if (item) item.studentCount += studentIds.length

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateClassMembers') }
    }
  }

  async function removeClassMember(
    classId: string,
    studentId: string,
  ): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase
        .from('class_members')
        .delete()
        .eq('class_id', classId)
        .eq('student_id', studentId)

      if (deleteError) throw deleteError

      const item = classes.value.find((c) => c.id === classId)
      if (item && item.studentCount > 0) item.studentCount -= 1

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateClassMembers') }
    }
  }

  /**
   * Every student in the caller's organization (RLS scopes the read).
   * Cached — call sites can re-invoke with `force` after provisioning.
   */
  async function fetchOrgStudents(options?: { force?: boolean }): Promise<{
    error: string | null
  }> {
    if (orgStudents.value.length > 0 && !options?.force) return { error: null }

    isLoadingOrgStudents.value = true

    try {
      const { data, error: fetchError } = await supabase.from('student_profiles').select(
        `
          id,
          username,
          grade_levels (name),
          profiles!student_profiles_id_fkey (name)
        `,
      )

      if (fetchError) throw fetchError

      orgStudents.value = (data ?? [])
        .map((row) => ({
          id: row.id,
          name: (row.profiles as { name: string } | null)?.name ?? '',
          username: row.username,
          gradeLevelName: (row.grade_levels as { name: string } | null)?.name ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchOrgStudents') }
    } finally {
      isLoadingOrgStudents.value = false
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
    classes.value = []
    isLoading.value = false
    error.value = null
    orgStudents.value = []
    isLoadingOrgStudents.value = false
    filters.value = { search: '' }
    pagination.value = { pageIndex: 0, pageSize: 10 }
  }

  return {
    classes,
    isLoading,
    error,
    filteredClasses,
    orgStudents,
    isLoadingOrgStudents,
    filters,
    setSearch,
    pagination,
    setPageIndex,
    setPageSize,
    fetchClasses,
    createClass,
    renameClass,
    deleteClass,
    fetchClassMembers,
    addClassMembers,
    removeClassMember,
    fetchOrgStudents,
    $reset,
  }
})
