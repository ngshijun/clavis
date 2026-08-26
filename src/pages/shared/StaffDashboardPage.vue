<script setup lang="ts">
import { h, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ColumnDef } from '@tanstack/vue-table'
import { useStaffDashboardStore, type ClassroomRollup } from '@/stores/staff-dashboard'
import { useAuthStore } from '@/stores/auth'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import {
  createStudentRollupColumns,
  formatRollupPercent,
  sortableHeader,
} from '@/lib/rollupColumns'
import { Loader2, School, Target, TriangleAlert, Users } from 'lucide-vue-next'
import { DataTable } from '@/components/ui/data-table'
import StatTile from '@/components/dashboard/StatTile.vue'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

const t = useT()
const router = useRouter()
const authStore = useAuthStore()
const dashboardStore = useStaffDashboardStore()
const { classroomId } = useActiveClassroom()

/**
 * This one page serves both of a manager's altitudes (decision 87) and a
 * teacher's single one, told apart by whether the route names a classroom.
 */
const isOrganizationView = computed(() => authStore.isManager && classroomId.value === null)

/**
 * The classroom table exists to COMPARE classrooms, which only the
 * institution-wide view does. Inside a classroom — a teacher always, a manager
 * once they step in — it would list the single row you are already looking at.
 */
const showClassrooms = computed(() => isOrganizationView.value)

watch(
  () => (isOrganizationView.value ? 'organization' : classroomId.value),
  async () => {
    const { error } = await dashboardStore.fetchDashboard(
      isOrganizationView.value
        ? { kind: 'organization' }
        : classroomId.value
          ? { kind: 'classroom', classroomId: classroomId.value }
          : null,
    )
    if (error) {
      toast.error(t.value.staff.dashboard.toastLoadFailed)
    }
  },
  { immediate: true },
)

/**
 * A classroom row NAVIGATES into that classroom rather than filtering this
 * page's student table in place. The classroom then owns the address bar, the
 * sidebar and the trail, so the drill-in is shareable and Back undoes it —
 * and its assessments are one click away instead of unreachable.
 */
function openClassroom(rollup: ClassroomRollup) {
  void router.push(`/manager/classrooms/${rollup.classroomId}/dashboard`)
}

// ── Classrooms table ─────────────────────────────
const classroomColumns = computed<ColumnDef<ClassroomRollup>[]>(() => [
  {
    accessorKey: 'classroomName',
    header: sortableHeader<ClassroomRollup>(() => t.value.staff.dashboard.classrooms.nameCol),
    cell: ({ row }) => h('div', { class: 'font-medium' }, row.original.classroomName),
  },
  {
    accessorKey: 'gradeLevelName',
    header: sortableHeader<ClassroomRollup>(() => t.value.staff.dashboard.classrooms.gradeCol),
    cell: ({ row }) => h('div', { class: 'text-muted-foreground' }, row.original.gradeLevelName),
  },
  {
    accessorKey: 'subjectName',
    header: sortableHeader<ClassroomRollup>(() => t.value.staff.dashboard.classrooms.subjectCol),
    cell: ({ row }) => h('div', { class: 'text-muted-foreground' }, row.original.subjectName),
  },
  {
    accessorKey: 'teacherCount',
    header: () => t.value.staff.dashboard.classrooms.teachersCol,
    cell: ({ row }) => h('div', { class: 'tabular-nums' }, row.original.teacherCount),
  },
  {
    accessorKey: 'studentCount',
    header: () => t.value.staff.dashboard.classrooms.studentsCol,
    cell: ({ row }) => h('div', { class: 'tabular-nums' }, row.original.studentCount),
  },
  {
    accessorKey: 'avgMapMastery',
    header: sortableHeader<ClassroomRollup>(() => t.value.staff.dashboard.classrooms.masteryCol),
    cell: ({ row }) =>
      h('div', { class: 'tabular-nums' }, formatRollupPercent(row.original.avgMapMastery)),
  },
  {
    id: 'completion',
    header: () => t.value.staff.dashboard.classrooms.completionCol,
    // Meter: primary fill on a lighter step of the same hue (dataviz meter spec).
    cell: ({ row }) => {
      const { assignedAttempts, completedAttempts } = row.original
      if (assignedAttempts === 0) return h('div', { class: 'text-muted-foreground' }, '—')
      const percent = Math.min(100, Math.round((completedAttempts / assignedAttempts) * 100))
      return h('div', { class: 'flex items-center gap-2' }, [
        h('div', { class: 'h-2 w-20 rounded-sm bg-primary/15' }, [
          h('div', {
            class: 'h-full rounded-r-sm bg-primary',
            style: { width: `${percent}%` },
          }),
        ]),
        h(
          'span',
          { class: 'text-xs tabular-nums text-muted-foreground' },
          `${completedAttempts}/${assignedAttempts}`,
        ),
      ])
    },
  },
  {
    accessorKey: 'avgAssessmentScore',
    header: sortableHeader<ClassroomRollup>(() => t.value.staff.dashboard.classrooms.avgScoreCol),
    cell: ({ row }) =>
      h('div', { class: 'tabular-nums' }, formatRollupPercent(row.original.avgAssessmentScore)),
  },
])

