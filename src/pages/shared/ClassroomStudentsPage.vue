<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useStaffDashboardStore, type StudentRollup } from '@/stores/staff-dashboard'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { createStudentRollupColumns } from '@/lib/rollupColumns'
import { Input } from '@/components/ui/input'
import { DataTable } from '@/components/ui/data-table'
import { Loader2, Search, Users } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

/**
 * The classroom's roster: every student with their mastery, practice reach and
 * assessment completion, and the door to one student's record.
 *
 * It reads the same `get_student_rollups(classroom)` the classroom dashboard
 * loads for its tiles, so the two never disagree — the dashboard counts this
 * list, and this page is the list.
 */
const t = useT()
const router = useRouter()
const dashboardStore = useStaffDashboardStore()
const { classroomId, basePath } = useActiveClassroom()

const search = ref('')

watch(
  classroomId,
  async (id) => {
    if (!id) return
    const { error } = await dashboardStore.fetchDashboard({ kind: 'classroom', classroomId: id })
    if (error) toast.error(t.value.staff.dashboard.toastLoadFailed)
  },
  { immediate: true },
)

const students = computed(() => {
  const query = search.value.toLowerCase().trim()
  if (!query) return dashboardStore.studentRollups
  return dashboardStore.studentRollups.filter(
    (student) =>
      student.studentName.toLowerCase().includes(query) ||
      (student.username ?? '').toLowerCase().includes(query),
  )
})

const columns = computed(() => createStudentRollupColumns())

function openStudent(student: StudentRollup) {
  router.push(`${basePath.value}/students/${student.studentId}`)
}
</script>

<template>
  <div class="p-6">
    <div v-if="dashboardStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <div class="mb-4">
        <div class="relative w-[400px] max-w-full">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="search"
            :placeholder="t.staff.classroomStudents.searchPlaceholder"
            class="pl-9"
          />
        </div>
      </div>

      <div v-if="students.length === 0" class="py-16 text-center">
        <Users class="mx-auto size-16 text-muted-foreground/50" />
        <p class="mt-4 text-muted-foreground">
          {{
            search
              ? t.staff.classroomStudents.noneMatchSearch
              : t.staff.dashboard.students.noStudents
          }}
        </p>
      </div>

      <DataTable
        v-else
        :columns="columns"
        :data="students"
        :on-row-click="openStudent"
        :initial-sorting="[{ id: 'atRisk', desc: true }]"
      />
    </template>
  </div>
</template>
