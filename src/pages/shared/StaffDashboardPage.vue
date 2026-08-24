<script setup lang="ts">
import { ref, h, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ColumnDef, HeaderContext } from '@tanstack/vue-table'
import {
  useStaffDashboardStore,
  type ClassroomRollup,
  type StudentRollup,
} from '@/stores/staff-dashboard'
import { useAuthStore } from '@/stores/auth'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { ArrowUpDown, Loader2, School, Target, TriangleAlert, Users, X } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import StatTile from '@/components/dashboard/StatTile.vue'
import { toast } from 'vue-sonner'
import { formatTimeAgo } from '@/lib/date'
import { useT } from '@/composables/useT'

const t = useT()
const router = useRouter()
const authStore = useAuthStore()
const dashboardStore = useStaffDashboardStore()
const { classroomId, classroom, isUnknown } = useActiveClassroom()

const subtitle = computed(() => {
  // A teacher's dashboard names the classroom it belongs to — the URL says
  // which one, and so should the page.
  if (authStore.isTeacher) return classroom.value?.name ?? t.value.staff.dashboard.subtitleTeacher
  const organizationName = authStore.user?.organizationName
  return organizationName
    ? t.value.staff.dashboard.subtitleManager(organizationName)
    : t.value.staff.dashboard.subtitleManagerFallback
})

// ── Classroom drill-down ─────────────────────────
const selectedClassroom = ref<ClassroomRollup | null>(null)
const classroomStudents = ref<StudentRollup[]>([])
const isLoadingClassroomStudents = ref(false)

/**
 * A manager's dashboard is the whole institution (decision 82) and never
 * changes scope, so it loads once. A teacher's belongs to the classroom in the
 * URL (decision 83) and reloads whenever that segment changes.
 */
watch(
  () => (authStore.isManager ? 'organization' : classroomId.value),
  async () => {
    selectedClassroom.value = null
    const { error } = await dashboardStore.fetchDashboard(
      authStore.isManager
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

async function selectClassroom(rollup: ClassroomRollup) {
  selectedClassroom.value = rollup
  isLoadingClassroomStudents.value = true

  const { students, error } = await dashboardStore.fetchClassroomStudents(rollup.classroomId)
  isLoadingClassroomStudents.value = false

  if (error) {
    toast.error(t.value.staff.dashboard.toastLoadFailed)
    selectedClassroom.value = null
    return
  }
  classroomStudents.value = students
}

function clearSelectedClassroom() {
  selectedClassroom.value = null
  classroomStudents.value = []
}

const displayedStudents = computed(() =>
  selectedClassroom.value ? classroomStudents.value : dashboardStore.studentRollups,
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
  ...(authStore.isManager
    ? [
        {
          accessorKey: 'teacherCount',
          header: () => t.value.staff.dashboard.classrooms.teachersCol,
          cell: ({ row }) => h('div', { class: 'tabular-nums' }, row.original.teacherCount),
        } satisfies ColumnDef<ClassroomRollup>,
      ]
    : []),
  {
    accessorKey: 'studentCount',
    header: () => t.value.staff.dashboard.classrooms.studentsCol,
    cell: ({ row }) => h('div', { class: 'tabular-nums' }, row.original.studentCount),
  },
  {
    accessorKey: 'avgMapMastery',
    header: sortableHeader<ClassroomRollup>(() => t.value.staff.dashboard.classrooms.masteryCol),
    cell: ({ row }) =>
      h('div', { class: 'tabular-nums' }, formatPercent(row.original.avgMapMastery)),
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
  <!-- The URL names a classroom this teacher cannot reach (decision 83).
       Authorization already happened in the DB; this is just an honest page
       instead of a dashboard full of zeroes. -->
  <div v-if="isUnknown" class="p-6">
    <div class="py-16 text-center">
      <School class="mx-auto size-16 text-muted-foreground/50" />
      <p class="mt-4 text-muted-foreground">{{ t.staff.classroomPicker.unknown }}</p>
      <Button variant="outline" class="mt-4" @click="router.push('/teacher/classrooms')">
        {{ t.staff.classroomPicker.backToPicker }}
      </Button>
    </div>
  </div>

  <div v-else class="p-6">
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
          :value="formatPercent(dashboardStore.avgMapMastery)"
          :icon="Target"
          :subtitle="t.staff.dashboard.tiles.avgMasteryHint"
        />
      </div>

      <!-- Classrooms -->
      <section>
        <h2 class="mb-3 text-lg font-semibold">{{ t.staff.dashboard.classrooms.sectionTitle }}</h2>

        <div v-if="dashboardStore.classroomRollups.length === 0" class="py-10 text-center">
          <School class="mx-auto size-12 text-muted-foreground/50" />
          <p class="mt-3 text-muted-foreground">{{ t.staff.dashboard.classrooms.noClassrooms }}</p>
        </div>

        <DataTable
          v-else
          :columns="classroomColumns"
          :data="dashboardStore.classroomRollups"
          :on-row-click="selectClassroom"
        />
      </section>

      <!-- Students -->
      <section>
        <div class="mb-3 flex items-center gap-3">
          <h2 class="text-lg font-semibold">{{ t.staff.dashboard.students.sectionTitle }}</h2>
          <Badge v-if="selectedClassroom" variant="outline" class="gap-1">
            {{ t.staff.dashboard.students.classroomFilter(selectedClassroom.classroomName) }}
            <button
              type="button"
              class="ml-1 rounded-sm hover:text-foreground"
              :aria-label="t.staff.dashboard.students.clearClassroomFilter"
              @click="clearSelectedClassroom"
            >
              <X class="size-3" />
            </button>
          </Badge>
        </div>

        <div v-if="isLoadingClassroomStudents" class="flex items-center justify-center py-10">
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
