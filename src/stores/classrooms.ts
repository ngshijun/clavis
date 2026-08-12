import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'

export interface ClassroomListItem {
  id: string
  name: string
  organizationId: string
  gradeLevelId: string
  gradeLevelName: string
  subjectId: string
  subjectName: string
  teacherCount: number
  studentCount: number
  createdAt: string
}

export interface ClassroomStudent {
  id: string
  name: string
  username: string | null
  gradeLevelName: string | null
}

export interface ClassroomTeacher {
  id: string
  name: string
  email: string
}

/**
 * Staff view of classrooms (grade + subject + name, decision 47). RLS scopes
 * reads: a manager sees every classroom in their organization, a teacher only
 * the classrooms they teach (`classroom_teachers`). Membership on both sides
 * is many-to-many; the manager assigns teachers and students via the
 * `classroom_teachers` / `classroom_students` join tables.
 *
 * Also holds the org-wide student roster used by the member picker and the
 * assignment dialog: ANY student in the organization can be added to a
 * classroom.
 */
export const useClassroomsStore = defineStore('classrooms', () => {
  const authStore = useAuthStore()

  const classrooms = ref<ClassroomListItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const orgStudents = ref<ClassroomStudent[]>([])
  const isLoadingOrgStudents = ref(false)

  const filters = ref({ search: '' })
  const pagination = ref({ pageIndex: 0, pageSize: 10 })

  const filteredClassrooms = computed(() => {
    const query = filters.value.search.toLowerCase().trim()
    if (!query) return classrooms.value

    return classrooms.value.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.gradeLevelName.toLowerCase().includes(query) ||
        item.subjectName.toLowerCase().includes(query),
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

  async function fetchClassrooms(): Promise<{ error: string | null }> {
    const context = requireStaffContext()
    if (!context) return { error: errorMessages().notAuthenticated }

    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('classrooms')
        .select(
          `
          id,
          name,
          organization_id,
          grade_level_id,
          subject_id,
          created_at,
          grade_levels (name),
          subjects (name),
          classroom_teachers (count),
          classroom_students (count)
        `,
        )
        .order('name')

      if (fetchError) throw fetchError

      classrooms.value = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        organizationId: row.organization_id,
        gradeLevelId: row.grade_level_id,
        gradeLevelName: (row.grade_levels as { name: string } | null)?.name ?? '',
        subjectId: row.subject_id,
        subjectName: (row.subjects as { name: string } | null)?.name ?? '',
        teacherCount: (row.classroom_teachers as { count: number }[])[0]?.count ?? 0,
        studentCount: (row.classroom_students as { count: number }[])[0]?.count ?? 0,
        createdAt: row.created_at,
      }))

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchClassrooms')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  /** Create a classroom (manager only — RLS requires `created_by = self`). */
  async function createClassroom(input: {
    name: string
    gradeLevelId: string
    subjectId: string
  }): Promise<{ error: string | null }> {
    const context = requireStaffContext()
    if (!context || !authStore.isManager) return { error: errorMessages().notAuthenticated }

    try {
      const { error: insertError } = await supabase.from('classrooms').insert({
        name: input.name,
        organization_id: context.organizationId,
        grade_level_id: input.gradeLevelId,
        subject_id: input.subjectId,
        created_by: context.userId,
      })

      if (insertError) throw insertError

      await fetchClassrooms()
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedCreateClassroom') }
    }
  }

  async function updateClassroom(
    id: string,
    input: { name: string; gradeLevelId: string; subjectId: string },
  ): Promise<{ error: string | null }> {
    try {
      const { error: updateError } = await supabase
        .from('classrooms')
        .update({
          name: input.name,
          grade_level_id: input.gradeLevelId,
          subject_id: input.subjectId,
        })
        .eq('id', id)

      if (updateError) throw updateError

      await fetchClassrooms()
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateClassroom') }
    }
  }

  async function deleteClassroom(id: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase.from('classrooms').delete().eq('id', id)

      if (deleteError) throw deleteError

      classrooms.value = classrooms.value.filter((c) => c.id !== id)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedDeleteClassroom') }
    }
  }

  /**
   * Students of one classroom. Returned (not stored) — the members dialog owns
   * the lifetime of this data.
   */
  async function fetchClassroomStudents(
    classroomId: string,
  ): Promise<{ students: ClassroomStudent[]; error: string | null }> {
    try {
      const { data, error: fetchError } = await supabase
        .from('classroom_students')
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
        .eq('classroom_id', classroomId)

      if (fetchError) throw fetchError

      const students = (data ?? [])
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

      return { students, error: null }
    } catch (err) {
      return { students: [], error: handleError(err, 'failedFetchClassroomMembers') }
    }
  }

  async function addClassroomStudents(
    classroomId: string,
    studentIds: string[],
  ): Promise<{ error: string | null }> {
    if (studentIds.length === 0) return { error: null }

    try {
      const { error: insertError } = await supabase
        .from('classroom_students')
        .insert(
          studentIds.map((studentId) => ({ classroom_id: classroomId, student_id: studentId })),
        )

      if (insertError) throw insertError

      const item = classrooms.value.find((c) => c.id === classroomId)
      if (item) item.studentCount += studentIds.length

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateClassroomMembers') }
    }
  }

  async function removeClassroomStudent(
    classroomId: string,
    studentId: string,
  ): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase
        .from('classroom_students')
        .delete()
        .eq('classroom_id', classroomId)
        .eq('student_id', studentId)

      if (deleteError) throw deleteError

      const item = classrooms.value.find((c) => c.id === classroomId)
      if (item && item.studentCount > 0) item.studentCount -= 1

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateClassroomMembers') }
    }
  }

  /**
   * Teachers of one classroom. Returned (not stored) — the members dialog owns
   * the lifetime of this data.
   */
  async function fetchClassroomTeachers(
    classroomId: string,
  ): Promise<{ teachers: ClassroomTeacher[]; error: string | null }> {
    try {
      const { data, error: fetchError } = await supabase
        .from('classroom_teachers')
        .select(
          `
          teacher_id,
          profiles!classroom_teachers_teacher_id_fkey (id, name, email)
        `,
        )
        .eq('classroom_id', classroomId)

      if (fetchError) throw fetchError

      const teachers = (data ?? [])
        .map((row) => {
          const teacher = row.profiles as { id: string; name: string; email: string } | null
          return {
            id: teacher?.id ?? row.teacher_id,
            name: teacher?.name ?? '',
            email: teacher?.email ?? '',
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      return { teachers, error: null }
    } catch (err) {
      return { teachers: [], error: handleError(err, 'failedFetchClassroomMembers') }
    }
  }

  async function addClassroomTeachers(
    classroomId: string,
    teacherIds: string[],
  ): Promise<{ error: string | null }> {
    if (teacherIds.length === 0) return { error: null }

    try {
      const { error: insertError } = await supabase
        .from('classroom_teachers')
        .insert(
          teacherIds.map((teacherId) => ({ classroom_id: classroomId, teacher_id: teacherId })),
        )

      if (insertError) throw insertError

      const item = classrooms.value.find((c) => c.id === classroomId)
      if (item) item.teacherCount += teacherIds.length

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateClassroomMembers') }
    }
  }

  async function removeClassroomTeacher(
    classroomId: string,
    teacherId: string,
  ): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase
        .from('classroom_teachers')
        .delete()
        .eq('classroom_id', classroomId)
        .eq('teacher_id', teacherId)

      if (deleteError) throw deleteError

      const item = classrooms.value.find((c) => c.id === classroomId)
      if (item && item.teacherCount > 0) item.teacherCount -= 1

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateClassroomMembers') }
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
    classrooms.value = []
    isLoading.value = false
    error.value = null
    orgStudents.value = []
    isLoadingOrgStudents.value = false
    filters.value = { search: '' }
    pagination.value = { pageIndex: 0, pageSize: 10 }
  }

  return {
    classrooms,
    isLoading,
    error,
    filteredClassrooms,
    orgStudents,
    isLoadingOrgStudents,
    filters,
    setSearch,
    pagination,
    setPageIndex,
    setPageSize,
    fetchClassrooms,
    createClassroom,
    updateClassroom,
    deleteClassroom,
    fetchClassroomStudents,
    addClassroomStudents,
    removeClassroomStudent,
    fetchClassroomTeachers,
    addClassroomTeachers,
    removeClassroomTeacher,
    fetchOrgStudents,
    $reset,
  }
})
