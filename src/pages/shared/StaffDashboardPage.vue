<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue'
import type { ColumnDef, HeaderContext } from '@tanstack/vue-table'
import {
  useStaffDashboardStore,
  type ClassRollup,
  type StudentRollup,
} from '@/stores/staff-dashboard'
import { useAuthStore } from '@/stores/auth'
import { ArrowUpDown, Loader2, School, Target, TriangleAlert, Users, X } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import StatTile from '@/components/dashboard/StatTile.vue'
import { toast } from 'vue-sonner'
import { formatTimeAgo } from '@/lib/date'
import { useT } from '@/composables/useT'

const t = useT()
const authStore = useAuthStore()
const dashboardStore = useStaffDashboardStore()

const subtitle = computed(() => {
  if (authStore.isTeacher) return t.value.staff.dashboard.subtitleTeacher
  const organizationName = authStore.user?.organizationName
  return organizationName
    ? t.value.staff.dashboard.subtitleManager(organizationName)
    : t.value.staff.dashboard.subtitleManagerFallback
})

onMounted(async () => {
  const { error } = await dashboardStore.fetchDashboard()
  if (error) {
    toast.error(t.value.staff.dashboard.toastLoadFailed)
  }
})

// ── Class drill-down ─────────────────────────────
const selectedClass = ref<ClassRollup | null>(null)
const classStudents = ref<StudentRollup[]>([])
const isLoadingClassStudents = ref(false)

async function selectClass(rollup: ClassRollup) {
  selectedClass.value = rollup
  isLoadingClassStudents.value = true

  const { students, error } = await dashboardStore.fetchClassStudents(rollup.classId)
  isLoadingClassStudents.value = false

  if (error) {
    toast.error(t.value.staff.dashboard.toastLoadFailed)
    selectedClass.value = null
    return
  }
  classStudents.value = students
}

function clearSelectedClass() {
  selectedClass.value = null
  classStudents.value = []
}

const displayedStudents = computed(() =>
  selectedClass.value ? classStudents.value : dashboardStore.studentRollups,
)

// ── Formatting helpers ───────────────────────────
function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

function sortableHeader<TData>(label: () => string) {
  return ({ column }: HeaderContext<TData, unknown>) =>
    h(
      Button,
      {
        variant: 'ghost',
        onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
      },
      () => [label(), h(ArrowUpDown, { class: 'ml-2 size-4' })],
    )
}

// ── Classes table ────────────────────────────────
const classColumns = computed<ColumnDef<ClassRollup>[]>(() => [
  {
    accessorKey: 'className',
    header: sortableHeader<ClassRollup>(() => t.value.staff.dashboard.classes.nameCol),
    cell: ({ row }) => h('div', { class: 'font-medium' }, row.original.className),
  },
  ...(authStore.isManager
    ? [
        {
          accessorKey: 'teacherName',
          header: () => t.value.staff.dashboard.classes.teacherCol,
          cell: ({ row }) => h('div', { class: 'text-muted-foreground' }, row.original.teacherName),
        } satisfies ColumnDef<ClassRollup>,
      ]
    : []),
  {
    accessorKey: 'studentCount',
    header: () => t.value.staff.dashboard.classes.studentsCol,
    cell: ({ row }) => h('div', { class: 'tabular-nums' }, row.original.studentCount),
  },
  {
    accessorKey: 'avgMapMastery',
    header: sortableHeader<ClassRollup>(() => t.value.staff.dashboard.classes.masteryCol),
    cell: ({ row }) =>
      h('div', { class: 'tabular-nums' }, formatPercent(row.original.avgMapMastery)),
  },
  {
    id: 'completion',
    header: () => t.value.staff.dashboard.classes.completionCol,
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
    header: sortableHeader<ClassRollup>(() => t.value.staff.dashboard.classes.avgScoreCol),
    cell: ({ row }) =>
      h('div', { class: 'tabular-nums' }, formatPercent(row.original.avgAssessmentScore)),
  },
])