// ── Students table (institution view only) ───────
const studentColumns = computed(() => createStudentRollupColumns())
</script>

<template>
  <div class="p-6">
    <!-- Loading State -->
    <div v-if="dashboardStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else class="space-y-8">
      <!-- KPI tiles -->
      <div
        class="grid gap-4 md:grid-cols-2"
        :class="showClassrooms ? 'lg:grid-cols-4' : 'lg:grid-cols-3'"
      >
        <StatTile
          v-if="showClassrooms"
          :label="t.staff.dashboard.tiles.classrooms"
          :value="dashboardStore.classroomRollups.length"
          :icon="School"
        />
        <StatTile
          :label="t.staff.dashboard.tiles.students"
          :value="dashboardStore.studentRollups.length"
          :icon="Users"
        />
        <StatTile
          :label="t.staff.dashboard.tiles.atRisk"
          :value="dashboardStore.atRiskCount"
          :icon="TriangleAlert"
          :subtitle="t.staff.dashboard.tiles.atRiskHint"
          :tone="dashboardStore.atRiskCount > 0 ? 'danger' : 'default'"
        />
        <StatTile
          :label="t.staff.dashboard.tiles.avgMastery"
          :value="formatRollupPercent(dashboardStore.avgMapMastery)"
          :icon="Target"
          :subtitle="t.staff.dashboard.tiles.avgMasteryHint"
        />
      </div>

      <!-- Classrooms (manager only — see showClassrooms) -->
      <section v-if="showClassrooms">
        <h2 class="mb-3 text-lg font-semibold">{{ t.staff.dashboard.classrooms.sectionTitle }}</h2>

        <div v-if="dashboardStore.classroomRollups.length === 0" class="py-10 text-center">
          <School class="mx-auto size-12 text-muted-foreground/50" />
          <p class="mt-3 text-muted-foreground">{{ t.staff.dashboard.classrooms.noClassrooms }}</p>
        </div>

        <DataTable
          v-else
          :columns="classroomColumns"
          :data="dashboardStore.classroomRollups"
          :on-row-click="openClassroom"
        />
      </section>

      <!-- The institution roster. Inside a classroom the roster has its own
           page (decision 87), so the dashboard there is the summary alone. -->
      <section v-if="isOrganizationView">
        <h2 class="mb-3 text-lg font-semibold">{{ t.staff.dashboard.students.sectionTitle }}</h2>

        <div v-if="dashboardStore.studentRollups.length === 0" class="py-10 text-center">
          <Users class="mx-auto size-12 text-muted-foreground/50" />
          <p class="mt-3 text-muted-foreground">{{ t.staff.dashboard.students.noStudents }}</p>
        </div>

        <DataTable
          v-else
          :columns="studentColumns"
          :data="dashboardStore.studentRollups"
          :initial-sorting="[{ id: 'atRisk', desc: true }]"
        />
      </section>
    </div>
  </div>
</template>