// ── Students table ───────────────────────────────
const studentColumns = computed<ColumnDef<StudentRollup>[]>(() => [
  {
    accessorKey: 'studentName',
    header: sortableHeader<StudentRollup>(() => t.value.staff.dashboard.students.nameCol),
    cell: ({ row }) => h('div', { class: 'font-medium' }, row.original.studentName),
  },
  {
    accessorKey: 'username',
    header: () => t.value.staff.dashboard.students.usernameCol,
    cell: ({ row }) =>
      h('div', { class: 'font-mono text-muted-foreground' }, row.original.username ?? '-'),
  },
  {
    accessorKey: 'mapMastery',
    header: sortableHeader<StudentRollup>(() => t.value.staff.dashboard.students.masteryCol),
    cell: ({ row }) => h('div', { class: 'tabular-nums' }, formatPercent(row.original.mapMastery)),
  },
  {
    id: 'subTopics',
    header: () => t.value.staff.dashboard.students.subTopicsCol,
    cell: ({ row }) =>
      h(
        'div',
        { class: 'tabular-nums' },
        `${row.original.subTopicsCompleted}/${row.original.subTopicsAttempted}`,
      ),
  },
  {
    accessorKey: 'lastPracticeAt',
    header: sortableHeader<StudentRollup>(() => t.value.staff.dashboard.students.lastPracticeCol),
    cell: ({ row }) =>
      row.original.lastPracticeAt
        ? h('div', {}, formatTimeAgo(row.original.lastPracticeAt, t.value.shared.timeAgo))
        : h('div', { class: 'text-muted-foreground' }, t.value.staff.dashboard.students.never),
  },
  {
    id: 'assessments',
    header: () => t.value.staff.dashboard.students.assessmentsCol,
    cell: ({ row }) =>
      h(
        'div',
        { class: 'tabular-nums' },
        `${row.original.completedCount}/${row.original.assignedCount}`,
      ),
  },
  {
    accessorKey: 'avgAssessmentScore',
    header: sortableHeader<StudentRollup>(() => t.value.staff.dashboard.students.avgScoreCol),
    cell: ({ row }) =>
      h('div', { class: 'tabular-nums' }, formatPercent(row.original.avgAssessmentScore)),
  },
  {
    accessorKey: 'atRisk',
    header: sortableHeader<StudentRollup>(() => t.value.staff.dashboard.students.statusCol),
    cell: ({ row }) =>
      row.original.atRisk
        ? h(
            Badge,
            {
              variant: 'secondary',
              class: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
            },
            () => [
              h(TriangleAlert, { class: 'mr-1 size-3' }),
              t.value.staff.dashboard.students.atRisk,
            ],
          )
        : h(Badge, { variant: 'secondary' }, () => t.value.staff.dashboard.students.onTrack),
  },
])
</script>

<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold">{{ t.staff.dashboard.title }}</h1>
      <p class="text-muted-foreground">{{ subtitle }}</p>
    </div>

    <!-- Loading State -->
    <div v-if="dashboardStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else class="space-y-8">
      <!-- KPI tiles -->
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatTile
          :label="t.staff.dashboard.tiles.classes"
          :value="dashboardStore.classRollups.length"
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
          :value="formatPercent(dashboardStore.avgMapMastery)"
          :icon="Target"
          :subtitle="t.staff.dashboard.tiles.avgMasteryHint"
        />
      </div>

      <!-- Classes -->
      <section>
        <h2 class="mb-3 text-lg font-semibold">{{ t.staff.dashboard.classes.sectionTitle }}</h2>

        <div v-if="dashboardStore.classRollups.length === 0" class="py-10 text-center">
          <School class="mx-auto size-12 text-muted-foreground/50" />
          <p class="mt-3 text-muted-foreground">{{ t.staff.dashboard.classes.noClasses }}</p>
        </div>

        <DataTable
          v-else
          :columns="classColumns"
          :data="dashboardStore.classRollups"
          :on-row-click="selectClass"
        />
      </section>

      <!-- Students -->
      <section>
        <div class="mb-3 flex items-center gap-3">
          <h2 class="text-lg font-semibold">{{ t.staff.dashboard.students.sectionTitle }}</h2>
          <Badge v-if="selectedClass" variant="outline" class="gap-1">
            {{ t.staff.dashboard.students.classFilter(selectedClass.className) }}
            <button
              type="button"
              class="ml-1 rounded-sm hover:text-foreground"
              :aria-label="t.staff.dashboard.students.clearClassFilter"
              @click="clearSelectedClass"
            >
              <X class="size-3" />
            </button>
          </Badge>
        </div>

        <div v-if="isLoadingClassStudents" class="flex items-center justify-center py-10">
          <Loader2 class="size-6 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="displayedStudents.length === 0" class="py-10 text-center">
          <Users class="mx-auto size-12 text-muted-foreground/50" />
          <p class="mt-3 text-muted-foreground">{{ t.staff.dashboard.students.noStudents }}</p>
        </div>

        <DataTable
          v-else
          :columns="studentColumns"
          :data="displayedStudents"
          :initial-sorting="[{ id: 'atRisk', desc: true }]"
        />
      </section>
    </div>
  </div>
</template>
